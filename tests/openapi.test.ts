/**
 * The OpenAPI document describes exactly what is mounted.
 *
 * Because `buildDocument()` and `createApp()` read the same `ALL_ROUTES` array, these
 * tests catch the kind of drift where an endpoint exists but is undocumented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDocument } from '../src/api/openapi.ts';
import { ALL_ROUTES } from '../src/api/routes.ts';
import { makeTestApp, type TestApp } from './helpers/app.ts';

/**
 * The document's paths, already narrowed.
 *
 * The narrowing lives here rather than in a test body on purpose: an `?? {}` inside a
 * test is a branch that can quietly swallow "the document had no paths at all", which
 * is exactly the failure these tests are for.
 */
function documentPaths(): Record<string, unknown> {
  const { paths } = buildDocument();

  if (paths === undefined) {
    throw new Error('the OpenAPI document has no paths at all');
  }

  return paths;
}

function documentSchemas(): Record<string, unknown> {
  const schemas = buildDocument().components?.schemas;

  if (schemas === undefined) {
    throw new Error('the OpenAPI document registered no schema components');
  }

  return schemas;
}

let app: TestApp;

beforeEach(() => {
  app = makeTestApp();
});

describe('the document', () => {
  it('builds without an Express app at all', () => {
    // The property that motivated choosing zod-openapi: createDocument is pure.
    expect(buildDocument().openapi).toBe('3.1.0');
  });

  // One case per route rather than a loop inside one test, so a gap names the route
  // that has it.
  it.each([...ALL_ROUTES])('documents $method $path', (route) => {
    const paths = documentPaths();
    const key = `/api${route.path.replaceAll(/:([A-Za-z_]\w*)/gu, '{$1}')}`;

    expect(Object.keys(paths)).toContain(key);
    expect(paths[key]).toHaveProperty(route.method);
  });

  it.each([...ALL_ROUTES])('gives $operationId a summary and a tag', (route) => {
    expect(route.summary).not.toBe('');
    expect(route.tags.length).toBeGreaterThan(0);
  });

  it('gives every route a unique operationId', () => {
    const ids = ALL_ROUTES.map((route) => route.operationId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers the reusable schema components', () => {
    expect(Object.keys(documentSchemas())).toEqual(
      expect.arrayContaining(['Client', 'Product', 'Service', 'Invoice', 'LineItem']),
    );
  });
});

describe('the endpoints', () => {
  it('serves the document as JSON', async () => {
    const response = await app.request.get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths).toHaveProperty('/api/health');
    expect(response.body.paths).toHaveProperty('/api/line-items/{id}');
  });

  it('serves the docs page as HTML', async () => {
    const response = await app.request.get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/u);
    expect(response.text).toContain('swagger-ui');
  });

  it('serves the Swagger UI assets it references', async () => {
    const response = await app.request.get('/api/docs-assets/swagger-ui.css');

    expect(response.status).toBe(200);
  });
});
