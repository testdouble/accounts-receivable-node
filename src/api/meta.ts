/** Endpoints about the service itself rather than the domain. */
import { route, type Route } from './route.ts';
import { HealthResponse } from './schemas.ts';

export const metaRoutes: Route[] = [
  route({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    summary: 'Report that the stack is wired up, and what it is running on',
    tags: ['meta'],
    status: 200,
    response: HealthResponse,
    handler: () => Promise.resolve({ status: 'ok' as const, nodeVersion: process.version }),
  }),
];
