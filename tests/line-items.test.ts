/**
 * Line items -- the resource that carries this application's two real rules: exactly
 * one of product or service, and the price override.
 *
 * The test that matters most is "an override of zero is a free line". An earlier
 * abandoned Node port of this app ignored the override entirely, and its one
 * business-logic test asserted the wrong total rather than catching it.
 */
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { LineItemResponse } from '../src/api/schemas.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';
import {
  createInvoice,
  createLineItem,
  createProduct,
  createService,
} from './helpers/factories.ts';

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

describe('the product-or-service rule', () => {
  it('is a 422 with the Rails message when neither is given', async () => {
    const invoice = await createInvoice(app.db);

    const response = await app.request.post('/api/line-items').send({ invoiceId: invoice.id });

    expect(response.status).toBe(422);
    expect(response.body.detail[0].msg).toBe('A line item must be either a product or a service');
  });

  it('is a 422 with the Rails message when both are given', async () => {
    const invoice = await createInvoice(app.db);
    const product = await createProduct(app.db);
    const service = await createService(app.db);

    const response = await app.request
      .post('/api/line-items')
      .send({ invoiceId: invoice.id, productId: product.id, serviceId: service.id });

    expect(response.status).toBe(422);
    expect(response.body.detail[0].msg).toBe("A line item can't be both a product and a service");
  });

  it('is enforced against the merged row on a PATCH, not just the patch', async () => {
    // A patch that sets serviceId looks fine on its own; it is only invalid because the
    // row already has a productId.
    const product = await createProduct(app.db);
    const service = await createService(app.db);
    const item = await createLineItem(app.db, { productId: product.id });

    const response = await app.request
      .patch(`/api/line-items/${String(item.id)}`)
      .send({ serviceId: service.id });

    expect(response.status).toBe(422);
    expect(response.body.detail[0].msg).toBe("A line item can't be both a product and a service");
  });

  it('allows swapping a product for a service in one patch', async () => {
    const product = await createProduct(app.db);
    const service = await createService(app.db, { priceCents: 8000 });
    const item = await createLineItem(app.db, { productId: product.id });

    const response = await app.request
      .patch(`/api/line-items/${String(item.id)}`)
      .send({ productId: null, serviceId: service.id });

    expect(response.status).toBe(200);
    expect(LineItemResponse.parse(response.body)).toMatchObject({
      productId: null,
      serviceId: service.id,
      unitPriceCents: 8000,
    });
  });
});

describe('pricing', () => {
  it('prices from the catalog row when there is no override', async () => {
    const invoice = await createInvoice(app.db);
    const product = await createProduct(app.db, { priceCents: 20_000 });

    const response = await app.request
      .post('/api/line-items')
      .send({ invoiceId: invoice.id, productId: product.id, quantity: 2 });

    expect(response.status).toBe(201);
    expect(LineItemResponse.parse(response.body)).toMatchObject({
      priceOverrideCents: null,
      unitPriceCents: 20_000,
      subtotalCents: 40_000,
    });
  });

  it('treats an override of zero as a free line, and the invoice total agrees', async () => {
    // THE test. With `||` instead of `??` the unit price would be 8000, the subtotal
    // 40000, and the invoice total 40000.
    const invoice = await createInvoice(app.db);
    const service = await createService(app.db, { priceCents: 8000 });

    const response = await app.request.post('/api/line-items').send({
      invoiceId: invoice.id,
      serviceId: service.id,
      priceOverrideCents: 0,
      quantity: 5,
    });

    expect(response.status).toBe(201);
    expect(LineItemResponse.parse(response.body)).toMatchObject({
      priceOverrideCents: 0,
      unitPriceCents: 0,
      subtotalCents: 0,
    });

    const invoiceResponse = await app.request.get(`/api/invoices/${String(invoice.id)}`);
    expect(invoiceResponse.body.totalCents).toBe(0);
  });

  it("prices the seed's discounted row the way the Rails app does", async () => {
    const invoice = await createInvoice(app.db);
    const programming = await createService(app.db, { priceCents: 8000 });

    const response = await app.request.post('/api/line-items').send({
      invoiceId: invoice.id,
      serviceId: programming.id,
      priceOverrideCents: 4000,
      quantity: 40,
      description: "Justin's discount programming",
    });

    expect(response.status).toBe(201);
    expect(response.body.unitPriceCents).toBe(4000);
    expect(response.body.subtotalCents).toBe(160_000);
  });

  it('falls back to the catalog price when an override is cleared', async () => {
    const service = await createService(app.db, { priceCents: 8000 });
    const item = await createLineItem(app.db, {
      serviceId: service.id,
      priceOverrideCents: 4000,
      quantity: 2,
    });

    const response = await app.request
      .patch(`/api/line-items/${String(item.id)}`)
      .send({ priceOverrideCents: null });

    expect(response.status).toBe(200);
    expect(LineItemResponse.parse(response.body)).toMatchObject({
      priceOverrideCents: null,
      unitPriceCents: 8000,
      subtotalCents: 16_000,
    });
  });

  it('accepts a negative override, as Rails does', async () => {
    const invoice = await createInvoice(app.db);
    const service = await createService(app.db, { priceCents: 8000 });

    const response = await app.request.post('/api/line-items').send({
      invoiceId: invoice.id,
      serviceId: service.id,
      priceOverrideCents: -500,
      quantity: 1,
    });

    expect(response.status).toBe(201);
    expect(response.body.subtotalCents).toBe(-500);
  });
});

