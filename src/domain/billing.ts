/**
 * Invoices and line items -- the part of the domain with actual arithmetic in it.
 *
 * The arithmetic itself lives in `pricing.ts` as pure functions. This module's job is
 * to load the rows those functions need, in one query rather than N, and to enforce the
 * rules Rails puts on the model.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { clients, invoices, lineItems, products, services } from '../db/schema.ts';
import { DomainValidationError, NotFoundError } from './errors.ts';
import {
  assertProductXorService,
  dueDate,
  invoiceTotalCents,
  subtotalCents,
  unitPriceCents,
} from './pricing.ts';
import { wireTimestamps } from './records.ts';

export interface InvoiceRecord {
  id: number;
  clientId: number;
  netDays: number;
  note: string | null;
  dueDate: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface LineItemRecord {
  id: number;
  invoiceId: number;
  productId: number | null;
  serviceId: number | null;
  priceOverrideCents: number | null;
  quantity: number;
  description: string | null;
  unitPriceCents: number;
  subtotalCents: number;
  createdAt: string;
  updatedAt: string;
}

/** A line-item row with its catalog rows already loaded. */
type LoadedLineItem = typeof lineItems.$inferSelect & {
  product: typeof products.$inferSelect | null;
  service: typeof services.$inferSelect | null;
};

/**
 * The catalog price a line item falls back to.
 *
 * `?? 0` for the case where a row references neither a product nor a service.
 * `assertProductXorService` makes that unreachable through this API, but the Rails
 * schema allows it at the database level, so a row written by anything else still has
 * to produce a number rather than `NaN`.
 */
function catalogPriceCents(row: LoadedLineItem): number {
  return row.product?.priceCents ?? row.service?.priceCents ?? 0;
}

function toLineItemRecord(row: LoadedLineItem): LineItemRecord {
  const unitPrice = unitPriceCents(row.priceOverrideCents, catalogPriceCents(row));

  return {
    id: row.id,
    invoiceId: row.invoiceId,
    productId: row.productId,
    serviceId: row.serviceId,
    priceOverrideCents: row.priceOverrideCents,
    quantity: row.quantity,
    description: row.description,
    unitPriceCents: unitPrice,
    subtotalCents: subtotalCents(unitPrice, row.quantity),
    ...wireTimestamps(row),
  };
}

type LoadedInvoice = typeof invoices.$inferSelect & { lineItems: LoadedLineItem[] };

function toInvoiceRecord(row: LoadedInvoice): InvoiceRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    netDays: row.netDays,
    note: row.note,
    dueDate: dueDate(row.createdAt, row.netDays),
    totalCents: invoiceTotalCents(row.lineItems.map((item) => toLineItemRecord(item))),
    ...wireTimestamps(row),
  };
}

/**
 * Every invoice with the rows `totalCents` needs already loaded.
 *
 * One query via the relational query builder, which is why `schema.ts` declares
 * `relations()` at all. The direct analog of the Django port's
 * `prefetch_related("line_items__product", "line_items__service")`.
 */
const WITH_LINE_ITEM_PRICING = {
  lineItems: { with: { product: true, service: true } },
} as const;

// --- Referential checks ---------------------------------------------------------------

/**
 * Checks a referenced row exists before writing.
 *
 * The foreign keys would catch this, but as an opaque constraint error. Checking here
 * turns it into a 422 that names the offending field -- which is precisely the class of
 * 500 the Rails app returns and this port deliberately does not.
 */
async function assertExists(
  db: Db,
  kind: 'client' | 'invoice' | 'product' | 'service',
  id: number,
  field: string,
): Promise<void> {
  const table = { client: clients, invoice: invoices, product: products, service: services }[kind];
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));

  if (row === undefined) {
    throw new DomainValidationError(`No ${kind} with id ${String(id)}`, ['body', field]);
  }
}

// --- Invoices -------------------------------------------------------------------------

export async function listInvoices(
  db: Db,
  filter: { clientId?: number } = {},
): Promise<InvoiceRecord[]> {
  const rows = await db.query.invoices.findMany({
    with: WITH_LINE_ITEM_PRICING,
    ...(filter.clientId === undefined ? {} : { where: eq(invoices.clientId, filter.clientId) }),
    orderBy: asc(invoices.id),
  });

  return rows.map((row) => toInvoiceRecord(row));
}

export async function getInvoice(db: Db, id: number): Promise<InvoiceRecord> {
  const row = await db.query.invoices.findFirst({
    with: WITH_LINE_ITEM_PRICING,
    where: eq(invoices.id, id),
  });

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toInvoiceRecord(row);
}

