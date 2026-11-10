/**
 * Development seed data. Safe to re-run.
 *
 * Every row is keyed on a natural key -- a name, or an invoice's note, or a line item's
 * description -- and inserted only when it is missing. That is what makes re-running
 * harmless. Upserting on hardcoded primary keys would only work on a database that is
 * already empty, and would silently overwrite whatever else holds those ids.
 *
 * The row that matters most is "Justin's discount programming", whose price override is
 * what makes the first invoice's total 2,480,000 cents rather than 2,640,000.
 *
 * Every database call in this file is awaited in sequence, and `no-await-in-loop` is
 * switched off for it in .oxlintrc.json. That is deliberate: each phase depends on rows
 * the previous phase created, and running the inserts concurrently would race the very
 * existence checks that make the script idempotent.
 */
import { and, eq } from 'drizzle-orm';
import { openDatabase, type Db } from './db/client.ts';
import { clients, invoices, lineItems, products, services } from './db/schema.ts';
import { env } from './env.ts';

const CLIENTS = [
  { name: 'Acme inc', email: 'ap@acme.com' },
  { name: 'Dunder Mifflin', email: 'ap@dundermifflin.com' },
];

const PRODUCTS = [
  { name: 'Anti-virus software', priceCents: 20_000 },
  { name: 'Serverless servers', priceCents: 100_000 },
];

const SERVICES = [
  { name: 'Programming', priceCents: 8000 },
  { name: 'Refactoring', priceCents: 35_000 },
];

/** Both billed to Acme, the first client, net 30. */
const INVOICE_NOTES = [
  'Invoice for writing software for Acme',
  'Invoice for refactoring software for Acme',
];

interface SeedLineItem {
  note: string;
  product?: string;
  service?: string;
  priceOverrideCents?: number;
  quantity: number;
  description: string;
}

const LINE_ITEMS: SeedLineItem[] = [
  {
    note: INVOICE_NOTES[0]!,
    service: 'Programming',
    quantity: 40,
    description: "Amber's quality programming",
  },
  {
    note: INVOICE_NOTES[0]!,
    service: 'Programming',
    // The row that exercises the override path. Without it the first invoice totals
    // 2,640,000 instead of 2,480,000.
    priceOverrideCents: 4000,
    quantity: 40,
    description: "Justin's discount programming",
  },
  {
    note: INVOICE_NOTES[0]!,
    product: 'Serverless servers',
    quantity: 20,
    description: 'Enough serverless hardware to achieve web-scale',
  },
  {
    note: INVOICE_NOTES[1]!,
    service: 'Refactoring',
    quantity: 40,
    description: 'Megan fixing previous discount programming',
  },
  {
    note: INVOICE_NOTES[1]!,
    product: 'Anti-virus software',
    quantity: 1,
    description: 'Anti-virus software subscription',
  },
];

export interface SeedResult {
  created: number;
  existing: number;
}

/**
 * Accumulates what happened, so the CLI can report it and the tests can assert on it.
 *
 * A closure rather than a class: a class would want `constructor(private readonly log)`,
 * and constructor parameter properties are exactly the TypeScript syntax Node cannot
 * strip. `erasableSyntaxOnly` in tsconfig.json rejects them at compile time, which is
 * the whole point of that flag.
 */
interface Tally {
  record: (didCreate: boolean, label: string) => void;
  result: () => SeedResult;
}

function makeTally(log: (message: string) => void): Tally {
  let created = 0;
  let existing = 0;

  return {
    record(didCreate, label) {
      if (didCreate) {
        created += 1;
        log(`Created ${label}`);
      } else {
        existing += 1;
        log(`${label} already exists`);
      }
    },
    result: () => ({ created, existing }),
  };
}

/** The three tables that have a unique-enough `name` to key on. */
async function seedNamed(db: Db, tally: Tally): Promise<void> {
  for (const row of CLIENTS) {
    const found = await db.query.clients.findFirst({ where: eq(clients.name, row.name) });
    if (found === undefined) {
      await db.insert(clients).values(row);
    }
    tally.record(found === undefined, `client ${row.name}`);
  }

  for (const row of PRODUCTS) {
    const found = await db.query.products.findFirst({ where: eq(products.name, row.name) });
    if (found === undefined) {
      await db.insert(products).values(row);
    }
    tally.record(found === undefined, `product ${row.name}`);
  }

  for (const row of SERVICES) {
    const found = await db.query.services.findFirst({ where: eq(services.name, row.name) });
    if (found === undefined) {
      await db.insert(services).values(row);
    }
    tally.record(found === undefined, `service ${row.name}`);
  }
}

/** Keyed on client and note, which together are unique here. Invoices have no name. */
async function seedInvoices(db: Db, tally: Tally): Promise<void> {
  const acme = await db.query.clients.findFirst({ where: eq(clients.name, CLIENTS[0]!.name) });

  if (acme === undefined) {
    throw new Error('Seed invariant broken: the first client was not created');
  }

  for (const note of INVOICE_NOTES) {
    const found = await db.query.invoices.findFirst({
      where: and(eq(invoices.clientId, acme.id), eq(invoices.note, note)),
    });
    if (found === undefined) {
      await db.insert(invoices).values({ clientId: acme.id, netDays: 30, note });
    }
    tally.record(found === undefined, `invoice ${note}`);
  }
}

/** Keyed on invoice and description, which is unique within each invoice. */
async function seedLineItems(db: Db, tally: Tally): Promise<void> {
  for (const item of LINE_ITEMS) {
    const invoice = await db.query.invoices.findFirst({ where: eq(invoices.note, item.note) });

    if (invoice === undefined) {
      throw new Error(`Seed invariant broken: no invoice noted ${item.note}`);
    }

    const found = await db.query.lineItems.findFirst({
      where: and(eq(lineItems.invoiceId, invoice.id), eq(lineItems.description, item.description)),
    });

    if (found === undefined) {
      // Exactly one of product and service is resolved, as the domain rule requires.
      const product =
        item.product === undefined
          ? undefined
          : await db.query.products.findFirst({ where: eq(products.name, item.product) });
      const service =
        item.service === undefined
          ? undefined
          : await db.query.services.findFirst({ where: eq(services.name, item.service) });

      await db.insert(lineItems).values({
        invoiceId: invoice.id,
        productId: product?.id ?? null,
        serviceId: service?.id ?? null,
        priceOverrideCents: item.priceOverrideCents ?? null,
        quantity: item.quantity,
        description: item.description,
      });
    }

    tally.record(found === undefined, `line item ${item.description}`);
  }
}

export async function seed(db: Db, log: (message: string) => void = () => {}): Promise<SeedResult> {
  const tally = makeTally(log);

  await seedNamed(db, tally);
  await seedInvoices(db, tally);
  await seedLineItems(db, tally);

  return tally.result();
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const result = await seed(openDatabase(env.DATABASE_URL), (message) => {
    console.log(message);
  });
  console.log(
    `\n${String(result.created)} rows created, ${String(result.existing)} already present.`,
  );
}
