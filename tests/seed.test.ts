/**
 * The seed data, and the end-to-end assertion this whole port is measured by.
 *
 * The first invoice totals 2,480,000 cents only if the price override is honoured AND
 * no zero-price filter is applied. Get the override wrong the way the abandoned Prisma
 * port did and it reads 2,640,000.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../src/seed.ts';
import { countRows } from '../src/domain/billing.ts';
import { listInvoices } from '../src/domain/billing.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

describe('seed', () => {
  it('creates the expected rows', async () => {
    const result = await seed(app.db);

    expect(result).toEqual({ created: 13, existing: 0 });
    expect(await countRows(app.db)).toEqual({
      clients: 2,
      products: 2,
      services: 2,
      invoices: 2,
      lineItems: 5,
    });
  });

  it('is safe to re-run: no new rows and no changed ids', async () => {
    await seed(app.db);
    const before = await listInvoices(app.db);

    const result = await seed(app.db);

    expect(result).toEqual({ created: 0, existing: 13 });
    expect(await countRows(app.db)).toEqual({
      clients: 2,
      products: 2,
      services: 2,
      invoices: 2,
      lineItems: 5,
    });
    expect((await listInvoices(app.db)).map((invoice) => invoice.id)).toEqual(
      before.map((invoice) => invoice.id),
    );
  });

  it('totals the two invoices the way the Rails app does', async () => {
    await seed(app.db);

    const invoices = await listInvoices(app.db);

    expect(invoices.map((invoice) => invoice.totalCents)).toEqual([2_480_000, 1_420_000]);
  });

  it('serves those totals over HTTP', async () => {
    await seed(app.db);

    const response = await app.request.get('/api/invoices');

    expect(response.status).toBe(200);
    expect(response.body.map((row: { totalCents: number }) => row.totalCents)).toEqual([
      2_480_000, 1_420_000,
    ]);
  });

  it('gives every line item exactly one of a product and a service', async () => {
    await seed(app.db);

    const response = await app.request.get('/api/line-items');

    for (const item of response.body as { productId: number | null; serviceId: number | null }[]) {
      expect([item.productId, item.serviceId].filter((id) => id !== null)).toHaveLength(1);
    }
  });

  it('includes the discounted row that exercises the override path', async () => {
    await seed(app.db);

    const response = await app.request.get('/api/line-items');
    const discounted = (response.body as { description: string }[]).find(
      (item) => item.description === "Justin's discount programming",
    ) as unknown as { priceOverrideCents: number; unitPriceCents: number; subtotalCents: number };

    expect(discounted).toMatchObject({
      priceOverrideCents: 4000,
      unitPriceCents: 4000,
      subtotalCents: 160_000,
    });
  });
});
