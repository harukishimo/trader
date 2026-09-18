import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { databaseSettings } from "./config";

let client: Client | undefined;
let ready: Promise<void> | undefined;
export function databaseUrl() {
  const value = databaseSettings().url;
  if (process.env.VERCEL && (!value || value.startsWith("file:")))
    throw new Error("Vercelでは永続DBのDATABASE_URLを設定してください。");
  return value || "file:./data/trader.db";
}
export function db() {
  return (client ??= createClient({
    url: databaseUrl(),
    authToken: databaseSettings().authToken,
  }));
}
export async function query<T>(
  sql: string,
  args: InValue[] = [],
): Promise<T[]> {
  const r = await db().execute({ sql, args });
  return r.rows.map((row) => ({ ...row })) as unknown as T[];
}
export const schema = [
  `CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY)`,
  `INSERT OR IGNORE INTO schema_version VALUES(1)`,
  `CREATE TABLE IF NOT EXISTS instruments(id TEXT PRIMARY KEY,symbol TEXT NOT NULL,name TEXT NOT NULL,sector TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'JPY',lot INTEGER NOT NULL DEFAULT 100,origin TEXT NOT NULL,watched INTEGER NOT NULL DEFAULT 0,color TEXT NOT NULL DEFAULT '#27634e')`,
  `CREATE TABLE IF NOT EXISTS bars(id TEXT PRIMARY KEY,instrument_id TEXT NOT NULL REFERENCES instruments(id),date TEXT NOT NULL,open TEXT NOT NULL,high TEXT NOT NULL,low TEXT NOT NULL,close TEXT NOT NULL,volume INTEGER NOT NULL,received_at TEXT NOT NULL,available_at TEXT NOT NULL,origin TEXT NOT NULL,UNIQUE(instrument_id,date,origin,open,high,low,close,volume))`,
  `CREATE INDEX IF NOT EXISTS bars_by_instrument ON bars(instrument_id,date,received_at)`,
  `CREATE TABLE IF NOT EXISTS evaluations(id TEXT PRIMARY KEY,instrument_id TEXT NOT NULL REFERENCES instruments(id),snapshot TEXT NOT NULL,question_version TEXT NOT NULL,model TEXT NOT NULL,origin TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,answer TEXT,error TEXT,created_at TEXT NOT NULL,completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,evaluation_id TEXT NOT NULL REFERENCES evaluations(id),status TEXT NOT NULL,usage INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,run_after TEXT NOT NULL,lease_until TEXT,lease_owner TEXT,error TEXT,created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state,run_after)`,
  `CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,instrument_id TEXT NOT NULL REFERENCES instruments(id),type TEXT NOT NULL,threshold TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,triggered INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS alert_events(id TEXT PRIMARY KEY,rule_id TEXT NOT NULL REFERENCES alerts(id),message TEXT NOT NULL,created_at TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,dedupe_key TEXT UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,initial_cash TEXT NOT NULL,cash TEXT NOT NULL,max_allocation TEXT NOT NULL,stop_loss TEXT NOT NULL,fee_bps TEXT NOT NULL,slippage_bps TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'active',use_jev INTEGER NOT NULL,origin TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),instrument_id TEXT NOT NULL REFERENCES instruments(id),side TEXT NOT NULL,quantity TEXT NOT NULL,status TEXT NOT NULL,eligible_after TEXT NOT NULL,signal_date TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS fills(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),account_id TEXT NOT NULL REFERENCES accounts(id),instrument_id TEXT NOT NULL,side TEXT NOT NULL,quantity TEXT NOT NULL,price TEXT NOT NULL,fee TEXT NOT NULL,occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),source_key TEXT NOT NULL UNIQUE,amount TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS equity(account_id TEXT NOT NULL REFERENCES accounts(id),date TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(account_id,date))`,
  `CREATE TABLE IF NOT EXISTS status(name TEXT PRIMARY KEY,value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,event TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS service_locks(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS corporate_actions(id TEXT PRIMARY KEY,instrument_id TEXT NOT NULL REFERENCES instruments(id),effective_date TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL)`,
];
export async function initialize() {
  if (!ready)
    ready = (async () => {
      const url = databaseUrl();
      if (url.startsWith("file:"))
        await mkdir(dirname(resolve(url.slice(5))), { recursive: true });
      await db().execute("PRAGMA foreign_keys=ON");
      if (url.startsWith("file:")) {
        await db().execute("PRAGMA journal_mode=WAL");
        await db().execute("PRAGMA busy_timeout=5000");
      }
      await db().batch(
        schema.map((sql) => ({ sql, args: [] })),
        "write",
      );
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  return ready;
}
export function resetConnection() {
  client?.close();
  client = undefined;
  ready = undefined;
}
