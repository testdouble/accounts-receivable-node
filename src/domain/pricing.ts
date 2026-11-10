/**
 * Invoice arithmetic, as plain functions over plain numbers.
 *
 * Deliberately free of Drizzle and Express: these four rules are the entire reason this
 * application exists, and they should be testable without a database or an HTTP
 * request. `tests/pricing.test.ts` does exactly that.
 *
 * All amounts are integer cents.
 */
import { DomainValidationError } from './errors.ts';

/**
 * The price one unit of a line item bills at.
 *
 * `??`, NOT `||`.
 *
 * An override of 0 is a free line, and `||` would treat it as absent and fall through
 * to the catalog price instead -- turning a free line into a charged one. `oxlint
 * --type-aware` runs `typescript/prefer-nullish-coalescing` and
 * `typescript/strict-boolean-expressions` as errors, so writing it the wrong way fails
 * ./lint.sh.
 */
export function unitPriceCents(
  priceOverrideCents: number | null,
  catalogPriceCents: number,
): number {
  return priceOverrideCents ?? catalogPriceCents;
}

export function subtotalCents(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

/**
 * Every line item's subtotal, summed.
 *
 * Every row counts, including one whose catalog entry is priced at zero. Filtering
 * those out would drop a row that carries a non-zero override.
 */
export function invoiceTotalCents(items: readonly { subtotalCents: number }[]): number {
  return items.reduce((total, item) => total + item.subtotalCents, 0);
}

/**
 * The issue date plus `netDays`, as a YYYY-MM-DD string.
 *
 * Derived from the stored `createdAt` rather than from the clock, so it does not move
 * between requests. Computed in UTC: this API has no users, no sessions and no locale,
 * so there is no other timezone it could honestly claim.
 */
export function dueDate(createdAt: Date, netDays: number): string {
  const due = new Date(createdAt.getTime());
  due.setUTCDate(due.getUTCDate() + netDays);
  return due.toISOString().slice(0, 10);
}

/**
 * Exactly one of product or service.
 *
 * Both messages are part of the observable contract, so they are asserted verbatim in
 * `tests/pricing.test.ts`.
 *
 * Written as explicit `=== null` rather than a truthiness check. No row id can be 0, so
 * truthiness would work here -- but reaching for truthiness on a nullable number is the
 * same reflex that produces the override bug above, and this file is where that reflex
 * is least welcome.
 */
export function assertProductXorService(input: {
  productId: number | null;
  serviceId: number | null;
}): void {
  const hasProduct = input.productId !== null;
  const hasService = input.serviceId !== null;

  if (!hasProduct && !hasService) {
    throw new DomainValidationError('A line item must be either a product or a service', ['body']);
  }

  if (hasProduct && hasService) {
    throw new DomainValidationError("A line item can't be both a product and a service", ['body']);
  }
}
