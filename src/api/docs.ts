/**
 * /api/openapi.json and the Swagger UI at /api/docs.
 *
 * Swagger UI's assets are served straight out of `swagger-ui-dist` rather than through
 * `swagger-ui-express`. The wrapper was last published in May 2024 and its only
 * dependency is an unbounded `"swagger-ui-dist": ">=5.0.0"`, which would mean one of
 * this project's dependencies is whatever that package published most recently. Serving
 * the assets directly costs about ten lines and keeps every version pinned.
 */
import express, { type Router } from 'express';
import { createRequire } from 'node:module';
import { buildDocument } from './openapi.ts';

const require = createRequire(import.meta.url);

/** Where npm put the Swagger UI assets. Resolved, not guessed at. */
const SWAGGER_UI_DIR = require
  .resolve('swagger-ui-dist/package.json')
  .replace(/\/package\.json$/u, '');

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accounts Receivable API</title>
    <link rel="stylesheet" href="./docs-assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="./docs-assets/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({ url: './openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>
`;

export function mountDocs(router: Router): void {
  // Built once at startup: the document is derived from module-level schemas, so it
  // cannot change between requests.
  const document = buildDocument();

  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });

  router.use('/docs-assets', express.static(SWAGGER_UI_DIR, { index: false }));

  router.get('/docs', (_req, res) => {
    res.type('html').send(PAGE);
  });
}
