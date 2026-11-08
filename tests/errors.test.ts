/**
 * The error middleware, unit-tested.
 *
 * The domain layer pre-checks every reference before it writes, so the SQLite
 * constraint branches are unreachable through the API by design. They are still worth
 * having -- a constraint that fires anyway must not look like a crash -- so they are
 * driven directly here rather than left as untested code.
 *
 * The Drizzle-wrapped case is the one that matters: Drizzle throws its own error and
 * hangs the real SqliteError off `cause`, so a handler that only inspects what was
 * thrown returns a 500 for every constraint violation.
 */
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/api/errors.ts';
import { ConflictError, DomainValidationError, NotFoundError } from '../src/domain/errors.ts';

interface Captured {
  status: number | undefined;
  body: unknown;
}

/** Drives the middleware and reports what it wrote. */
function handle(error: unknown): Captured {
  const captured: Captured = { status: undefined, body: undefined };

  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  // A plain void function, not vi.fn(): NextFunction returns void, and a
  // value-returning mock in that position is what strict-void-return objects to.
  errorHandler(error, {} as Request, res, () => {});

  return captured;
}

/** A SqliteError as better-sqlite3 throws it. */
function sqliteError(code: string): Error {
  return Object.assign(new Error('constraint failed'), { code });
}

/** The same thing after Drizzle has wrapped it. */
function drizzleWrapped(code: string): Error {
  return new Error("Failed to run the query 'update ...'", { cause: sqliteError(code) });
}

describe('domain errors', () => {
  it('maps a validation failure to 422 with its field path', () => {
    const result = handle(new DomainValidationError('Nope', ['body', 'clientId']));

    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      detail: [{ type: 'value_error', loc: ['body', 'clientId'], msg: 'Nope' }],
    });
  });

  it('maps a missing row to 404', () => {
    expect(handle(new NotFoundError())).toEqual({ status: 404, body: { detail: 'Not Found' } });
  });

  it('maps a conflict to 409, keeping the message', () => {
    expect(handle(new ConflictError('Client still has invoices'))).toEqual({
      status: 409,
      body: { detail: 'Client still has invoices' },
    });
  });
});

describe('SQLite constraint violations', () => {
  it('maps a bare foreign key violation to 409', () => {
    const result = handle(sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'));

    expect(result.status).toBe(409);
  });

  it('maps a Drizzle-wrapped foreign key violation to 409, not 500', () => {
    // The regression this file exists for.
    const result = handle(drizzleWrapped('SQLITE_CONSTRAINT_FOREIGNKEY'));

    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      detail: 'Referenced row does not exist or is still in use',
    });
  });

  it('maps a wrapped unique violation to 409', () => {
    expect(handle(drizzleWrapped('SQLITE_CONSTRAINT_UNIQUE')).status).toBe(409);
  });

  it('maps any other wrapped constraint violation to 422', () => {
    expect(handle(drizzleWrapped('SQLITE_CONSTRAINT_NOTNULL')).status).toBe(422);
  });

  it('does not follow a cause chain for ever', () => {
    // A malformed or cyclic cause chain must not hang the error handler.
    const looping = new Error('outer');
    looping.cause = looping;

    expect(handle(looping).status).toBe(500);
  });
});

describe('anything else', () => {
  it('is a 500 with no detail leaked', () => {
    // console.error is silenced here only so the expected output does not look like a
    // test failure.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = handle(new Error('something internal and revealing'));

    expect(result).toEqual({ status: 500, body: { detail: 'Internal Server Error' } });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
