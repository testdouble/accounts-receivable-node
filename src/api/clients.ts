/** Clients: full CRUD. */
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from '../domain/clients.ts';
import { route, type Route } from './route.ts';
import { ClientCreate, ClientResponse, ClientUpdate, IdParams } from './schemas.ts';
import { z } from 'zod';

const tags = ['clients'] as const;

export const clientRoutes: Route[] = [
  route({
    method: 'get',
    path: '/clients',
    operationId: 'listClients',
    summary: 'Every client, in id order',
    tags,
    status: 200,
    response: z.array(ClientResponse),
    handler: ({ db }) => listClients(db),
  }),
  route({
    method: 'post',
    path: '/clients',
    operationId: 'createClient',
    summary: 'Create a client',
    tags,
    body: ClientCreate,
    status: 201,
    response: ClientResponse,
    location: (client) => `/api/clients/${String(client.id)}`,
    handler: ({ db, body }) => createClient(db, body),
  }),
  route({
    method: 'get',
    path: '/clients/:id',
    operationId: 'getClient',
    summary: 'One client',
    tags,
    params: IdParams,
    status: 200,
    response: ClientResponse,
    handler: ({ db, params }) => getClient(db, params.id),
  }),
  route({
    method: 'patch',
    path: '/clients/:id',
    operationId: 'updateClient',
    summary: 'Update a client',
    tags,
    params: IdParams,
    body: ClientUpdate,
    status: 200,
    response: ClientResponse,
    handler: ({ db, params, body }) => updateClient(db, params.id, body),
  }),
  route({
    method: 'delete',
    path: '/clients/:id',
    operationId: 'deleteClient',
    summary: 'Delete a client, unless it still has invoices',
    tags,
    params: IdParams,
    status: 204,
    handler: async ({ db, params }) => {
      await deleteClient(db, params.id);
    },
  }),
];
