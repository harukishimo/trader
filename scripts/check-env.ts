import { config } from "dotenv";
import { databaseSettings } from "../src/core/config";
config({ path: ".env.local", quiet: true });
const database = databaseSettings();
const values: Record<string, string | undefined> = {
  ...process.env,
  DATABASE_URL: database.url,
  DATABASE_AUTH_TOKEN: database.authToken,
};
const required = process.argv.includes("--vercel")
  ? [
      "DATABASE_URL",
      "DATABASE_AUTH_TOKEN",
      "APP_PASSWORD",
      "SESSION_SECRET",
      "CRON_SECRET",
    ]
  : ["DATABASE_URL"];
if (process.env.JEV_PROVIDER === "typesafe") required.push("TYPESAFE_API_KEY");
if (process.env.MARKET_DATA_PROVIDER === "jquants")
  required.push("JQUANTS_API_KEY");
const missing = required.filter(
  (k) => !values[k] || values[k] === "[SENSITIVE]",
);
console.log(
  "Missing variable names:",
  missing.length ? missing.join(", ") : "none",
);
if (
  process.argv.includes("--vercel") &&
  values.DATABASE_URL?.startsWith("file:")
) {
  console.error("DATABASE_URL must use remote persistent storage on Vercel.");
  process.exitCode = 1;
}
if (missing.length) process.exitCode = 1;
