/**
 * Builds the Express application around a database handle.
 *
 * The handle is injected rather than imported so that `tests/helpers/app.ts` can hand
 * in a fresh in-memory database per test file. `server.ts` is the only place that opens
 * the real one, and the only place that listens.
 *
 * Middleware is deliberately minimal: a JSON body parser, the routes, a 404 and the
 * error handler. There is no helmet, no CORS and no request logging, because this
 * application has no users, no sessions and no browser client.
 */
import express, { type Express } from 'express';
import type { Db } from './db/client.ts';
import { mountDocs } from './api/docs.ts';
import { errorHandler, notFound } from './api/errors.ts';
import { ALL_ROUTES } from './api/routes.ts';

export function createApp({ db }: { db: Db }): Express {
  const app = express();
  const api = express.Router();

  app.use(express.json());

  mountDocs(api);

  for (const route of ALL_ROUTES) {
    route.mount(api, db);
  }

  app.use('/api', api);

  // A bare `app.use` with no path, not `app.all('*')`: Express 5 moved to
  // path-to-regexp 8, where a lone `*` is no longer a valid pattern.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
