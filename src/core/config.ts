export function databaseSettings() {
  return {
    url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
  };
}
