/**
 * The OpenAPI 3.1 document, generated from the same Zod schemas the routes validate
 * against.
 *
 * `createDocument` is a pure function over `ALL_ROUTES`, so `tests/openapi.test.ts` can
 * assert on the document without starting a server.
 *
 * Note there is no `target: 'openapi-3.1'` anywhere. Zod's `toJSONSchema` has no such
 * target -- OpenAPI 3.1 uses JSON Schema draft 2020-12 as its dialect, which is Zod's
 * default output, and passing an unrecognised target string produces malformed output
 * instead of an error.
 */
import { createDocument } from 'zod-openapi';
import { ALL_ROUTES } from './routes.ts';
import { ErrorResponse } from './schemas.ts';

/** Express writes ':id'; OpenAPI wants '{id}'. */
const EXPRESS_PARAM = /:([A-Za-z_]\w*)/gu;

/**
 * The error responses every route can produce. Declared once and attached to each
 * operation, so the document tells a consumer about the 4xx bodies without each route
 * having to repeat them.
 */
const errorContent = {
  content: { 'application/json': { schema: ErrorResponse } },
};

function responsesFor(route: (typeof ALL_ROUTES)[number]) {
  const responses: Record<string, unknown> = {};

  if (route.status === 204 || route.response === undefined) {
    responses['204'] = { description: 'No Content' };
  } else {
    responses[String(route.status)] = {
      description: route.status === 201 ? 'Created' : 'OK',
      content: { 'application/json': { schema: route.response } },
    };
  }

  if (route.params !== undefined || route.query !== undefined) {
    responses['400'] = { description: 'Malformed path or query parameter', ...errorContent };
    responses['404'] = { description: 'Not Found', ...errorContent };
  }

  if (route.body !== undefined) {
    responses['422'] = { description: 'Validation failed', ...errorContent };
  }

  if (route.method === 'delete') {
    responses['409'] = { description: 'Still referenced by another row', ...errorContent };
  }

  return responses;
}

export function buildDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of ALL_ROUTES) {
    // Prefixed with /api so the document's keys are the URLs a consumer actually calls,
    // which is how the Django port's openapi.json reads too.
    const key = `/api${route.path.replaceAll(EXPRESS_PARAM, '{$1}')}`;
    const operations = (paths[key] ??= {});

    operations[route.method] = {
      operationId: route.operationId,
      summary: route.summary,
      tags: [...route.tags],
      ...(route.params === undefined && route.query === undefined
        ? {}
        : {
            requestParams: {
              ...(route.params === undefined ? {} : { path: route.params }),
              ...(route.query === undefined ? {} : { query: route.query }),
            },
          }),
      ...(route.body === undefined
        ? {}
        : {
            requestBody: {
              content: { 'application/json': { schema: route.body } },
            },
          }),
      responses: responsesFor(route),
    };
  }

  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Accounts Receivable',
      version: '0.1.0',
      description:
        'Creating, sending and tracking invoices sent to clients. This API has no users ' +
        'and no authentication at all.',
    },
    paths,
  });
}
