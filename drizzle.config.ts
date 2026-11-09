import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // Must match the `casing` passed to drizzle() in src/db/client.ts, or the generated
  // SQL and the runtime queries will disagree about column names.
  casing: 'snake_case',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? './dev.sqlite3' },
  strict: true,
  verbose: true,
});
