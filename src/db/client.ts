/**
 * The database handle.
 *
 * Everything that talks to SQLite goes through here, so the connection pragmas are set
 * in exactly one place.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

export type Db = ReturnType<typeof openDatabase>;

export function openDatabase(url: string) {
  const sqlite = new Database(url);

  // Set explicitly rather than relied upon. SQLite itself defaults foreign_keys to OFF,
  // and better-sqlite3's own default for it has moved across major versions -- as of 13
  // it is on. The pragma is per-connection and is not stored in the database file, so
  // it has to be set on every connection this function hands out. The 409 responses in
  // src/api/errors.ts are only deterministic when foreign keys are actually enforced.
  sqlite.pragma('foreign_keys = ON');
  // A no-op for ':memory:' and a real win for the development file.
  sqlite.pragma('journal_mode = WAL');

  // casing: 'snake_case' is what lets src/db/schema.ts declare camelCase properties
  // against snake_case column names.
  return drizzle(sqlite, { schema, casing: 'snake_case' });
}
