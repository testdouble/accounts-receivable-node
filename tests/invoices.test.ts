/** Invoices, and the two derived fields a consumer would otherwise have to recompute. */
import { beforeEach, describe, expect, it } from 'vitest';
import { InvoiceResponse } from '../src/api/schemas.ts';
import { dueDate } from '../src/domain/pricing.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';
import {
  createClient,
  createInvoice,
  createLineItem,
  createProduct,
  createService,
} from './helpers/factories.ts';

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

describe('GET /api/invoices', () => {
  it('is an empty array when there are none', async () => {
    const response = await app.request.get('/api/invoices');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('exposes the due date and total on the list, not just the detail', async () => {
    const acme = await createClient(app.db);
    const invoice = await createInvoice(app.db, { clientId: acme.id, netDays: 30 });
    const programming = await createService(app.db, { priceCents: 8000 });
    await createLineItem(app.db, {
      invoiceId: invoice.id,
      serviceId: programming.id,
      quantity: 40,
    });

    const response = await app.request.get('/api/invoices');

    expect(response.status).toBe(200);
    const [body] = response.body.map((row: unknown) => InvoiceResponse.parse(row));
    expect(body).toMatchObject({
      id: invoice.id,
      clientId: acme.id,
      netDays: 30,
      totalCents: 320_000,
      dueDate: dueDate(invoice.createdAt, 30),
    });
  });

  it('derives the due date from the invoice createdAt it reports', async () => {
    const invoice = await createInvoice(app.db, { netDays: 45 });

    const response = await app.request.get(`/api/invoices/${String(invoice.id)}`);
    const body = InvoiceResponse.parse(response.body);

    expect(body.dueDate).toBe(dueDate(new Date(body.createdAt), 45));
  });

  it('totals zero for an invoice with no line items', async () => {
    const invoice = await createInvoice(app.db);

    const response = await app.request.get(`/api/invoices/${String(invoice.id)}`);

    expect(response.body.totalCents).toBe(0);
  });

  it('counts a line item whose catalog row is priced at zero', async () => {
    // Rails filters these out of both its table and its total. This port does not; see
    // the README's "Rails behaviour deliberately not ported".
    const invoice = await createInvoice(app.db);
    const freebie = await createProduct(app.db, { priceCents: 0 });
    const paid = await createProduct(app.db, { priceCents: 500 });
    await createLineItem(app.db, { invoiceId: invoice.id, productId: freebie.id, quantity: 3 });
    await createLineItem(app.db, { invoiceId: invoice.id, productId: paid.id, quantity: 2 });

    const response = await app.request.get(`/api/invoices/${String(invoice.id)}`);

    expect(response.body.totalCents).toBe(1000);
  });

  it('bills the override on a line item whose catalog row is priced at zero', async () => {
    // The sharpest version of the Rails bug: the row is dropped even though the
    // override is exactly what should be billed.
    const invoice = await createInvoice(app.db);
    const freebie = await createProduct(app.db, { priceCents: 0 });
    await createLineItem(app.db, {
      invoiceId: invoice.id,
      productId: freebie.id,
      priceOverrideCents: 2500,
      quantity: 2,
    });

    const response = await app.request.get(`/api/invoices/${String(invoice.id)}`);

    expect(response.body.totalCents).toBe(5000);
  });

  it('filters by clientId', async () => {
    const acme = await createClient(app.db);
    const other = await createClient(app.db);
    const theirs = await createInvoice(app.db, { clientId: acme.id });
    await createInvoice(app.db, { clientId: other.id });

    const response = await app.request.get(`/api/invoices?clientId=${String(acme.id)}`);

    expect(response.status).toBe(200);
    expect(response.body.map((row: { id: number }) => row.id)).toEqual([theirs.id]);
  });

  it('is a 400 for a malformed clientId filter', async () => {
    const response = await app.request.get('/api/invoices?clientId=abc');

    expect(response.status).toBe(400);
    expect(response.body.detail[0]).toMatchObject({ loc: ['query', 'clientId'] });
  });
});

describe('POST /api/invoices', () => {
  it('defaults netDays to 30 and note to null', async () => {
    const acme = await createClient(app.db);

    const response = await app.request.post('/api/invoices').send({ clientId: acme.id });

    expect(response.status).toBe(201);
    expect(InvoiceResponse.parse(response.body)).toMatchObject({ netDays: 30, note: null });
  });

  it('is a 422 naming clientId when the client does not exist', async () => {
    // Rails lets this reach the foreign key and returns a 500. This port checks first.
    const response = await app.request.post('/api/invoices').send({ clientId: 99_999 });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'clientId'] });
  });

  it('is a 422 without a clientId', async () => {
    const response = await app.request.post('/api/invoices').send({});

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'clientId'] });
  });
});

describe('PATCH /api/invoices/:id', () => {
  it('updates netDays and the due date moves with it', async () => {
    const invoice = await createInvoice(app.db, { netDays: 30 });

    const response = await app.request
      .patch(`/api/invoices/${String(invoice.id)}`)
      .send({ netDays: 60 });

    expect(response.status).toBe(200);
    expect(response.body.netDays).toBe(60);
    expect(response.body.dueDate).toBe(dueDate(invoice.createdAt, 60));
  });

  it('clears the note when sent null', async () => {
    const invoice = await createInvoice(app.db, { note: 'Something' });

    const response = await app.request
      .patch(`/api/invoices/${String(invoice.id)}`)
      .send({ note: null });

    expect(response.status).toBe(200);
    expect(response.body.note).toBeNull();
  });

  it('is a 422 moving the invoice to a client that does not exist', async () => {
    const invoice = await createInvoice(app.db);

    const response = await app.request
      .patch(`/api/invoices/${String(invoice.id)}`)
      .send({ clientId: 99_999 });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'clientId'] });
  });

  it('is a 404 for an unknown id', async () => {
    expect((await app.request.patch('/api/invoices/99999').send({ netDays: 7 })).status).toBe(404);
  });
});

describe('DELETE /api/invoices/:id', () => {
  it('takes its line items with it', async () => {
    // Rails' `has_many :line_items, dependent: :destroy`, as an ON DELETE CASCADE.
    const invoice = await createInvoice(app.db);
    const service = await createService(app.db);
    const item = await createLineItem(app.db, { invoiceId: invoice.id, serviceId: service.id });

    expect((await app.request.delete(`/api/invoices/${String(invoice.id)}`)).status).toBe(204);
    expect((await app.request.get(`/api/invoices/${String(invoice.id)}`)).status).toBe(404);
    expect((await app.request.get(`/api/line-items/${String(item.id)}`)).status).toBe(404);
  });

  it('is a 404 for an unknown id', async () => {
    expect((await app.request.delete('/api/invoices/99999')).status).toBe(404);
  });
});
