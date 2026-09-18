import { afterEach, expect, it, vi } from "vitest";
import { databaseSettings } from "../src/core/config";
afterEach(() => vi.unstubAllEnvs());
it("uses the native Turso integration variables", () => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("DATABASE_AUTH_TOKEN", undefined);
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
  expect(databaseSettings()).toEqual({
    url: "libsql://example.turso.io",
    authToken: "test-token",
  });
});
it("honors explicit overrides", () => {
  vi.stubEnv("DATABASE_URL", "file:./test.db");
  vi.stubEnv("DATABASE_AUTH_TOKEN", "explicit-token");
  vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
  vi.stubEnv("TURSO_AUTH_TOKEN", "test-token");
  expect(databaseSettings()).toEqual({
    url: "file:./test.db",
    authToken: "explicit-token",
  });
});
it("does not turn absent values into the string undefined", () => {
  for (const key of [
    "DATABASE_URL",
    "DATABASE_AUTH_TOKEN",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
  ])
    vi.stubEnv(key, undefined);
  expect(databaseSettings()).toEqual({ url: undefined, authToken: undefined });
});