describe('referential checks', () => {
  it('is a 422 naming invoiceId when the invoice does not exist', async () => {
    const service = await createService(app.db);

    const response = await app.request
      .post('/api/line-items')
      .send({ invoiceId: 99_999, serviceId: service.id });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'invoiceId'] });
  });

  it('is a 422 naming productId when the product does not exist', async () => {
    const invoice = await createInvoice(app.db);

    const response = await app.request
      .post('/api/line-items')
      .send({ invoiceId: invoice.id, productId: 99_999 });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'productId'] });
  });

  it('actually enforces foreign keys, so the 409 paths are not decorative', async () => {
    // Proves PRAGMA foreign_keys is on. Without it SQLite accepts this silently and
    // every "still referenced" 409 in this suite would be enforced only by the
    // application's own pre-checks. The driver's error is wrapped by Drizzle, so the
    // SQLITE_ code is on the cause rather than on what is thrown -- see
    // tests/errors.test.ts, which pins the unwrapping the error middleware does.
    const service = await createService(app.db);
    const item = await createLineItem(app.db, { serviceId: service.id });

    // better-sqlite3 is a synchronous driver, so this throws rather than rejecting.
    expect(() => {
      app.db.run(sql`update line_items set service_id = 99999 where id = ${item.id}`);
    }).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
      }),
    );
  });
});

describe('the rest of the surface', () => {
  it('lists line items as a bare array, in id order', async () => {
    const service = await createService(app.db);
    const first = await createLineItem(app.db, { serviceId: service.id });
    const second = await createLineItem(app.db, { serviceId: service.id });

    const response = await app.request.get('/api/line-items');

    expect(response.status).toBe(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([first.id, second.id]);
  });

  it('filters by invoiceId', async () => {
    const invoice = await createInvoice(app.db);
    const service = await createService(app.db);
    const mine = await createLineItem(app.db, { invoiceId: invoice.id, serviceId: service.id });
    await createLineItem(app.db, { serviceId: service.id });

    const response = await app.request.get(`/api/line-items?invoiceId=${String(invoice.id)}`);

    expect(response.body.map((row: { id: number }) => row.id)).toEqual([mine.id]);
  });

  it('is a 400 for a malformed invoiceId filter', async () => {
    expect((await app.request.get('/api/line-items?invoiceId=abc')).status).toBe(400);
  });

  it('deletes with a 204', async () => {
    const service = await createService(app.db);
    const item = await createLineItem(app.db, { serviceId: service.id });

    expect((await app.request.delete(`/api/line-items/${String(item.id)}`)).status).toBe(204);
    expect((await app.request.get(`/api/line-items/${String(item.id)}`)).status).toBe(404);
  });

  it('is a 404 for an unknown id', async () => {
    expect((await app.request.get('/api/line-items/99999')).status).toBe(404);
  });
});
