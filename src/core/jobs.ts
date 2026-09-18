import { randomUUID } from "node:crypto";
import { db, query } from "./db";
import { getBars, hash, refreshInstrument, syncMaster } from "./market";
import { indicators } from "./analysis";
import { evaluate, ProviderError, QUESTION_VERSION } from "./jev";
import { advancePaper } from "./paper";
import type {
  Alert,
  Evaluation,
  Instrument,
  Job,
  Snapshot,
  Answers,
} from "./types";
export async function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  key: string,
) {
  const now = new Date().toISOString(),
    id = randomUUID();
  await db().execute({
    sql: "INSERT OR IGNORE INTO jobs(id,kind,payload,dedupe_key,state,run_after,created_at) VALUES(?,?,?,?,?,?,?)",
    args: [id, kind, JSON.stringify(payload), key, "pending", now, now],
  });
  return (await query<Job>("SELECT * FROM jobs WHERE dedupe_key=?", [key]))[0];
}
export async function requestEvaluation(
  id: string,
  document: string,
  sourceUrl: string | null,
  permission: boolean,
  force = false,
) {
  const item = (
    await query<Instrument>("SELECT * FROM instruments WHERE id=?", [id])
  )[0];
  if (!item) throw new Error("商品が見つかりません。");
  const bars = await getBars(id);
  if (!bars.length) throw new Error("先に価格を取得してください。");
  if (document.trim().length < 10)
    throw new Error("評価する資料を10文字以上入力してください。");
  const snapshot: Snapshot = {
    instrument: {
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      origin: item.origin,
    },
    asOf: new Date().toISOString(),
    document,
    sourceUrl,
    bars: bars.slice(-60),
    indicators: indicators(bars),
    permission,
  };
  const model = process.env.TYPESAFE_MODEL || "jev-latest",
    origin = process.env.JEV_PROVIDER === "typesafe" ? "typesafe" : "mock";
  const key =
    hash(
      JSON.stringify({
        id,
        document,
        sourceUrl,
        bars: snapshot.bars,
        permission,
        model,
        origin,
        version: QUESTION_VERSION,
      }),
    ) + (force ? ":" + randomUUID() : "");
  const eid = randomUUID();
  await db().execute({
    sql: "INSERT OR IGNORE INTO evaluations(id,instrument_id,snapshot,question_version,model,origin,dedupe_key,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    args: [
      eid,
      id,
      JSON.stringify(snapshot),
      QUESTION_VERSION,
      model,
      origin,
      key,
      "pending",
      snapshot.asOf,
    ],
  });
  const ev = (
    await query<Evaluation>("SELECT * FROM evaluations WHERE dedupe_key=?", [
      key,
    ])
  )[0];
  const job = await enqueue(
    "evaluate",
    { evaluationId: ev.id },
    "evaluation:" + ev.id,
  );
  return { evaluationId: ev.id, job };
}
export async function checkAlerts() {
  const rules = await query<Alert>("SELECT * FROM alerts WHERE active=1");
  for (const r of rules) {
    const b = (await getBars(r.instrument_id)).at(-1);
    if (!b) continue;
    let hit = false;
    if (r.type === "above") hit = Number(b.close) >= Number(r.threshold);
    if (r.type === "below") hit = Number(b.close) <= Number(r.threshold);
    if (r.type === "positive") {
      const e = (
        await query<Evaluation>(
          "SELECT * FROM evaluations WHERE instrument_id=? AND status='succeeded' ORDER BY completed_at DESC LIMIT 1",
          [r.instrument_id],
        )
      )[0];
      if (e?.answer) {
        const a: Answers = JSON.parse(e.answer);
        hit =
          a.direction.choice === "positive" &&
          a.direction.confidence >= Number(r.threshold);
      }
    }
    const tx = await db().transaction("write");
    try {
      const current = (
        await tx.execute({
          sql: "SELECT triggered FROM alerts WHERE id=?",
          args: [r.id],
        })
      ).rows[0];
      if (hit && !current.triggered) {
        await tx.execute({
          sql: "INSERT INTO alert_events(id,rule_id,message,created_at,dedupe_key) VALUES(?,?,?,?,?)",
          args: [
            randomUUID(),
            r.id,
            `${r.instrument_id}：${r.type === "positive" ? "Jevの業績改善評価" : r.type === "above" ? "価格が設定値以上" : "価格が設定値以下"}（${r.threshold}）`,
            new Date().toISOString(),
            randomUUID(),
          ],
        });
      }
      await tx.execute({
        sql: "UPDATE alerts SET triggered=? WHERE id=?",
        args: [hit ? 1 : 0, r.id],
      });
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  }
}
export async function handleJob(job: Job) {
  const p = JSON.parse(job.payload);
  if (job.kind === "evaluate") {
    const e = (
      await query<Evaluation>("SELECT * FROM evaluations WHERE id=?", [
        p.evaluationId,
      ])
    )[0];
    if (!e) throw new Error("評価が見つかりません。");
    if (e.status === "succeeded") return;
    await db().execute({
      sql: "UPDATE evaluations SET status='running',error=NULL WHERE id=?",
      args: [e.id],
    });
    try {
      const r = await evaluate(JSON.parse(e.snapshot));
      await db().batch(
        [
          {
            sql: "UPDATE evaluations SET status='succeeded',answer=?,model=?,completed_at=?,error=NULL WHERE id=?",
            args: [
              JSON.stringify(r.answers),
              r.model,
              new Date().toISOString(),
              e.id,
            ],
          },
          {
            sql: "INSERT INTO attempts VALUES(?,?,?,?,?,?)",
            args: [
              randomUUID(),
              e.id,
              "succeeded",
              r.usage,
              null,
              new Date().toISOString(),
            ],
          },
        ],
        "write",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "評価に失敗しました。";
      await db().batch(
        [
          {
            sql: "UPDATE evaluations SET status='failed',error=? WHERE id=?",
            args: [message, e.id],
          },
          {
            sql: "INSERT INTO attempts VALUES(?,?,?,?,?,?)",
            args: [
              randomUUID(),
              e.id,
              "failed",
              0,
              message,
              new Date().toISOString(),
            ],
          },
        ],
        "write",
      );
      throw err;
    }
    await checkAlerts();
  } else if (job.kind === "refresh") {
    const item = (
      await query<Instrument>("SELECT * FROM instruments WHERE id=?", [
        p.instrumentId,
      ])
    )[0];
    if (!item) throw new Error("商品が見つかりません。");
    await refreshInstrument(item);
    await checkAlerts();
  } else if (job.kind === "master") {
    await syncMaster();
  } else if (job.kind === "paper") {
    await advancePaper();
  } else if (job.kind === "alerts") {
    await checkAlerts();
  } else throw new Error("未対応のジョブです。");
}
export async function runJobs(budgetMs = 45000) {
  const started = Date.now(),
    owner = randomUUID();
  let completed = 0;
  while (Date.now() - started < budgetMs) {
    const now = new Date().toISOString();
    const r = await db().execute({
      sql: `UPDATE jobs SET state='running',attempts=attempts+1,lease_owner=?,lease_until=? WHERE id=(SELECT id FROM jobs WHERE ((state IN ('pending','retry_wait') AND run_after<=?) OR (state='running' AND lease_until<?)) AND attempts<3 ORDER BY created_at LIMIT 1) RETURNING *`,
      args: [owner, new Date(Date.now() + 120000).toISOString(), now, now],
    });
    if (!r.rows.length) break;
    const job = r.rows[0] as unknown as Job;
    try {
      await handleJob(job);
      await db().execute({
        sql: "UPDATE jobs SET state='succeeded',lease_until=NULL,error=NULL WHERE id=? AND lease_owner=?",
        args: [job.id, owner],
      });
      completed++;
    } catch (e) {
      const retry =
        e instanceof ProviderError && e.retryable && job.attempts < 3;
      const delay =
        e instanceof ProviderError
          ? Math.max(e.retryAfter, Math.pow(2, job.attempts) * 5)
          : 0;
      await db().execute({
        sql: "UPDATE jobs SET state=?,run_after=?,lease_until=NULL,error=? WHERE id=? AND lease_owner=?",
        args: [
          retry ? "retry_wait" : "failed",
          new Date(Date.now() + delay * 1000).toISOString(),
          e instanceof Error ? e.message : "処理に失敗しました。",
          job.id,
          owner,
        ],
      });
    }
  }
  await db().execute({
    sql: "UPDATE jobs SET state='failed',error='再試行上限に達しました。' WHERE state='running' AND lease_until<? AND attempts>=3",
    args: [new Date().toISOString()],
  });
  await db().execute({
    sql: "INSERT INTO status VALUES('lastRun',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    args: [new Date().toISOString()],
  });
  return { completed };
}
export async function scheduleDaily() {
  const day = new Date().toISOString().slice(0, 10);
  const items = await query<Instrument>(
    "SELECT * FROM instruments WHERE watched=1",
  );
  for (const item of items)
    await enqueue(
      "refresh",
      { instrumentId: item.id },
      "daily:" + day + ":" + item.id,
    );
  await enqueue("paper", {}, "daily-paper:" + day);
  await enqueue("alerts", {}, "daily-alerts:" + day);
}
