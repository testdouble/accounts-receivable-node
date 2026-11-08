/**
 * Every request and response shape in the API, as Zod schemas.
 *
 * These are the single source of truth. They are used three times over:
 *
 *   1. to validate incoming path parameters, query strings and bodies;
 *   2. to validate each response on the way OUT (see `route.ts`), so a handler that
 *      drops a field or returns the wrong type fails loudly rather than shipping a hole
 *      in the JSON;
 *   3. to generate the OpenAPI document served at /api/openapi.json.
 *
 * Because (2) and (3) read the same objects, the documentation cannot lie about the
 * API: a response that does not match its schema never reaches the client.
 *
 * Hand-written rather than derived from the Drizzle tables with drizzle-zod. The shapes
 * genuinely differ -- responses add the derived fields (dueDate, totalCents,
 * unitPriceCents, subtotalCents) that are the main reason a consumer would want this
 * API, and requests drop ids and timestamps. Deriving and then patching is more code
 * than writing the contract once, and the contract is the part worth reading.
 */
import { z } from 'zod';

/// <reference types="zod-openapi" />

/** ISO 8601 instants. The domain layer stringifies dates, so these are plain strings here. */
const timestamp = z.iso.datetime().meta({ examples: ['2026-11-08T12:00:00.000Z'] });

const timestamps = {
  createdAt: timestamp,
  updatedAt: timestamp,
};

/** A positive row id. */
const id = z
  .int()
  .positive()
  .meta({ examples: [1] });

// --- Shared ---------------------------------------------------------------------------

/**
 * One validation failure, in the shape Pydantic uses -- and therefore the shape the
 * Django port of this app returns -- so a consumer can handle both ports' errors with
 * the same code.
 */
export const ErrorDetail = z
  .object({
    type: z.string().meta({ examples: ['value_error'] }),
    loc: z.array(z.union([z.string(), z.int()])).meta({ examples: [['body', 'email']] }),
    msg: z.string().meta({ examples: ['Invalid email address'] }),
  })
  .meta({ id: 'ErrorDetail' });

export const ErrorResponse = z
  .object({
    detail: z.union([z.string(), z.array(ErrorDetail)]),
  })
  .meta({ id: 'ErrorResponse' });

/**
 * A path `:id`.
 *
 * Spelled as a constrained string that transforms, not `z.coerce.number()`, for two
 * reasons: OpenAPI then documents the parameter as the string it actually is, and
 * `z.coerce.number()` cheerfully accepts '', ' 1 ' and '1e3'.
 */
export const IdParams = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/u, 'must be a positive integer')
    .transform(Number)
    // No `param: { in, name }` here: zod-openapi takes the location from the
    // `requestParams` key the schema is passed under and the name from this property,
    // and errors if both are supplied.
    .meta({ examples: ['1'] }),
});

/** A `?fooId=` filter, validated the same way as a path id but optional. */
const optionalIdQuery = () =>
  z
    .string()
    .regex(/^[1-9]\d*$/u, 'must be a positive integer')
    .transform(Number)
    .optional()
    .meta({ examples: ['1'] });

// --- Meta -----------------------------------------------------------------------------

/**
 * The health response.
 *
 * Exists so that at least one endpoint genuinely exercises the Zod validation path on
 * every request rather than merely importing it -- the same reason the Django port has
 * one.
 */
export const HealthResponse = z
  .object({
    status: z.literal('ok'),
    nodeVersion: z.string().meta({ examples: ['v26.13.0'] }),
  })
  .meta({ id: 'Health' });

// --- Clients --------------------------------------------------------------------------

export const ClientResponse = z
  .object({ id, name: z.string(), email: z.string(), ...timestamps })
  .meta({ id: 'Client' });

export const ClientCreate = z
  .object({
    name: z
      .string()
      .min(1)
      .max(255)
      .meta({ examples: ['Acme inc'] }),
    // Validated as an address, which Rails does not do at all -- it has no validations
    // on this model, so a blank name reaches the NOT NULL constraint and surfaces as a
    // 500. See the README: that is one of the Rails behaviours deliberately not ported.
    email: z
      .email()
      .max(255)
      .meta({ examples: ['ap@acme.com'] }),
  })
  .meta({ id: 'ClientCreate' });

export const ClientUpdate = ClientCreate.partial().meta({ id: 'ClientUpdate' });

