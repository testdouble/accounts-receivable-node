/**
 * The errors the domain layer throws.
 *
 * These carry no HTTP vocabulary. `src/api/errors.ts` is the one place that maps them
 * onto status codes, which is what keeps the domain testable without a request.
 */

/** A field path: ['body', 'email']. */
export type Loc = readonly (string | number)[];

/**
 * A well-formed request that breaks a business rule. Becomes a 422.
 *
 * `loc` is optional because some rules are about the record as a whole rather than one
 * field -- the product-or-service rule is one of those.
 */
export class DomainValidationError extends Error {
  readonly loc: Loc;

  constructor(message: string, loc: Loc = ['body']) {
    super(message);
    this.name = 'DomainValidationError';
    this.loc = loc;
  }
}

/** No row with that id. Becomes a 404. */
export class NotFoundError extends Error {
  constructor(message = 'Not Found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The request is fine but the data will not allow it -- e.g. a row is still referenced. Becomes a 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
