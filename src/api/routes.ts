/**
 * Every route in the API, as one list.
 *
 * `app.ts` mounts this list and `openapi.ts` documents it, so the two cannot disagree:
 * an endpoint that is not here is neither served nor documented.
 */
import { clientRoutes } from './clients.ts';
import { invoiceRoutes, lineItemRoutes } from './billing.ts';
import { productRoutes, serviceRoutes } from './catalog.ts';
import { metaRoutes } from './meta.ts';
import type { Route } from './route.ts';

export const ALL_ROUTES: readonly Route[] = [
  ...metaRoutes,
  ...clientRoutes,
  ...productRoutes,
  ...serviceRoutes,
  ...invoiceRoutes,
  ...lineItemRoutes,
];
