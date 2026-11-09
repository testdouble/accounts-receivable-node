/**
 * Insert helpers with sensible defaults.
 *
 * Plain functions rather than a factory framework: a Drizzle insert is already a plain
 * object literal, so a framework would only add an API to learn. A module-level counter
 * keeps names unique, and there is no Faker -- nothing here needs random data, and
 * random data in a test about money is a liability.
 */
import type { Db } from '../../src/db/client.ts';
import { clients, invoices, lineItems, products, services } from '../../src/db/schema.ts';

let sequence = 0;

const next = (): number => (sequence += 1);

export async function createClient(db: Db, overrides: Partial<typeof clients.$inferInsert> = {}) {
  const n = next();
  const [row] = await db
    .insert(clients)
    .values({ name: `Client ${String(n)}`, email: `client${String(n)}@example.com`, ...overrides })
    .returning();
  return row!;
}

export async function createProduct(db: Db, overrides: Partial<typeof products.$inferInsert> = {}) {
  const [row] = await db
    .insert(products)
    .values({ name: `Product ${String(next())}`, priceCents: 20_000, ...overrides })
    .returning();
  return row!;
}

export async function createService(db: Db, overrides: Partial<typeof services.$inferInsert> = {}) {
  const [row] = await db
    .insert(services)
    .values({ name: `Service ${String(next())}`, priceCents: 8000, ...overrides })
    .returning();
  return row!;
}

export async function createInvoice(db: Db, overrides: Partial<typeof invoices.$inferInsert> = {}) {
  const clientId = overrides.clientId ?? (await createClient(db)).id;
  const [row] = await db
    .insert(invoices)
    .values({ netDays: 30, note: `Invoice ${String(next())}`, ...overrides, clientId })
    .returning();
  return row!;
}

/**
 * Builds a line item with NEITHER a product nor a service.
 *
 * Deliberate, and the same choice the Django port's factory makes: the caller passes
 * exactly one, so the product-or-service rule stays testable from both sides. Note this
 * writes straight through Drizzle and so bypasses `assertProductXorService` -- which is
 * how a test can set up the invalid row the API refuses to create.
 */
export async function createLineItem(
  db: Db,
  overrides: Partial<typeof lineItems.$inferInsert> = {},
) {
  const invoiceId = overrides.invoiceId ?? (await createInvoice(db)).id;
  const [row] = await db
    .insert(lineItems)
    .values({
      quantity: 1,
      description: `Line item ${String(next())}`,
      ...overrides,
      invoiceId,
    })
    .returning();
  return row!;
}
