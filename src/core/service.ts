import { db, initialize, query } from "./db";
import { seed, getBars } from "./market";
import { paperSummaries } from "./paper";
import type { Alert, Bootstrap, Evaluation, Instrument, Job } from "./types";
export async function ensureData() {
  await initialize();
  const count = await query<{ n: number }>(
    "SELECT count(*) as n FROM instruments",
  );
  if (!count[0].n && process.env.APP_MODE !== "live") await seed();
}
export async function bootstrap(): Promise<Bootstrap> {
  await ensureData();
  const items = await query<Instrument>(
    "SELECT * FROM instruments ORDER BY watched DESC,name",
  );
  const [
    instruments,
    evaluations,
    jobs,
    alerts,
    alertEvents,
    accounts,
    status,
    usage,
  ] = await Promise.all([
    Promise.all(
      items.map(async (i) => ({
        ...i,
        bars: i.watched || i.origin !== "jquants" ? await getBars(i.id) : [],
      })),
    ),
    query<Evaluation>(
      "SELECT * FROM evaluations ORDER BY created_at DESC LIMIT 100",
    ),
    query<Job>(
      "SELECT id,kind,payload,state,attempts,error,created_at FROM jobs ORDER BY created_at DESC LIMIT 30",
    ),
    query<Alert>("SELECT * FROM alerts"),
    query<Record<string, unknown>>(
      "SELECT * FROM alert_events ORDER BY created_at DESC LIMIT 50",
    ),
    paperSummaries(),
    query<{ value: string }>("SELECT value FROM status WHERE name='lastRun'"),
    query<{ n: number }>("SELECT coalesce(sum(usage),0) as n FROM attempts"),
  ]);
  return {
    instruments,
    evaluations,
    jobs,
    alerts,
    alertEvents,
    accounts,
    status: {
      database:
        process.env.DATABASE_URL?.startsWith("libsql:") ||
        process.env.DATABASE_URL?.startsWith("https:")
          ? "Turso"
          : "SQLite",
      mode: process.env.APP_MODE || "demo",
      jev: process.env.JEV_PROVIDER || "mock",
      market: process.env.MARKET_DATA_PROVIDER || "demo",
      lastRun: status[0]?.value ?? null,
      configured:
        process.env.JEV_PROVIDER === "typesafe"
          ? !!process.env.TYPESAFE_API_KEY
          : true,
      usage: usage[0].n,
    },
  };
}
export async function rateLimit(key: string, max = 10, seconds = 60) {
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + seconds * 1000).toISOString();
  const r = await db().execute({
    sql: `INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
    args: [key, expiry, now, now],
  });
  return Number(r.rows[0].count) <= max;
}
