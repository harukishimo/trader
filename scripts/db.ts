import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { db, initialize, query } from "../src/core/db";
import { seed } from "../src/core/market";
const tables = [
  "instruments",
  "bars",
  "corporate_actions",
  "evaluations",
  "attempts",
  "jobs",
  "alerts",
  "alert_events",
  "accounts",
  "orders",
  "fills",
  "ledger",
  "equity",
  "status",
  "audit",
  "rate_limits",
];
async function main() {
  const command = process.argv[2];
  await initialize();
  if (command === "migrate") {
    console.log("Schema v1 ready.");
  } else if (command === "seed") {
    if (process.env.APP_MODE === "live")
      throw new Error("Live mode: demo seed disabled.");
    await seed();
    console.log("Synthetic demo data saved.");
  } else if (command === "backup") {
    const tx = await db().transaction("read");
    try {
      const data: Record<string, unknown> = { version: 1 };
      for (const table of tables)
        data[table] = (await tx.execute(`SELECT * FROM ${table}`)).rows;
      await mkdir("data", { recursive: true });
      const path = `data/backup-${Date.now()}.json`;
      await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
      await tx.commit();
      console.log(path);
    } finally {
      tx.close();
    }
  } else if (command === "restore") {
    const path = process.argv[3];
    if (!path) throw new Error("Specify backup JSON path.");
    const count = await query<{ n: number }>(
      "SELECT count(*) as n FROM instruments",
    );
    if (count[0].n)
      throw new Error(
        "Restore requires an empty database. Select a new DATABASE_URL.",
      );
    const data = JSON.parse(await readFile(path, "utf8"));
    if (data.version !== 1) throw new Error("Unsupported backup format.");
    const tx = await db().transaction("write");
    try {
      for (const table of tables) {
        for (const row of data[table] ?? []) {
          const keys = Object.keys(row);
          if (keys.some((k) => !/^[a-z_]+$/.test(k)))
            throw new Error("Invalid backup column.");
          await tx.execute({
            sql: `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
            args: Object.values(row) as (string | number | null)[],
          });
        }
      }
      await tx.commit();
      console.log("Backup restored.");
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  } else throw new Error("Unknown command.");
  db().close();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Database operation failed.");
  process.exitCode = 1;
});
