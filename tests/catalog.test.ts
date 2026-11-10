/**
 * Products and services.
 *
 * One parameterised suite, because the two resources share one implementation; running
 * it twice is what proves the shared code is actually wired to both tables.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ProductResponse, ServiceResponse } from '../src/api/schemas.ts';
import type { Db } from '../src/db/client.ts';
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

interface Resource {
  plural: string;
  schema: typeof ProductResponse;
  create: (db: Db, overrides?: { name?: string; priceCents?: number }) => Promise<{ id: number }>;
  /** Puts the row on a line item, so deleting it has to be refused. */
  reference: (db: Db, id: number) => Promise<unknown>;
  conflict: string;
}

const RESOURCES: Resource[] = [
  {
    plural: 'products',
    schema: ProductResponse,
    create: createProduct,
    reference: async (db, id) =>
      createLineItem(db, { invoiceId: (await createInvoice(db)).id, productId: id }),
    conflict: 'Product is still on a line item',
  },
  {
    plural: 'services',
    schema: ServiceResponse,
    create: createService,
    reference: async (db, id) =>
      createLineItem(db, { invoiceId: (await createInvoice(db)).id, serviceId: id }),
    conflict: 'Service is still on a line item',
  },
];

describe.each(RESOURCES)('$plural', (resource) => {
  const path = `/api/${resource.plural}`;

  it('lists nothing as an empty array', async () => {
    const response = await app.request.get(path);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('lists rows as a bare array', async () => {
    const row = await resource.create(app.db, { name: 'Programming', priceCents: 8000 });

    const response = await app.request.get(path);

    expect(response.status).toBe(200);
    expect(response.body.map((r: unknown) => resource.schema.parse(r))).toEqual([
      expect.objectContaining({ id: row.id, name: 'Programming', priceCents: 8000 }),
    ]);
  });

  it('returns one row', async () => {
    const row = await resource.create(app.db, { name: 'Refactoring' });

    const response = await app.request.get(`${path}/${String(row.id)}`);

    expect(response.status).toBe(200);
    expect(resource.schema.parse(response.body).name).toBe('Refactoring');
  });

  it('is a 404 for an unknown id', async () => {
    expect((await app.request.get(`${path}/99999`)).status).toBe(404);
  });

  it('is a 400 for a non-numeric id', async () => {
    expect((await app.request.get(`${path}/abc`)).status).toBe(400);
  });

  it('creates a row', async () => {
    const response = await app.request.post(path).send({ name: 'Programming', priceCents: 8000 });

    expect(response.status).toBe(201);
    expect(response.headers['location']).toBe(`${path}/${String(response.body.id)}`);
    expect(resource.schema.parse(response.body)).toMatchObject({
      name: 'Programming',
      priceCents: 8000,
    });
  });

  it('is a 422 without a price', async () => {
    const response = await app.request.post(path).send({ name: 'Programming' });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'priceCents'] });
  });

  it('is a 422 for a fractional price', async () => {
    // Cents are integers. A price of 80.5 cents is not a thing.
    const response = await app.request.post(path).send({ name: 'Programming', priceCents: 80.5 });

    expect(response.status).toBe(422);
  });

  it('accepts a price of zero', async () => {
    // A zero-priced row is allowed, and it is not then hidden from invoices. See
    // tests/invoices.test.ts.
    const response = await app.request.post(path).send({ name: 'Freebie', priceCents: 0 });

    expect(response.status).toBe(201);
    expect(response.body.priceCents).toBe(0);
  });

  it('updates one field', async () => {
    const row = await resource.create(app.db, { name: 'Programming', priceCents: 8000 });

    const response = await app.request
      .patch(`${path}/${String(row.id)}`)
      .send({ priceCents: 9000 });

    expect(response.status).toBe(200);
    expect(resource.schema.parse(response.body)).toMatchObject({
      name: 'Programming',
      priceCents: 9000,
    });
  });

  it('is a 404 updating an unknown id', async () => {
    expect((await app.request.patch(`${path}/99999`).send({ priceCents: 1 })).status).toBe(404);
  });

  it('deletes a row with a 204', async () => {
    const row = await resource.create(app.db);

    const response = await app.request.delete(`${path}/${String(row.id)}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await app.request.get(`${path}/${String(row.id)}`)).status).toBe(404);
  });

  it('is a 409 deleting a row that is still on a line item', async () => {
    const row = await resource.create(app.db);
    await resource.reference(app.db, row.id);

    const response = await app.request.delete(`${path}/${String(row.id)}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ detail: resource.conflict });
  });
});
