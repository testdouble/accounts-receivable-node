/**
 * The one place an exception becomes a status code.
 *
 * The body shape follows the Django port's, which in turn follows Pydantic's: a bare
 * string in `detail` for a single failure, an array of `{type, loc, msg}` for
 * validation. A consumer can therefore handle either port's errors with one code path.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ConflictError, DomainValidationError, NotFoundError, type Loc } from '../domain/errors.ts';
import { RequestValidationError, type RequestLocation, type ZodError } from './validate.ts';

/** Node's errno-style shape, as better-sqlite3 throws it. */
interface SqliteError extends Error {
  code: string;
}

/**
 * Finds a SQLite error, following the `cause` chain.
 *
 * Drizzle does not let the driver's error through: it throws its own DrizzleError with
 * a message like "Failed to run the query ..." and the real SqliteError, carrying the
 * SQLITE_CONSTRAINT_* code, hanging off `cause`. Checking only the thrown object
 * therefore misses every constraint violation and turns it into a 500 --
 * tests/errors.test.ts pins the unwrapping.
 */
function hasSqliteCode(value: unknown): value is SqliteError {
  if (!(value instanceof Error) || !('code' in value)) {
    return false;
  }

  // `value.code` is `unknown` here thanks to the `in` narrowing, so this needs no cast.
  const code: unknown = value.code;

  return typeof code === 'string' && code.startsWith('SQLITE_');
}

function findSqliteError(error: unknown): SqliteError | undefined {
  let current: unknown = error;

  // Bounded rather than `while (true)`: a malformed cause chain must not hang the
  // error handler, of all things.
  for (let depth = 0; depth < 10; depth += 1) {
    if (hasSqliteCode(current)) {
      return current;
    }

    if (!(current instanceof Error) || current.cause === undefined) {
      return undefined;
    }

    current = current.cause;
  }

  return undefined;
}

/** Express attaches a `status` to the SyntaxError that express.json() throws. */
function isBodyParserError(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || !('status' in error)) {
    return false;
  }

  const status: unknown = error.status;

  return status === 400;
}

function toDetails(where: RequestLocation, issues: ZodError['issues']) {
  const prefix = where === 'path' ? 'path' : where;

  return issues.map((issue) => ({
    type: issue.code,
    loc: [
      prefix,
      ...issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
    ],
    msg: issue.message,
  }));
}

/** Mounted last, with no path: in Express 5 a bare `*` is no longer a valid route. */
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ detail: 'Not Found' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof RequestValidationError) {
    // A malformed path or query string is a malformed request line, so 400. A
    // well-formed body that breaks the rules is unprocessable, so 422. The Django port
    // returns 422 for both; splitting them is deliberate and documented in the README.
    const status = error.where === 'body' ? 422 : 400;
    res.status(status).json({ detail: toDetails(error.where, error.issues) });
    return;
  }

  if (error instanceof DomainValidationError) {
    const loc: Loc = error.loc;
    res.status(422).json({ detail: [{ type: 'value_error', loc, msg: error.message }] });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({ detail: 'Not Found' });
    return;
  }

  if (error instanceof ConflictError) {
    res.status(409).json({ detail: error.message });
    return;
  }

  if (isBodyParserError(error)) {
    res.status(400).json({ detail: 'Malformed JSON body' });
    return;
  }

  // Backstop. The domain layer checks referenced rows exist before it writes, so these
  // should be unreachable -- but a constraint that fires anyway must not look like a
  // crash. tests/line-items.test.ts drives one of these on purpose to prove the branch
  // is live rather than decorative.
  const sqliteError = findSqliteError(error);

  if (sqliteError !== undefined) {
    if (sqliteError.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      res.status(409).json({ detail: 'Referenced row does not exist or is still in use' });
      return;
    }

    if (sqliteError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ detail: 'Already exists' });
      return;
    }

    if (sqliteError.code.startsWith('SQLITE_CONSTRAINT')) {
      res.status(422).json({ detail: 'Database constraint violated' });
      return;
    }
  }

  console.error(error);
  res.status(500).json({ detail: 'Internal Server Error' });
};
