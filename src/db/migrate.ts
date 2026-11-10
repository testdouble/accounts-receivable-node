/**
 * Applies the generated migrations in `drizzle/`.
 *
 * Exported as a function so the test suite can call it in-process against an in-memory
 * database, which is the same code path production takes -- a broken migration fails
 * the test suite rather than only the deploy.
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '../env.ts';
import { openDatabase, type Db } from './client.ts';

const MIGRATIONS_FOLDER = new URL('../../drizzle', import.meta.url).pathname;

export function applyMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

// `node src/db/migrate.ts` applies them to the configured database.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  applyMigrations(openDatabase(env.DATABASE_URL));
  console.log(`Migrations applied to ${env.DATABASE_URL}`);
}
