/**
 * A fresh, migrated, empty database and an app wired to it.
 *
 * ':memory:' rather than a temporary file: five CREATE TABLEs against in-memory SQLite
 * are sub-millisecond, so every test file can afford its own schema and no test can see
 * another's rows.
 *
 * The migrator is CALLED, in-process. An earlier abandoned Node port of this app ran
 * `await exec('npm run db:migrate:prod')` once per test file -- npm spawning prisma
 * spawning node -- which cost seconds per file and could not be stepped through.
 * Calling it also means a broken migration fails the test suite, not just the deploy.
 */
import supertest from 'supertest';
import { createApp } from '../../src/app.ts';
import { openDatabase, type Db } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';

export interface TestApp {
  db: Db;
  request: supertest.Agent;
}

export function makeTestApp(): TestApp {
  const db = openDatabase(':memory:');
  applyMigrations(db);

  return { db, request: supertest(createApp({ db })) };
}
