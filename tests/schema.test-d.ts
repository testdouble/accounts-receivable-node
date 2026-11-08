/**
 * Type-level guards, checked by `vitest --typecheck` (wired on in vitest.config.ts).
 *
 * The runtime tests catch a response that drops a field. These catch the other
 * direction: a column added to src/db/schema.ts without a matching field on the
 * response schema, which no runtime test would notice because nothing would ever try
 * to serialise it.
 */
import { expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import type {
  ClientResponse,
  InvoiceResponse,
  LineItemResponse,
  ProductResponse,
  ServiceResponse,
} from '../src/api/schemas.ts';
import type { clients, invoices, lineItems, products, services } from '../src/db/schema.ts';
import type { ClientRecord } from '../src/domain/clients.ts';
import type { CatalogRecord } from '../src/domain/catalog.ts';
import type { InvoiceRecord, LineItemRecord } from '../src/domain/billing.ts';

/** The column names a response is expected to account for, minus the derived extras. */
type ColumnNames<T> = keyof T;

test('every client column is accounted for in the client response', () => {
  expectTypeOf<ColumnNames<typeof clients.$inferSelect>>().toEqualTypeOf<
    keyof z.input<typeof ClientResponse>
  >();
  expectTypeOf<ClientRecord>().toExtend<z.input<typeof ClientResponse>>();
});

test('every product and service column is accounted for', () => {
  expectTypeOf<ColumnNames<typeof products.$inferSelect>>().toEqualTypeOf<
    keyof z.input<typeof ProductResponse>
  >();
  expectTypeOf<ColumnNames<typeof services.$inferSelect>>().toEqualTypeOf<
    keyof z.input<typeof ServiceResponse>
  >();
  expectTypeOf<CatalogRecord>().toExtend<z.input<typeof ProductResponse>>();
});

test('the invoice response covers every column plus the derived fields', () => {
  // Derived fields the table does not have. Listed explicitly so adding a derived field
  // is a deliberate edit here rather than a silent widening.
  type Derived = 'dueDate' | 'totalCents';

  expectTypeOf<ColumnNames<typeof invoices.$inferSelect>>().toEqualTypeOf<
    Exclude<keyof z.input<typeof InvoiceResponse>, Derived>
  >();
  expectTypeOf<InvoiceRecord>().toExtend<z.input<typeof InvoiceResponse>>();
});

test('the line item response covers every column plus the derived fields', () => {
  type Derived = 'unitPriceCents' | 'subtotalCents';

  expectTypeOf<ColumnNames<typeof lineItems.$inferSelect>>().toEqualTypeOf<
    Exclude<keyof z.input<typeof LineItemResponse>, Derived>
  >();
  expectTypeOf<LineItemRecord>().toExtend<z.input<typeof LineItemResponse>>();
});