export async function createInvoice(
  db: Db,
  input: { clientId: number; netDays: number; note: string | null },
): Promise<InvoiceRecord> {
  await assertExists(db, 'client', input.clientId, 'clientId');

  const [row] = await db.insert(invoices).values(input).returning();

  return getInvoice(db, row!.id);
}

export async function updateInvoice(
  db: Db,
  id: number,
  input: {
    clientId?: number | undefined;
    netDays?: number | undefined;
    note?: string | null | undefined;
  },
): Promise<InvoiceRecord> {
  if (input.clientId !== undefined) {
    await assertExists(db, 'client', input.clientId, 'clientId');
  }

  if (Object.keys(input).length === 0) {
    return getInvoice(db, id);
  }

  const [row] = await db.update(invoices).set(input).where(eq(invoices.id, id)).returning();

  if (row === undefined) {
    throw new NotFoundError();
  }

  return getInvoice(db, row.id);
}

export async function deleteInvoice(db: Db, id: number): Promise<void> {
  // No referential pre-check: the line_items foreign key is declared `cascade`, which
  // is Rails' `dependent: :destroy`, so deleting an invoice is meant to take its line
  // items with it.
  const deleted = await db.delete(invoices).where(eq(invoices.id, id)).returning();

  if (deleted.length === 0) {
    throw new NotFoundError();
  }
}

// --- Line items -----------------------------------------------------------------------

export async function listLineItems(
  db: Db,
  filter: { invoiceId?: number } = {},
): Promise<LineItemRecord[]> {
  const rows = await db.query.lineItems.findMany({
    with: { product: true, service: true },
    ...(filter.invoiceId === undefined ? {} : { where: eq(lineItems.invoiceId, filter.invoiceId) }),
    orderBy: asc(lineItems.id),
  });

  return rows.map((row) => toLineItemRecord(row));
}

export async function getLineItem(db: Db, id: number): Promise<LineItemRecord> {
  const row = await db.query.lineItems.findFirst({
    with: { product: true, service: true },
    where: eq(lineItems.id, id),
  });

  if (row === undefined) {
    throw new NotFoundError();
  }

  return toLineItemRecord(row);
}

export async function createLineItem(
  db: Db,
  input: {
    invoiceId: number;
    productId: number | null;
    serviceId: number | null;
    priceOverrideCents: number | null;
    quantity: number;
    description: string | null;
  },
): Promise<LineItemRecord> {
  assertProductXorService(input);

  await assertExists(db, 'invoice', input.invoiceId, 'invoiceId');

  if (input.productId !== null) {
    await assertExists(db, 'product', input.productId, 'productId');
  }

  if (input.serviceId !== null) {
    await assertExists(db, 'service', input.serviceId, 'serviceId');
  }

  const [row] = await db.insert(lineItems).values(input).returning();

  return getLineItem(db, row!.id);
}

export async function updateLineItem(
  db: Db,
  id: number,
  input: {
    invoiceId?: number | undefined;
    productId?: number | null | undefined;
    serviceId?: number | null | undefined;
    priceOverrideCents?: number | null | undefined;
    quantity?: number | undefined;
    description?: string | null | undefined;
  },
): Promise<LineItemRecord> {
  const current = await getLineItem(db, id);

  // The rule is about the resulting row, not about the patch, so it is checked against
  // the merged state. A PATCH that sets serviceId on a row that already has a productId
  // has to fail even though the patch alone looks fine.
  assertProductXorService({
    productId: input.productId === undefined ? current.productId : input.productId,
    serviceId: input.serviceId === undefined ? current.serviceId : input.serviceId,
  });

  if (input.invoiceId !== undefined) {
    await assertExists(db, 'invoice', input.invoiceId, 'invoiceId');
  }

  if (input.productId !== undefined && input.productId !== null) {
    await assertExists(db, 'product', input.productId, 'productId');
  }

  if (input.serviceId !== undefined && input.serviceId !== null) {
    await assertExists(db, 'service', input.serviceId, 'serviceId');
  }

  if (Object.keys(input).length === 0) {
    return current;
  }

  const [row] = await db.update(lineItems).set(input).where(eq(lineItems.id, id)).returning();

  if (row === undefined) {
    throw new NotFoundError();
  }

  return getLineItem(db, row.id);
}

export async function deleteLineItem(db: Db, id: number): Promise<void> {
  const deleted = await db.delete(lineItems).where(eq(lineItems.id, id)).returning();

  if (deleted.length === 0) {
    throw new NotFoundError();
  }
}

/** Used by the seed script to report whether it created anything. */
export async function countRows(db: Db): Promise<Record<string, number>> {
  const tables = { clients, products, services, invoices, lineItems };
  const counts: Record<string, number> = {};

  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(table);
    counts[name] = row?.count ?? 0;
  }

  return counts;
}
