/** Invoices and line items: full CRUD, plus the derived pricing fields. */
import { z } from 'zod';
import {
  createInvoice,
  createLineItem,
  deleteInvoice,
  deleteLineItem,
  getInvoice,
  getLineItem,
  listInvoices,
  listLineItems,
  updateInvoice,
  updateLineItem,
} from '../domain/billing.ts';
import { route, type Route } from './route.ts';
import {
  IdParams,
  InvoiceCreate,
  InvoiceQuery,
  InvoiceResponse,
  InvoiceUpdate,
  LineItemCreate,
  LineItemQuery,
  LineItemResponse,
  LineItemUpdate,
} from './schemas.ts';

const invoiceTags = ['invoices'] as const;
const lineItemTags = ['line items'] as const;

export const invoiceRoutes: Route[] = [
  route({
    method: 'get',
    path: '/invoices',
    operationId: 'listInvoices',
    summary: 'Every invoice, in id order, with its due date and total',
    tags: invoiceTags,
    // The only filter beyond what the Django port exposes. With no frontend, this is
    // the only way to narrow the list without pulling the whole table.
    query: InvoiceQuery,
    status: 200,
    response: z.array(InvoiceResponse),
    handler: ({ db, query }) =>
      listInvoices(db, query.clientId === undefined ? {} : { clientId: query.clientId }),
  }),
  route({
    method: 'post',
    path: '/invoices',
    operationId: 'createInvoice',
    summary: 'Create an invoice',
    tags: invoiceTags,
    body: InvoiceCreate,
    status: 201,
    response: InvoiceResponse,
    location: (invoice) => `/api/invoices/${String(invoice.id)}`,
    handler: ({ db, body }) => createInvoice(db, body),
  }),
  route({
    method: 'get',
    path: '/invoices/:id',
    operationId: 'getInvoice',
    summary: 'One invoice, with its due date and total',
    tags: invoiceTags,
    params: IdParams,
    status: 200,
    response: InvoiceResponse,
    handler: ({ db, params }) => getInvoice(db, params.id),
  }),
  route({
    method: 'patch',
    path: '/invoices/:id',
    operationId: 'updateInvoice',
    summary: 'Update an invoice',
    tags: invoiceTags,
    params: IdParams,
    body: InvoiceUpdate,
    status: 200,
    response: InvoiceResponse,
    handler: ({ db, params, body }) => updateInvoice(db, params.id, body),
  }),
  route({
    method: 'delete',
    path: '/invoices/:id',
    operationId: 'deleteInvoice',
    summary: 'Delete an invoice and, with it, its line items',
    tags: invoiceTags,
    params: IdParams,
    status: 204,
    handler: async ({ db, params }) => {
      await deleteInvoice(db, params.id);
    },
  }),
];

export const lineItemRoutes: Route[] = [
  route({
    method: 'get',
    path: '/line-items',
    operationId: 'listLineItems',
    summary: 'Every line item, in id order, priced',
    tags: lineItemTags,
    query: LineItemQuery,
    status: 200,
    response: z.array(LineItemResponse),
    handler: ({ db, query }) =>
      listLineItems(db, query.invoiceId === undefined ? {} : { invoiceId: query.invoiceId }),
  }),
  route({
    method: 'post',
    path: '/line-items',
    operationId: 'createLineItem',
    summary: 'Create a line item for exactly one product or service',
    tags: lineItemTags,
    body: LineItemCreate,
    status: 201,
    response: LineItemResponse,
    location: (item) => `/api/line-items/${String(item.id)}`,
    handler: ({ db, body }) => createLineItem(db, body),
  }),
  route({
    method: 'get',
    path: '/line-items/:id',
    operationId: 'getLineItem',
    summary: 'One line item, priced',
    tags: lineItemTags,
    params: IdParams,
    status: 200,
    response: LineItemResponse,
    handler: ({ db, params }) => getLineItem(db, params.id),
  }),
  route({
    method: 'patch',
    path: '/line-items/:id',
    operationId: 'updateLineItem',
    summary: 'Update a line item',
    tags: lineItemTags,
    params: IdParams,
    body: LineItemUpdate,
    status: 200,
    response: LineItemResponse,
    handler: ({ db, params, body }) => updateLineItem(db, params.id, body),
  }),
  route({
    method: 'delete',
    path: '/line-items/:id',
    operationId: 'deleteLineItem',
    summary: 'Delete a line item',
    tags: lineItemTags,
    params: IdParams,
    status: 204,
    handler: async ({ db, params }) => {
      await deleteLineItem(db, params.id);
    },
  }),
];
