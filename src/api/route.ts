/**
 * `route()` declares an endpoint once and uses that one declaration both to mount an
 * Express handler and to describe an OpenAPI operation.
 *
 * This adapter exists because Express has no way to bind a response schema to a route:
 * a small hand-written bridge, with a docstring saying why, and its own tests.
 *
 * Two properties are load-bearing:
 *
 *   1. The response schema is parsed on the way OUT. A handler that drops a field,
 *      renames one, or returns the wrong type fails loudly instead of shipping a hole
 *      in the JSON. This is what makes the response schemas tests rather than prose.
 *
 *   2. A route is a value, not a side effect. `ALL_ROUTES` in `routes.ts` is a plain
 *      array, so `openapi.ts` cannot document an endpoint that is not mounted, and
 *      `app.ts` cannot mount one that is not documented. Building the app twice -- as
 *      every test file does -- registers nothing twice.
 *
 * There is deliberately no async wrapper here. Express 5 forwards a rejected promise
 * from an async handler to the error middleware by itself, which is the single biggest
 * reason this project is on Express 5 rather than 4.
 */
import type { Router } from 'express';
import type { ZodType, z } from 'zod';
import type { Db } from '../db/client.ts';
import { parseRequestPart } from './validate.ts';

export type Method = 'get' | 'post' | 'patch' | 'delete';

/** 204 carries no body, so it is the one status that takes no response schema. */
export type Status = 200 | 201 | 204;

export interface RouteSpec<
  Params extends ZodType,
  Query extends ZodType,
  Body extends ZodType,
  Response extends ZodType,
> {
  method: Method;
  /** Express form, e.g. '/clients/:id'. `openapi.ts` rewrites it to '{id}'. */
  path: string;
  operationId: string;
  summary: string;
  tags: readonly string[];
  params?: Params;
  query?: Query;
  body?: Body;
  status: Status;
  response?: Response;
  /** Builds the Location header for a 201. */
  location?: (payload: z.output<Response>) => string;
  handler: (ctx: {
    db: Db;
    params: z.output<Params>;
    query: z.output<Query>;
    body: z.output<Body>;
  }) => Promise<z.input<Response>>;
}

/**
 * A route with its generics erased, so routes of different shapes live in one array.
 * Keeps the metadata `openapi.ts` needs and hides the handler behind `mount`.
 */
export interface Route {
  method: Method;
  path: string;
  operationId: string;
  summary: string;
  tags: readonly string[];
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  status: Status;
  response?: ZodType;
  mount: (router: Router, db: Db) => void;
}

export function route<
  Params extends ZodType,
  Query extends ZodType,
  Body extends ZodType,
  Response extends ZodType,
>(spec: RouteSpec<Params, Query, Body, Response>): Route {
  const mount = (router: Router, db: Db): void => {
    router[spec.method](spec.path, async (req, res) => {
      const result = await spec.handler({
        db,
        params: parseRequestPart(spec.params, req.params, 'path'),
        query: parseRequestPart(spec.query, req.query, 'query'),
        body: parseRequestPart(spec.body, req.body, 'body'),
      });

      if (spec.status === 204 || spec.response === undefined) {
        res.status(204).end();
        return;
      }

      // The outbound gate. See the module docstring.
      const payload = spec.response.parse(result);

      if (spec.location !== undefined) {
        res.location(spec.location(payload));
      }

      res.status(spec.status).json(payload);
    });
  };

  return {
    method: spec.method,
    path: spec.path,
    operationId: spec.operationId,
    summary: spec.summary,
    tags: spec.tags,
    ...(spec.params === undefined ? {} : { params: spec.params }),
    ...(spec.query === undefined ? {} : { query: spec.query }),
    ...(spec.body === undefined ? {} : { body: spec.body }),
    status: spec.status,
    ...(spec.response === undefined ? {} : { response: spec.response }),
    mount,
  };
}
