/**
 * Request parsing.
 *
 * A Zod failure here becomes a `RequestValidationError` that remembers WHERE it came
 * from, because `errors.ts` maps a malformed path parameter to 400 and a body that
 * breaks the rules to 422, and needs to tell them apart.
 */
import type { ZodType, z } from 'zod';
import { ZodError } from 'zod';

export type RequestLocation = 'path' | 'query' | 'body';

export class RequestValidationError extends Error {
  readonly where: RequestLocation;
  readonly issues: ZodError['issues'];

  constructor(where: RequestLocation, error: ZodError) {
    super(`Invalid request ${where}`);
    this.name = 'RequestValidationError';
    this.where = where;
    this.issues = error.issues;
  }
}

/**
 * Parses one part of a request, or throws.
 *
 * When no schema is declared for a part, the parsed value is `undefined` -- a route
 * that declares no body cannot read one, which is the point.
 */
export function parseRequestPart<T extends ZodType>(
  schema: T | undefined,
  value: unknown,
  where: RequestLocation,
): z.output<T> {
  if (schema === undefined) {
    // The one unavoidable cast in the request pipeline. A route that declares no schema
    // for a part has no generic to instantiate, so its handler sees `undefined` and its
    // ctx type says as much. Narrowing that here keeps route.ts free of casts at all
    // three call sites.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    return undefined as z.output<T>;
  }

  const result = schema.safeParse(value);

  if (!result.success) {
    throw new RequestValidationError(where, result.error);
  }

  return result.data;
}

export { ZodError };
