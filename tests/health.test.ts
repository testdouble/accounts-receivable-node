/** The Zod validation path is genuinely exercised by a request, not merely imported. */
import { beforeEach, expect, it } from 'vitest';
import { HealthResponse } from '../src/api/schemas.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

it('reports ok and what it is running on', async () => {
  const response = await app.request.get('/api/health');

  expect(response.status).toBe(200);
  // Round-tripping through the schema is the real assertion: it fails if the endpoint
  // drops a field or changes a type.
  const body = HealthResponse.parse(response.body);
  expect(body.status).toBe('ok');
  expect(body.nodeVersion).toBe(process.version);
});

it('serves a 404 as JSON for an unknown path', async () => {
  const response = await app.request.get('/api/nope');

  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
