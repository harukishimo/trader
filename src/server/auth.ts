import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { databaseSettings } from "@/core/config";
export function configured() {
  const database = databaseSettings();
  return (
    !process.env.VERCEL ||
    !!(
      process.env.APP_PASSWORD &&
      process.env.SESSION_SECRET &&
      database.url &&
      /^(libsql|https):/.test(database.url) &&
      database.authToken
    )
  );
}
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function checkPassword(password: string) {
  return (
    !!process.env.APP_PASSWORD && equal(password, process.env.APP_PASSWORD)
  );
}
export function sessionValue() {
  const body = Buffer.from(
    JSON.stringify({ expires: Date.now() + 12 * 3600000 }),
  ).toString("base64url");
  return (
    body +
    "." +
    createHmac("sha256", process.env.SESSION_SECRET!)
      .update(body)
      .digest("base64url")
  );
}
export async function authorized() {
  if (!configured()) return false;
  if (!process.env.VERCEL && !process.env.APP_PASSWORD) return true;
  const token = (await cookies()).get("trader-session")?.value;
  if (!token || !process.env.SESSION_SECRET) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = createHmac("sha256", process.env.SESSION_SECRET)
    .update(body)
    .digest("base64url");
  if (!equal(sig, expected)) return false;
  try {
    return (
      JSON.parse(Buffer.from(body, "base64url").toString()).expires > Date.now()
    );
  } catch {
    return false;
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (
      !process.env.VERCEL &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return false;
    return (
      url.host === host &&
      url.protocol === (process.env.VERCEL ? "https:" : "http:")
    );
  } catch {
    return false;
  }
}
export function checkCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret &&
    equal(request.headers.get("authorization") ?? "", `Bearer ${secret}`)
  );
}
