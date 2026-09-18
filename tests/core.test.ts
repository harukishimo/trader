import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db, initialize, query, resetConnection } from "../src/core/db";
import {
  demoBars,
  parseCsv,
  saveBars,
  seed,
  getBars,
  recordCorporateAction,
} from "../src/core/market";
import { indicators, maxDrawdown, positionSize } from "../src/core/analysis";
import {
  answersSchema,
  evaluate,
  mockEvaluation,
  ProviderError,
} from "../src/core/jev";
import {
  requestEvaluation,
  runJobs,
  checkAlerts,
  enqueue,
} from "../src/core/jobs";
import {
  advancePaper,
  createAccounts,
  paperSummaries,
} from "../src/core/paper";
import type { Snapshot } from "../src/core/types";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "trader-test-"));
  process.env.DATABASE_URL = "file:" + join(dir, "test.db");
  process.env.APP_MODE = "demo";
  process.env.JEV_PROVIDER = "mock";
  delete process.env.VERCEL;
  resetConnection();
  await initialize();
  await seed();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetConnection();
  await rm(dir, { recursive: true, force: true });
});
const snapshot: Snapshot = {
  instrument: { id: "demo-1", name: "Test", symbol: "DM01", origin: "demo" },
  asOf: "2026-09-18T10:00:00Z",
  document: "業績予想を上方修正しました。",
  sourceUrl: null,
  bars: [],
  indicators: { sma20: null, sma60: null, change: null },
  permission: true,
};
describe("financial calculations and inputs", () => {
  it("respects lot sizes, fees and decimal precision", () => {
    expect(positionSize("1000000", "2500", "0.2", 100, "5")).toBe("0");
    expect(positionSize("1000000", "1000", "0.2", 100, "5")).toBe("100");
    expect(maxDrawdown([100, 120, 90, 110])).toBe(25);
  });
  it("rejects invalid bars and duplicates", () => {
    expect(() =>
      parseCsv("date,open,high,low,close,volume\n2026-01-01,100,90,95,105,10"),
    ).toThrow();
    expect(() =>
      parseCsv("date,open,high,low,close,volume\n2026-02-30,100,110,95,105,10"),
    ).toThrow();
    expect(() =>
      parseCsv(
        "date,open,high,low,close,volume\n2026-01-01,100,110,95,105,10\n2026-01-01,100,110,95,105,10",
      ),
    ).toThrow();
  });
  it("produces deterministic data and excludes future revisions", async () => {
    expect(demoBars(0, new Date("2026-09-18"))).toEqual(
      demoBars(0, new Date("2026-09-18")),
    );
    const b = (await getBars("demo-1")).at(-1)!;
    await saveBars(
      "demo-1",
      [{ ...b, close: "123", low: "100", receivedAt: "2099-01-01T00:00:00Z" }],
      "demo",
    );
    expect(
      (await getBars("demo-1", "2026-09-18T10:00:00Z")).at(-1)?.close,
    ).not.toBe("123");
    expect(indicators([]).sma20).toBeNull();
  });
});
describe("Jev and persistent jobs", () => {
  it("resumes market pagination within the same durable job", async () => {
    process.env.JQUANTS_API_KEY = "test-key";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ Code: "12340", CoName: "Page one" }],
          pagination_key: "second",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ Code: "56780", CoName: "Page two" }] }),
      );
    vi.stubGlobal("fetch", fetcher);
    const job = await enqueue("master", {}, "master-test");
    await runJobs();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("pagination_key=second");
    expect(
      await query("SELECT * FROM instruments WHERE origin='jquants'"),
    ).toHaveLength(2);
    expect(
      (
        await query<{ state: string }>("SELECT state FROM jobs WHERE id=?", [
          job.id,
        ])
      )[0].state,
    ).toBe("succeeded");
  });
  it("keeps paper jobs pending until their price dependencies complete", async () => {
    const dependency = await enqueue(
      "refresh",
      { instrumentId: "demo-1" },
      "dependency",
    );
    await db().execute({
      sql: "UPDATE jobs SET run_after='2099-01-01T00:00:00Z' WHERE id=?",
      args: [dependency.id],
    });
    const paper = await enqueue(
      "paper",
      { dependencies: [dependency.id] },
      "paper-dependency",
    );
    await runJobs();
    expect(
      (
        await query<{ state: string; attempts: number }>(
          "SELECT state,attempts FROM jobs WHERE id=?",
          [paper.id],
        )
      )[0],
    ).toEqual({ state: "pending", attempts: 0 });
    expect(await query("SELECT * FROM fills")).toHaveLength(0);
  });
  it("recovers expired worker and job leases", async () => {
    const { job } = await requestEvaluation(
      "demo-1",
      snapshot.document,
      null,
      true,
    );
    await db().execute(
      "INSERT INTO service_locks VALUES('worker','old','2000-01-01T00:00:00Z')",
    );
    await db().execute({
      sql: "UPDATE jobs SET state='running',attempts=1,lease_owner='old',lease_until='2000-01-01T00:00:00Z' WHERE id=?",
      args: [job.id],
    });
    await runJobs();
    expect(
      (
        await query<{ state: string }>("SELECT state FROM jobs WHERE id=?", [
          job.id,
        ])
      )[0].state,
    ).toBe("succeeded");
    expect(await query("SELECT * FROM service_locks")).toHaveLength(0);
  });
  it("records an attempt before HTTP and excludes concurrent workers", async () => {
    process.env.APP_MODE = "live";
    process.env.JEV_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.ALLOW_AI_DATA_TRANSFER = "true";
    let entered!: () => void;
    let respond!: (response: Response) => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const response = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        entered();
        return response;
      }),
    );
    await requestEvaluation("demo-1", snapshot.document, null, true);
    const worker = runJobs();
    await started;
    try {
      expect(
        (await query<{ status: string }>("SELECT status FROM attempts"))[0]
          .status,
      ).toBe("running");
      expect(await runJobs()).toEqual({ completed: 0, busy: true });
    } finally {
      respond(
        Response.json({ model: "jev-test", answers: mockEvaluation(snapshot) }),
      );
      await worker;
    }
    expect(await query("SELECT * FROM attempts")).toHaveLength(1);
  });
  it("does not retry authentication failures or accept missing questions", async () => {
    process.env.APP_MODE = "live";
    process.env.JEV_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.ALLOW_AI_DATA_TRANSFER = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    await requestEvaluation("demo-1", snapshot.document, null, true);
    await runJobs();
    expect(
      (
        await query<{ state: string; attempts: number }>(
          "SELECT state,attempts FROM jobs",
        )
      )[0],
    ).toEqual({ state: "failed", attempts: 1 });
    expect(
      answersSchema.safeParse({
        event_type: mockEvaluation(snapshot).event_type,
      }).success,
    ).toBe(false);
  });
  it("deduplicates evaluation requests and job execution", async () => {
    const first = await requestEvaluation(
      "demo-1",
      snapshot.document,
      null,
      true,
    );
    const second = await requestEvaluation(
      "demo-1",
      snapshot.document,
      null,
      true,
    );
    expect(first.evaluationId).toBe(second.evaluationId);
    await runJobs();
    await runJobs();
    const rows = await query<{
      status: string;
      origin: string;
      answer: string;
    }>("SELECT * FROM evaluations");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].origin).toBe("mock");
    expect(JSON.parse(rows[0].answer).direction.choice).toBe("positive");
    expect(await query("SELECT * FROM attempts")).toHaveLength(1);
  });
  it("creates an explicit new revision only on request", async () => {
    const a = await requestEvaluation("demo-1", snapshot.document, null, true);
    const b = await requestEvaluation(
      "demo-1",
      snapshot.document,
      null,
      true,
      true,
    );
    expect(a.evaluationId).not.toBe(b.evaluationId);
  });
  it("validates probability ranges and known choices", () => {
    const valid = mockEvaluation(snapshot);
    expect(answersSchema.safeParse(valid).success).toBe(true);
    expect(
      answersSchema.safeParse({
        ...valid,
        duplicate: { type: "noul", noul: 5 },
      }).success,
    ).toBe(false);
    expect(
      answersSchema.safeParse({
        ...valid,
        direction: { ...valid.direction, choice: "buy" },
      }).success,
    ).toBe(false);
  });
  it("calls the real HTTP contract without exposing credentials", async () => {
    process.env.APP_MODE = "live";
    process.env.JEV_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.ALLOW_AI_DATA_TRANSFER = "true";
    const mock = vi.fn().mockResolvedValue(
      Response.json({
        model: "jev-test",
        answers: mockEvaluation(snapshot),
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
    );
    vi.stubGlobal("fetch", mock);
    const r = await evaluate(snapshot);
    expect(r.usage).toBe(25);
    expect(mock.mock.calls[0][0]).toBe("https://api.typesafe.ai/v1/systemone");
    expect(
      JSON.parse(mock.mock.calls[0][1].body).questions.direction.type,
    ).toBe("choice");
  });
  it("records retries without claiming completion", async () => {
    process.env.APP_MODE = "live";
    process.env.JEV_PROVIDER = "typesafe";
    process.env.TYPESAFE_API_KEY = "test-key";
    process.env.ALLOW_AI_DATA_TRANSFER = "true";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("", { status: 429, headers: { "retry-after": "60" } }),
        ),
    );
    await requestEvaluation("demo-1", snapshot.document, null, true);
    await runJobs();
    const jobs = await query<{ state: string; attempts: number }>(
      "SELECT * FROM jobs",
    );
    expect(jobs[0].state).toBe("retry_wait");
    expect(jobs[0].attempts).toBe(1);
    expect(
      (await query<{ status: string }>("SELECT * FROM evaluations"))[0].status,
    ).toBe("failed");
  });
  it("denies external transfer without permission", async () => {
    process.env.APP_MODE = "live";
    process.env.JEV_PROVIDER = "typesafe";
    await expect(
      evaluate({ ...snapshot, permission: false }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
describe("alerts and paper accounting", () => {
  it("marks a pending order across a corporate action as unsupported", async () => {
    await createAccounts({
      name: "split",
      cash: "1000000",
      allocation: "0.2",
      stopLoss: "20",
      fee: "10",
      slippage: "10",
      origin: "demo",
    });
    const [a] = await query<{ id: string }>(
      "SELECT id FROM accounts WHERE use_jev=0",
    );
    await db().execute({
      sql: "INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)",
      args: [
        "split-order",
        a.id,
        "demo-1",
        "buy",
        "100",
        "pending",
        "2026-01-01T10:00:00Z",
        "2026-01-01",
        "split-order",
        "2026-01-01T10:00:00Z",
      ],
    });
    await recordCorporateAction(
      "demo-1",
      "2026-01-02",
      "split",
      "Fixture: 2-for-1",
    );
    await advancePaper(new Date("2026-01-02T12:00:00Z"));
    const account = (await paperSummaries()).find((x) => x.id === a.id)!;
    expect(account.state).toBe("unsupported");
    expect(account.equity).toBeNull();
    expect(account.pnl).toBeNull();
    expect(account.unavailableReason).toContain("検証対象外");
    expect(
      await query("SELECT * FROM fills WHERE account_id=?", [a.id]),
    ).toHaveLength(0);
  });
  it("rejects a sell without inventory and keeps cash unchanged", async () => {
    await createAccounts({
      name: "oversell",
      cash: "1000000",
      allocation: "0.2",
      stopLoss: "20",
      fee: "10",
      slippage: "10",
      origin: "demo",
    });
    const [account] = await query<{ id: string }>(
      "SELECT id FROM accounts WHERE use_jev=0",
    );
    await db().execute({
      sql: "INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)",
      args: [
        "oversell",
        account.id,
        "demo-1",
        "sell",
        "100",
        "pending",
        "2026-01-01T10:00:00Z",
        "2026-01-01",
        "oversell",
        "2026-01-01T10:00:00Z",
      ],
    });
    await advancePaper(new Date("2026-01-02T12:00:00Z"));
    expect(
      (
        await query<{ status: string }>(
          "SELECT status FROM orders WHERE id='oversell'",
        )
      )[0].status,
    ).toBe("rejected");
    expect(
      await query("SELECT * FROM fills WHERE order_id='oversell'"),
    ).toHaveLength(0);
    expect(
      (
        await query<{ cash: string }>("SELECT cash FROM accounts WHERE id=?", [
          account.id,
        ])
      )[0].cash,
    ).toBe("1000000");
  });
  it("fires on crossings once, then re-arms", async () => {
    await db().execute(
      "INSERT INTO alerts(id,instrument_id,type,threshold) VALUES('a','demo-1','above','1')",
    );
    await checkAlerts();
    await checkAlerts();
    expect(await query("SELECT * FROM alert_events")).toHaveLength(1);
    await db().execute("UPDATE alerts SET threshold='1000000'");
    await checkAlerts();
    await db().execute("UPDATE alerts SET threshold='1'");
    await checkAlerts();
    expect(await query("SELECT * FROM alert_events")).toHaveLength(2);
  });
  it("creates separate comparison accounts, never backfills historical orders", async () => {
    await createAccounts({
      name: "test",
      cash: "1000000",
      allocation: "0.2",
      stopLoss: "2",
      fee: "5",
      slippage: "10",
      origin: "demo",
    });
    await advancePaper();
    await advancePaper();
    expect(await query("SELECT * FROM accounts")).toHaveLength(2);
    expect(await query("SELECT * FROM fills")).toHaveLength(0);
    for (const a of await paperSummaries()) expect(a.cash).toBe("1000000");
  });
  it("fills once after the eligible opening and reconciles cash and ledger", async () => {
    await createAccounts({
      name: "test",
      cash: "1000000",
      allocation: "0.2",
      stopLoss: "20",
      fee: "10",
      slippage: "10",
      origin: "demo",
    });
    const a = (
      await query<{ id: string }>("SELECT * FROM accounts WHERE use_jev=0")
    )[0];
    await db().execute({
      sql: "INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)",
      args: [
        "o",
        a.id,
        "demo-1",
        "buy",
        "100",
        "pending",
        "2026-01-01T10:00:00Z",
        "2026-01-01",
        "order-unique",
        "2026-01-01T10:00:00Z",
      ],
    });
    await advancePaper(new Date("2026-01-02T12:00:00Z"));
    await advancePaper(new Date("2026-01-02T12:00:00Z"));
    expect(await query("SELECT * FROM fills WHERE order_id='o'")).toHaveLength(
      1,
    );
    const account = (
      await query<{ cash: string }>("SELECT cash FROM accounts WHERE id=?", [
        a.id,
      ])
    )[0];
    const ledger = await query<{ amount: string }>(
      "SELECT amount FROM ledger WHERE account_id=?",
      [a.id],
    );
    expect(Number(account.cash)).toBeCloseTo(
      ledger.reduce((s, x) => s + Number(x.amount), 0),
      3,
    );
    const summary = (await paperSummaries()).find((x) => x.id === a.id)!;
    expect(Number(summary.realizedPnl)).toBeCloseTo(0, 2);
    expect(
      Number(summary.realizedPnl) + Number(summary.unrealizedPnl),
    ).toBeCloseTo(Number(summary.pnl), 2);
  });
});
