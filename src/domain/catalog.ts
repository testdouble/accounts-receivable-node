/**
 * Products and services.
 *
 * One implementation for both. The two tables are identical, and a second copy of
 * these five functions would be a second place for them to drift.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { lineItems, products, services } from '../db/schema.ts';
import { ConflictError, NotFoundError } from './errors.ts';
import { wireTimestamps } from './records.ts';

export interface CatalogRecord {
  id: number;
  name: string;
  priceCents: number;
  createdAt: string;
  updatedAt: string;
}

export type CatalogKind = 'product' | 'service';

interface CatalogRow {
  id: number;
  name: string;
  priceCents: number;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: CatalogRow): CatalogRecord {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    ...wireTimestamps(row),
  };
}

function tableFor(kind: CatalogKind) {
  return kind === 'product' ? products : services;
}

/** The line-item column that points at this catalog table. */
function referenceColumnFor(kind: CatalogKind) {
  return kind === 'product' ? lineItems.productId : lineItems.serviceId;
}

export async function listCatalog(db: Db, kind: CatalogKind): Promise<CatalogRecord[]> {
  const table = tableFor(kind);
  const rows = await db.select().from(table).orderBy(asc(table.id));
  return rows.map((row) => toRecord(row));
}

export async function getCatalogItem(
  db: Db,
  kind: CatalogKind,
  id: number,
): Promise<CatalogRecord> {
  const table = tableFor(kind);
  const [row] = await db.select().from(table).where(eq(table.id, id));

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toRecord(row);
}

export async function createCatalogItem(
  db: Db,
  kind: CatalogKind,
  input: { name: string; priceCents: number },
): Promise<CatalogRecord> {
  const [row] = await db.insert(tableFor(kind)).values(input).returning();
  return toRecord(row!);
}

export async function updateCatalogItem(
  db: Db,
  kind: CatalogKind,
  id: number,
  input: { name?: string | undefined; priceCents?: number | undefined },
): Promise<CatalogRecord> {
  if (Object.keys(input).length === 0) {
    return getCatalogItem(db, kind, id);
  }

  const table = tableFor(kind);
  const [row] = await db.update(table).set(input).where(eq(table.id, id)).returning();

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toRecord(row);
}

export async function deleteCatalogItem(db: Db, kind: CatalogKind, id: number): Promise<void> {
  // As with clients: checked up front so the 409 can explain itself rather than
  // surfacing as a bare foreign key constraint error.
  const [referencing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(lineItems)
    .where(eq(referenceColumnFor(kind), id));

  if ((referencing?.count ?? 0) > 0) {
    throw new ConflictError(
      `${kind === 'product' ? 'Product' : 'Service'} is still on a line item`,
    );
  }

  const table = tableFor(kind);
  const deleted = await db.delete(table).where(eq(table.id, id)).returning();

  if (deleted.length === 0) {
    throw new NotFoundError();
  }
}
