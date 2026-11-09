/**
 * Products and services.
 *
 * Both are generated from one builder, since the two resources are identical apart
 * from their path, their tags and their schema component names.
 */
import { z } from 'zod';
import {
  createCatalogItem,
  deleteCatalogItem,
  getCatalogItem,
  listCatalog,
  updateCatalogItem,
  type CatalogKind,
} from '../domain/catalog.ts';
import { route, type Route } from './route.ts';
import {
  IdParams,
  ProductCreate,
  ProductResponse,
  ProductUpdate,
  ServiceCreate,
  ServiceResponse,
  ServiceUpdate,
} from './schemas.ts';

interface CatalogConfig {
  kind: CatalogKind;
  /** The URL segment, e.g. 'products'. */
  plural: string;
  /** Capitalised, for operation ids: 'Product' -> listProducts, getProduct. */
  singularPascal: string;
  response: typeof ProductResponse;
  create: typeof ProductCreate;
  update: typeof ProductUpdate;
}

function catalogRoutes(config: CatalogConfig): Route[] {
  const tags = [config.plural];
  const { singularPascal: one, plural } = config;

  return [
    route({
      method: 'get',
      path: `/${plural}`,
      operationId: `list${one}s`,
      summary: `Every ${config.kind}, in id order`,
      tags,
      status: 200,
      response: z.array(config.response),
      handler: ({ db }) => listCatalog(db, config.kind),
    }),
    route({
      method: 'post',
      path: `/${plural}`,
      operationId: `create${one}`,
      summary: `Create a ${config.kind}`,
      tags,
      body: config.create,
      status: 201,
      response: config.response,
      location: (item) => `/api/${plural}/${String(item.id)}`,
      handler: ({ db, body }) => createCatalogItem(db, config.kind, body),
    }),
    route({
      method: 'get',
      path: `/${plural}/:id`,
      operationId: `get${one}`,
      summary: `One ${config.kind}`,
      tags,
      params: IdParams,
      status: 200,
      response: config.response,
      handler: ({ db, params }) => getCatalogItem(db, config.kind, params.id),
    }),
    route({
      method: 'patch',
      path: `/${plural}/:id`,
      operationId: `update${one}`,
      summary: `Update a ${config.kind}`,
      tags,
      params: IdParams,
      body: config.update,
      status: 200,
      response: config.response,
      handler: ({ db, params, body }) => updateCatalogItem(db, config.kind, params.id, body),
    }),
    route({
      method: 'delete',
      path: `/${plural}/:id`,
      operationId: `delete${one}`,
      summary: `Delete a ${config.kind}, unless it is still on a line item`,
      tags,
      params: IdParams,
      status: 204,
      handler: async ({ db, params }) => {
        await deleteCatalogItem(db, config.kind, params.id);
      },
    }),
  ];
}

export const productRoutes = catalogRoutes({
  kind: 'product',
  plural: 'products',
  singularPascal: 'Product',
  response: ProductResponse,
  create: ProductCreate,
  update: ProductUpdate,
});

export const serviceRoutes = catalogRoutes({
  kind: 'service',
  plural: 'services',
  singularPascal: 'Service',
  response: ServiceResponse,
  create: ServiceCreate,
  update: ServiceUpdate,
});
