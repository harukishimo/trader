import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { db, query } from "./db";
import { getBars } from "./market";
import {
  indicators,
  marketOpenUtc,
  maxDrawdown,
  positionSize,
  stale,
} from "./analysis";
import type {
  PaperAccount,
  PaperSummary,
  Holding,
  Instrument,
  Evaluation,
  Answers,
} from "./types";
export async function paperIssue(
  accountId: string,
  asOf: string,
): Promise<string | null> {
  const events = await query<{
    instrument_id: string;
    effective_date: string;
    kind: string;
  }>(
    "SELECT * FROM corporate_actions WHERE effective_date<=? ORDER BY effective_date",
    [asOf.slice(0, 10)],
  );
  for (const event of events) {
    const boundary = event.effective_date + "T00:00:00.000Z";
    const rows = await query<{ side: string; quantity: string }>(
      "SELECT side,quantity FROM fills WHERE account_id=? AND instrument_id=? AND occurred_at<?",
      [accountId, event.instrument_id, boundary],
    );
    const quantity = rows.reduce(
      (sum, row) =>
        sum.plus(new Decimal(row.quantity).mul(row.side === "buy" ? 1 : -1)),
      new Decimal(0),
    );
    const pending = await query(
      "SELECT id FROM orders WHERE account_id=? AND instrument_id=? AND status='pending' AND eligible_after<?",
      [accountId, event.instrument_id, boundary],
    );
    if (quantity.gt(0) || pending.length)
      return `${event.effective_date}の${event.kind === "split" ? "株式分割等の価格調整" : "配当"}を検出しました。この期間の模擬成績は検証対象外です。`;
  }
  return null;
}
export async function holdings(accountId: string): Promise<Holding[]> {
  const fills = await query<{
    instrument_id: string;
    side: string;
    quantity: string;
    price: string;
    fee: string;
  }>("SELECT * FROM fills WHERE account_id=? ORDER BY occurred_at,id", [
    accountId,
  ]);
  const map = new Map<string, { quantity: Decimal; cost: Decimal }>();
  for (const f of fills) {
    const h = map.get(f.instrument_id) ?? {
      quantity: new Decimal(0),
      cost: new Decimal(0),
    };
    const q = new Decimal(f.quantity);
    if (f.side === "buy") {
      h.quantity = h.quantity.plus(q);
      h.cost = h.cost.plus(q.mul(f.price)).plus(f.fee);
    } else {
      h.cost = h.quantity.isZero()
        ? new Decimal(0)
        : h.cost.mul(h.quantity.minus(q)).div(h.quantity);
      h.quantity = h.quantity.minus(q);
    }
    map.set(f.instrument_id, h);
  }
  return [...map]
    .filter(([, v]) => v.quantity.gt(0))
    .map(([instrument_id, h]) => ({
      instrument_id,
      quantity: h.quantity.toString(),
      cost: h.cost.toFixed(2),
    }));
}
export async function paperSummaries(
  asOf = new Date().toISOString(),
): Promise<PaperSummary[]> {
  const accounts = await query<PaperAccount>(
    "SELECT * FROM accounts ORDER BY created_at DESC",
  );
  const result: PaperSummary[] = [];
  for (const a of accounts) {
    const unavailableReason = await paperIssue(a.id, asOf);
    const hs = await holdings(a.id);
    let value = new Decimal(a.cash);
    let cost = new Decimal(0);
    for (const h of hs) {
      cost = cost.plus(h.cost);
      const b = (await getBars(h.instrument_id, asOf)).at(-1);
      if (b) value = value.plus(new Decimal(h.quantity).mul(b.close));
    }
    const curve = (
      await query<{ date: string; value: string }>(
        "SELECT date,value FROM equity WHERE account_id=? ORDER BY date",
        [a.id],
      )
    ).map((x) => ({ date: x.date, value: Number(x.value) }));
    result.push({
      ...a,
      holdings: hs,
      unavailableReason,
      equity: unavailableReason ? null : value.toFixed(2),
      pnl: unavailableReason ? null : value.minus(a.initial_cash).toFixed(2),
      realizedPnl: unavailableReason
        ? null
        : new Decimal(a.cash).minus(a.initial_cash).plus(cost).toFixed(2),
      unrealizedPnl: unavailableReason
        ? null
        : value.minus(a.cash).minus(cost).toFixed(2),
      maxDrawdown: maxDrawdown([
        Number(a.initial_cash),
        ...curve.map((x) => x.value),
      ]),
      curve,
      fills: await query<Record<string, unknown>>(
        "SELECT * FROM fills WHERE account_id=? ORDER BY occurred_at DESC",
        [a.id],
      ),
    });
  }
  return result;
}
export async function createAccounts(config: {
  name: string;
  cash: string;
  allocation: string;
  stopLoss: string;
  fee: string;
  slippage: string;
  origin: string;
}) {
  const now = new Date().toISOString();
  const statements = [0, 1].flatMap((use) => {
    const id = randomUUID();
    return [
      {
        sql: "INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          id,
          config.name + (use ? " + Jev" : " / 価格ルール"),
          config.cash,
          config.cash,
          config.allocation,
          config.stopLoss,
          config.fee,
          config.slippage,
          "active",
          use,
          config.origin,
          now,
        ],
      },
      {
        sql: "INSERT INTO ledger VALUES(?,?,?,?,?)",
        args: [randomUUID(), id, "initial-" + id, config.cash, now],
      },
      { sql: "INSERT INTO equity VALUES(?,?,?)", args: [id, now, config.cash] },
    ];
  });
  await db().batch(statements, "write");
}
export async function advancePaper(now = new Date()) {
  const accounts = await query<PaperAccount>(
    "SELECT * FROM accounts WHERE state='active'",
  );
  for (const a of accounts) {
    if (await paperIssue(a.id, now.toISOString())) {
      await db().execute({
        sql: "UPDATE accounts SET state='unsupported' WHERE id=?",
        args: [a.id],
      });
      continue;
    }
    const items = await query<Instrument>(
      "SELECT * FROM instruments WHERE origin=? AND (watched=1 OR id IN (SELECT instrument_id FROM fills WHERE account_id=?))",
      [a.origin, a.id],
    );
    // Fill only orders whose decisions predate an available market opening.
    const pending = await query<{
      id: string;
      instrument_id: string;
      side: string;
      quantity: string;
      eligible_after: string;
    }>("SELECT * FROM orders WHERE account_id=? AND status='pending'", [a.id]);
    for (const order of pending) {
      const bars = await getBars(order.instrument_id, now.toISOString());
      const bar = bars.find(
        (b) => marketOpenUtc(b.date) > order.eligible_after && b.volume > 0,
      );
      if (!bar) continue;
      const tx = await db().transaction("write");
      try {
        const rows = await tx.execute({
          sql: "SELECT * FROM orders WHERE id=? AND status='pending'",
          args: [order.id],
        });
        if (!rows.rows.length) {
          await tx.rollback();
          continue;
        }
        const account = (
          await tx.execute({
            sql: "SELECT cash FROM accounts WHERE id=?",
            args: [a.id],
          })
        ).rows[0];
        const price = new Decimal(bar.open).mul(
          new Decimal(1).plus(
            new Decimal(a.slippage_bps)
              .div(10000)
              .mul(order.side === "buy" ? 1 : -1),
          ),
        );
        const cost = price.mul(order.quantity);
        const fee = cost.mul(a.fee_bps).div(10000);
        const amount =
          order.side === "buy" ? cost.plus(fee).neg() : cost.minus(fee);
        const inventory = (
          await tx.execute({
            sql: "SELECT side,quantity FROM fills WHERE account_id=? AND instrument_id=?",
            args: [a.id, order.instrument_id],
          })
        ).rows.reduce(
          (total, f) =>
            total.plus(
              new Decimal(String(f.quantity)).mul(f.side === "buy" ? 1 : -1),
            ),
          new Decimal(0),
        );
        if (
          new Decimal(String(account.cash)).plus(amount).lt(0) ||
          (order.side === "sell" && inventory.lt(order.quantity))
        ) {
          await tx.execute({
            sql: "UPDATE orders SET status='rejected' WHERE id=?",
            args: [order.id],
          });
          await tx.commit();
          continue;
        }
        await tx.execute({
          sql: "INSERT INTO fills VALUES(?,?,?,?,?,?,?,?,?)",
          args: [
            randomUUID(),
            order.id,
            a.id,
            order.instrument_id,
            order.side,
            order.quantity,
            price.toFixed(4),
            fee.toFixed(4),
            marketOpenUtc(bar.date),
          ],
        });
        await tx.execute({
          sql: "INSERT INTO ledger VALUES(?,?,?,?,?)",
          args: [
            randomUUID(),
            a.id,
            order.id,
            amount.toFixed(4),
            marketOpenUtc(bar.date),
          ],
        });
        await tx.execute({
          sql: "UPDATE accounts SET cash=? WHERE id=?",
          args: [
            new Decimal(String(account.cash)).plus(amount).toFixed(4),
            a.id,
          ],
        });
        await tx.execute({
          sql: "UPDATE orders SET status='filled' WHERE id=?",
          args: [order.id],
        });
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally {
        tx.close();
      }
    }
    const summary = (await paperSummaries(now.toISOString())).find(
      (x) => x.id === a.id,
    )!;
    if (summary.equity === null) continue;
    const today = now.toISOString().slice(0, 10);
    const previous = await query<{ value: string }>(
      "SELECT value FROM equity WHERE account_id=? AND date<? ORDER BY date DESC LIMIT 1",
      [a.id, today],
    );
    const reference = previous[0]?.value ?? a.initial_cash;
    if (
      new Decimal(summary.equity)
        .div(reference)
        .minus(1)
        .mul(100)
        .lte(new Decimal(a.stop_loss).neg())
    ) {
      await db().execute({
        sql: "UPDATE accounts SET state='stopped' WHERE id=?",
        args: [a.id],
      });
      continue;
    }
    for (const item of items) {
      const bars = await getBars(item.id, now.toISOString());
      const last = bars.at(-1),
        stats = indicators(bars);
      if (!last || stats.sma20 === null || stale(last.date, now)) continue;
      const h = summary.holdings.find((x) => x.instrument_id === item.id);
      if (!h && !item.watched) continue;
      if (!h) {
        const issue = await query(
          "SELECT id FROM corporate_actions WHERE instrument_id=? AND effective_date>=? AND effective_date<=? LIMIT 1",
          [item.id, bars.at(-60)?.date ?? bars[0].date, last.date],
        );
        if (issue.length) continue;
      }
      const above = Number(last.close) > stats.sma20;
      if ((h && above) || (!h && !above)) continue;
      if (!h && a.use_jev) {
        const ev = (
          await query<Evaluation>(
            "SELECT * FROM evaluations WHERE instrument_id=? AND status='succeeded' AND completed_at<=? ORDER BY completed_at DESC LIMIT 1",
            [item.id, now.toISOString()],
          )
        )[0];
        if (
          !ev?.answer ||
          new Date(now).getTime() - Date.parse(ev.completed_at!) > 7 * 86400000
        )
          continue;
        const answer: Answers = JSON.parse(ev.answer);
        if (answer.direction.choice !== "positive") continue;
      }
      const pendingBuys = await query<{ instrument_id: string }>(
        "SELECT instrument_id FROM orders WHERE account_id=? AND side='buy' AND status='pending'",
        [a.id],
      );
      if (
        !h &&
        new Set([
          ...summary.holdings.map((x) => x.instrument_id),
          ...pendingBuys.map((x) => x.instrument_id),
        ]).size >= 5
      )
        continue;
      const outstanding = await query(
        "SELECT id FROM orders WHERE account_id=? AND instrument_id=? AND status=?",
        [a.id, item.id, "pending"],
      );
      if (outstanding.length) continue;
      const quantity =
        h?.quantity ??
        positionSize(
          summary.cash,
          last.close,
          a.max_allocation,
          item.lot,
          a.fee_bps,
        );
      if (new Decimal(quantity).lte(0)) continue;
      const side = h ? "sell" : "buy";
      await db().execute({
        sql: "INSERT OR IGNORE INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          a.id,
          item.id,
          side,
          quantity,
          "pending",
          now.toISOString(),
          last.date,
          `${a.id}:${item.id}:${side}:${last.date}`,
          now.toISOString(),
        ],
      });
    }
    await db().execute({
      sql: "INSERT INTO equity VALUES(?,?,?) ON CONFLICT(account_id,date) DO UPDATE SET value=excluded.value",
      args: [a.id, now.toISOString(), summary.equity],
    });
  }
}
