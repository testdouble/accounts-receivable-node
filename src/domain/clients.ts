/**
 * Clients.
 *
 * Takes a `Db` and plain input, returns wire-ready records, throws the errors in
 * `errors.ts`. Knows nothing about Express -- `oxlint` forbids this directory from
 * importing it, or from importing `src/api/`, so the boundary is enforced rather than
 * merely intended.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { clients, invoices } from '../db/schema.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { wireTimestamps } from './records.ts';

type ClientRow = typeof clients.$inferSelect;

export interface ClientRecord {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: ClientRow): ClientRecord {
  return { id: row.id, name: row.name, email: row.email, ...wireTimestamps(row) };
}

export async function listClients(db: Db): Promise<ClientRecord[]> {
  // Ordered by id so the list is stable between requests. Rails' `Client.all` is
  // unordered, which is a latent inconsistency rather than a behaviour worth copying.
  const rows = await db.select().from(clients).orderBy(asc(clients.id));
  return rows.map((row) => toRecord(row));
}

export async function getClient(db: Db, id: number): Promise<ClientRecord> {
  const row = await db.query.clients.findFirst({ where: eq(clients.id, id) });

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toRecord(row);
}

export async function createClient(
  db: Db,
  input: { name: string; email: string },
): Promise<ClientRecord> {
  const [row] = await db.insert(clients).values(input).returning();
  return toRecord(row!);
}

export async function updateClient(
  db: Db,
  id: number,
  input: { name?: string | undefined; email?: string | undefined },
): Promise<ClientRecord> {
  // An empty PATCH is a no-op rather than an error, so it must not become an UPDATE
  // with no SET clause.
  if (Object.keys(input).length === 0) {
    return getClient(db, id);
  }

  const [row] = await db.update(clients).set(input).where(eq(clients.id, id)).returning();

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toRecord(row);
}

export async function deleteClient(db: Db, id: number): Promise<void> {
  // Checked up front so the 409 can say what is wrong. The foreign key is declared
  // `restrict`, so the delete would fail anyway -- but as a bare constraint error with
  // nothing useful to tell the caller.
  const [referencing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoices)
    .where(eq(invoices.clientId, id));

  if ((referencing?.count ?? 0) > 0) {
    throw new ConflictError('Client still has invoices');
  }

  const deleted = await db.delete(clients).where(eq(clients.id, id)).returning();

  if (deleted.length === 0) {
    throw new NotFoundError();
  }
}
