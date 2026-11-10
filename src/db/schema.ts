/**
 * The five tables: clients, products, services, invoices and line items.
 *
 * Properties are camelCase and the columns they map to are snake_case: the Drizzle
 * handle in `client.ts` is created with `casing: 'snake_case'`, so `priceCents` is
 * written to a `price_cents` column. That keeps the SQL conventional while TypeScript
 * and the JSON API stay idiomatic, with no mapping layer in between.
 *
 * Money is integer cents everywhere. There is no float and no decimal type in this
 * schema on purpose.
 */
import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Creation and update timestamps.
 *
 * Stored as INTEGER unix seconds rather than TEXT: SQLite has no date type, and an
 * integer sorts, indexes and round-trips to a JS `Date` without any string parsing.
 * Everything is UTC -- SQLite stores no timezone and this API has no users, no sessions
 * and no locale, so there is no other timezone it could honestly claim.
 *
 * `createdAt` defaults in SQL, so the database owns the value and a raw INSERT still
 * gets one. `updatedAt` uses `$onUpdate`, which Drizzle applies in JS on `.update()`
 * only -- there is no SQL trigger, so a raw UPDATE will not touch it.
 */
const timestamps = {
  createdAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer({ mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
};

export const clients = sqliteTable('clients', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  /**
   * DELIBERATELY NOT UNIQUE.
   *
   * Two subsidiaries can share one accounts-payable address, and a unique index would
   * change observable behaviour: a duplicate POST would become a 409 rather than a 201.
   * `tests/clients.test.ts` pins the current behaviour.
   */
  email: text().notNull(),
  ...timestamps,
});

/**
 * `products` and `services` are byte-identical. Declared once so they cannot drift
 * apart.
 */
const catalogColumns = {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  priceCents: integer().notNull(),
  ...timestamps,
};

export const products = sqliteTable('products', catalogColumns);
export const services = sqliteTable('services', catalogColumns);

export const invoices = sqliteTable(
  'invoices',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** `restrict`, so deleting a client that still has invoices surfaces as a 409. */
    clientId: integer()
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    netDays: integer().notNull().default(30),
    /** Genuinely nullable, so it serialises as `null` rather than `''`. */
    note: text(),
    ...timestamps,
  },
  (table) => [index('index_invoices_on_client_id').on(table.clientId)],
);

export const lineItems = sqliteTable(
  'line_items',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** `cascade`, so deleting an invoice takes its line items with it. */
    invoiceId: integer()
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    productId: integer().references(() => products.id, { onDelete: 'restrict' }),
    serviceId: integer().references(() => services.id, { onDelete: 'restrict' }),
    /**
     * NULL means "no override, bill the catalog price".
     *
     * An override of 0 is a FREE LINE and is NOT the same thing. See
     * `src/domain/pricing.ts`, where getting this distinction wrong silently turns a
     * free line into a charged one.
     */
    priceOverrideCents: integer(),
    quantity: integer().notNull().default(1),
    description: text(),
    ...timestamps,
  },
  (table) => [
    index('index_line_items_on_invoice_id').on(table.invoiceId),
    index('index_line_items_on_product_id').on(table.productId),
    index('index_line_items_on_service_id').on(table.serviceId),
  ],
);

/**
 * Relations exist for one reason: they let the relational query builder load an
 * invoice, its line items and those items' catalog rows in a single query rather
 * than N.
 */
export const clientsRelations = relations(clients, ({ many }) => ({
  invoices: many(invoices),
}));

export const productsRelations = relations(products, ({ many }) => ({
  lineItems: many(lineItems),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  lineItems: many(lineItems),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  lineItems: many(lineItems),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  invoice: one(invoices, { fields: [lineItems.invoiceId], references: [invoices.id] }),
  product: one(products, { fields: [lineItems.productId], references: [products.id] }),
  service: one(services, { fields: [lineItems.serviceId], references: [services.id] }),
}));