// --- Catalog (products and services) --------------------------------------------------

/**
 * `products` and `services` are identical in the Rails schema, so their shapes are
 * built once. Each still gets its own component id, because an OpenAPI consumer should
 * see two named types rather than one shared one.
 */
const catalogShape = {
  id,
  name: z.string(),
  priceCents: z.int().meta({ examples: [20_000] }),
  ...timestamps,
};

const catalogWriteShape = {
  name: z
    .string()
    .min(1)
    .max(255)
    .meta({ examples: ['Anti-virus software'] }),
  // Not constrained to be positive: Rails permits any integer here, and tightening it
  // would be a new business rule rather than a port of an existing one.
  priceCents: z.int().meta({ examples: [20_000] }),
};

export const ProductResponse = z.object(catalogShape).meta({ id: 'Product' });
export const ServiceResponse = z.object(catalogShape).meta({ id: 'Service' });

export const ProductCreate = z.object(catalogWriteShape).meta({ id: 'ProductCreate' });
export const ServiceCreate = z.object(catalogWriteShape).meta({ id: 'ServiceCreate' });

export const ProductUpdate = ProductCreate.partial().meta({ id: 'ProductUpdate' });
export const ServiceUpdate = ServiceCreate.partial().meta({ id: 'ServiceUpdate' });

// --- Invoices -------------------------------------------------------------------------

export const InvoiceResponse = z
  .object({
    id,
    clientId: id,
    netDays: z.int().meta({ examples: [30] }),
    note: z.string().nullable(),
    /** Derived: date(createdAt) + netDays. Returned so no consumer has to recompute it. */
    dueDate: z.iso.date().meta({ examples: ['2026-12-08'] }),
    /** Derived: the sum of every line item's subtotal. */
    totalCents: z.int().meta({ examples: [2_480_000] }),
    ...timestamps,
  })
  .meta({ id: 'Invoice' });

export const InvoiceCreate = z
  .object({
    clientId: id,
    netDays: z.int().default(30),
    // Nullable rather than coerced to '': the Rails column is genuinely nullable, so
    // `null` is the honest serialisation. The Django port returns '' instead.
    note: z.string().max(255).nullable().default(null),
  })
  .meta({ id: 'InvoiceCreate' });

export const InvoiceUpdate = z
  .object({
    clientId: id.optional(),
    netDays: z.int().optional(),
    note: z.string().max(255).nullable().optional(),
  })
  .meta({ id: 'InvoiceUpdate' });

export const InvoiceQuery = z.object({ clientId: optionalIdQuery() });

// --- Line items -----------------------------------------------------------------------

export const LineItemResponse = z
  .object({
    id,
    invoiceId: id,
    /** Exactly one of productId and serviceId is set; the other is null. */
    productId: id.nullable(),
    serviceId: id.nullable(),
    /** `null` means "no override, bill the catalog price". `0` means a free line. */
    priceOverrideCents: z.int().nullable(),
    quantity: z.int().meta({ examples: [40] }),
    description: z.string().nullable(),
    /** Derived: priceOverrideCents ?? the catalog row's priceCents. */
    unitPriceCents: z.int().meta({ examples: [4000] }),
    /** Derived: unitPriceCents * quantity. */
    subtotalCents: z.int().meta({ examples: [160_000] }),
    ...timestamps,
  })
  .meta({ id: 'LineItem' });

export const LineItemCreate = z
  .object({
    invoiceId: id,
    // Both nullable and both defaulted: the "exactly one" rule is a domain rule with
    // specific wording borrowed from Rails, so it is enforced in src/domain/pricing.ts
    // rather than as a Zod refinement, where the message would be harder to control.
    productId: id.nullable().default(null),
    serviceId: id.nullable().default(null),
    priceOverrideCents: z.int().nullable().default(null),
    quantity: z.int().default(1),
    description: z.string().max(255).nullable().default(null),
  })
  .meta({ id: 'LineItemCreate' });

export const LineItemUpdate = z
  .object({
    invoiceId: id.optional(),
    productId: id.nullable().optional(),
    serviceId: id.nullable().optional(),
    priceOverrideCents: z.int().nullable().optional(),
    quantity: z.int().optional(),
    description: z.string().max(255).nullable().optional(),
  })
  .meta({ id: 'LineItemUpdate' });

export const LineItemQuery = z.object({ invoiceId: optionalIdQuery() });
