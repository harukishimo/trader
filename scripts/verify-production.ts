import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

async function availablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("No port"));
      server.close(() => resolve(address.port));
    });
  });
}
async function main() {
  const directory = await mkdtemp(join(tmpdir(), "trader-production-"));
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(24).toString("hex");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: "file:" + join(directory, "app.db"),
    APP_PASSWORD: password,
    SESSION_SECRET: randomBytes(48).toString("hex"),
    APP_MODE: "demo",
    JEV_PROVIDER: "mock",
    MARKET_DATA_PROVIDER: "demo",
    ALLOW_AI_DATA_TRANSFER: "false",
  };
  delete env.VERCEL;
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: "ignore" },
  );
  const stopped = new Promise<void>((resolve) =>
    server.once("exit", () => resolve()),
  );
  const request = (path: string, options: RequestInit = {}) =>
    fetch(origin + path, { ...options, signal: AbortSignal.timeout(10000) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null)
        throw new Error("Production server exited before startup");
      try {
        ready = (await request("/")).ok;
      } catch {
        /* startup in progress */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready, "Production server did not become ready");
    assert.equal((await request("/api/data")).status, 401);
    const login = (value: string) =>
      request("/api/login", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ password: value }),
      });
    assert.equal((await login("wrong-password")).status, 401);
    const response = await login(password);
    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=strict/i);
    const cookie = setCookie.split(";")[0];
    const data = await request("/api/data", { headers: { cookie } });
    assert.equal(data.status, 200);
    assert.match(data.headers.get("cache-control") ?? "", /no-store/);
    const body = await data.json();
    assert.equal(body.status.mode, "demo");
    assert(body.instruments.length > 0);
    assert.equal(
      (await request("/api/data", { headers: { cookie: cookie + "tampered" } }))
        .status,
      401,
    );
    assert.equal(
      (
        await request("/api/action", {
          method: "POST",
          headers: {
            cookie,
            origin: "https://example.invalid",
            "content-type": "application/json",
          },
          body: JSON.stringify({ action: "run" }),
        })
      ).status,
      403,
    );
    const logout = await request("/api/logout", {
      method: "POST",
      headers: { cookie, origin },
    });
    assert.equal(logout.status, 200);
    const clearedCookie = logout.headers.get("set-cookie") ?? "";
    assert.match(clearedCookie, /^trader-session=;/);
    assert.match(clearedCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    assert.equal((await request("/api/data")).status, 401);
    console.log(
      "Production authentication: login, cookie flags, tamper rejection, CSRF, no-store and logout passed.",
    );
  } finally {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(timer);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
});
