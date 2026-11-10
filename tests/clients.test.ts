/**
 * Clients: the full CRUD surface, including the two deliberate behaviours -- a
 * duplicate email is allowed, and deleting a client that still has invoices is a 409.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientResponse } from '../src/api/schemas.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';
import { createClient, createInvoice } from './helpers/factories.ts';

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

describe('GET /api/clients', () => {
  it('is an empty array, not a 404, when there are none', async () => {
    const response = await app.request.get('/api/clients');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('is a bare array rather than an envelope', async () => {
    const acme = await createClient(app.db, { name: 'Acme inc', email: 'ap@acme.com' });

    const response = await app.request.get('/api/clients');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    // Round-trip through the schema: a dropped or retyped field fails here.
    const [body] = response.body.map((row: unknown) => ClientResponse.parse(row));
    expect(body).toMatchObject({ id: acme.id, name: 'Acme inc', email: 'ap@acme.com' });
  });

  it('is ordered by id', async () => {
    await createClient(app.db, { name: 'Zeta' });
    await createClient(app.db, { name: 'Alpha' });

    const response = await app.request.get('/api/clients');

    expect(response.body.map((row: { name: string }) => row.name)).toEqual(['Zeta', 'Alpha']);
  });
});

describe('GET /api/clients/:id', () => {
  it('returns the client', async () => {
    const acme = await createClient(app.db, { name: 'Acme inc' });

    const response = await app.request.get(`/api/clients/${String(acme.id)}`);

    expect(response.status).toBe(200);
    expect(ClientResponse.parse(response.body).name).toBe('Acme inc');
  });

  it('is a 404 for an unknown id', async () => {
    const response = await app.request.get('/api/clients/99999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: 'Not Found' });
  });

  it('is a 400 for an id that is not a number', async () => {
    const response = await app.request.get('/api/clients/abc');

    expect(response.status).toBe(400);
    expect(response.body.detail[0]).toMatchObject({ loc: ['path', 'id'] });
  });

  it('is a 400 for a zero id', async () => {
    expect((await app.request.get('/api/clients/0')).status).toBe(400);
  });

  it('is a 400 for a negative id', async () => {
    expect((await app.request.get('/api/clients/-1')).status).toBe(400);
  });
});

describe('POST /api/clients', () => {
  it('creates the client and reports where it went', async () => {
    const response = await app.request
      .post('/api/clients')
      .send({ name: 'Acme inc', email: 'ap@acme.com' });

    expect(response.status).toBe(201);
    expect(response.headers['location']).toBe(`/api/clients/${String(response.body.id)}`);
    expect(ClientResponse.parse(response.body)).toMatchObject({
      name: 'Acme inc',
      email: 'ap@acme.com',
    });
  });

  it('is a 422 naming the missing field', async () => {
    const response = await app.request.post('/api/clients').send({ name: 'Acme inc' });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'email'] });
  });

  it('is a 422 for a malformed email', async () => {
    const response = await app.request
      .post('/api/clients')
      .send({ name: 'Acme inc', email: 'not-an-email' });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'email'] });
  });

  it('is a 422 for a blank name', async () => {
    const response = await app.request
      .post('/api/clients')
      .send({ name: '', email: 'ap@acme.com' });

    expect(response.status).toBe(422);
    expect(response.body.detail[0]).toMatchObject({ loc: ['body', 'name'] });
  });

  it('allows two clients to share one email address', async () => {
    // Pins a deliberate schema decision: there is no uniqueness constraint on email,
    // because two subsidiaries can share one accounts-payable address.
    const first = await app.request
      .post('/api/clients')
      .send({ name: 'Acme inc', email: 'ap@acme.com' });
    const second = await app.request
      .post('/api/clients')
      .send({ name: 'Acme Subsidiary', email: 'ap@acme.com' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it('ignores unknown keys', async () => {
    const response = await app.request
      .post('/api/clients')
      .send({ name: 'Acme inc', email: 'ap@acme.com', id: 7, nonsense: true });

    expect(response.status).toBe(201);
    expect(response.body.id).not.toBe(7);
    expect(response.body).not.toHaveProperty('nonsense');
  });

  it('is a 400 for a malformed JSON body', async () => {
    const response = await app.request
      .post('/api/clients')
      .set('content-type', 'application/json')
      .send('{"name":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ detail: 'Malformed JSON body' });
  });
});

describe('PATCH /api/clients/:id', () => {
  it('updates one field and leaves the rest alone', async () => {
    const acme = await createClient(app.db, { name: 'Acme inc', email: 'ap@acme.com' });

    const response = await app.request
      .patch(`/api/clients/${String(acme.id)}`)
      .send({ name: 'Acme Incorporated' });

    expect(response.status).toBe(200);
    expect(ClientResponse.parse(response.body)).toMatchObject({
      name: 'Acme Incorporated',
      email: 'ap@acme.com',
    });
  });

  it('is a no-op for an empty body', async () => {
    const acme = await createClient(app.db, { name: 'Acme inc' });

    const response = await app.request.patch(`/api/clients/${String(acme.id)}`).send({});

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Acme inc');
  });

  it('is a 404 for an unknown id', async () => {
    const response = await app.request.patch('/api/clients/99999').send({ name: 'Nobody' });

    expect(response.status).toBe(404);
  });

  it('is a 422 for a malformed email', async () => {
    const acme = await createClient(app.db);

    const response = await app.request
      .patch(`/api/clients/${String(acme.id)}`)
      .send({ email: 'nope' });

    expect(response.status).toBe(422);
  });
});

describe('DELETE /api/clients/:id', () => {
  it('is a 204 with no body, and the client is gone', async () => {
    const acme = await createClient(app.db);

    const response = await app.request.delete(`/api/clients/${String(acme.id)}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect((await app.request.get(`/api/clients/${String(acme.id)}`)).status).toBe(404);
  });

  it('is a 404 for an unknown id', async () => {
    expect((await app.request.delete('/api/clients/99999')).status).toBe(404);
  });

  it('is a 409 when the client still has invoices', async () => {
    // The invoices foreign key is declared `restrict`.
    const acme = await createClient(app.db);
    await createInvoice(app.db, { clientId: acme.id });

    const response = await app.request.delete(`/api/clients/${String(acme.id)}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ detail: 'Client still has invoices' });
  });
});
