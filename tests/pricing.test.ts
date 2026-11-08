/**
 * The invoice arithmetic, tested without a database or an HTTP request.
 *
 * The two tests that matter most are "an override of zero is a free line" and "a
 * zero-priced catalog row still counts": each pins a place where a previous port of
 * this app got the money wrong.
 */
import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../src/domain/errors.ts';
import {
  assertProductXorService,
  dueDate,
  invoiceTotalCents,
  subtotalCents,
  unitPriceCents,
} from '../src/domain/pricing.ts';

describe('unitPriceCents', () => {
  it('bills the catalog price when there is no override', () => {
    expect(unitPriceCents(null, 8000)).toBe(8000);
  });

  it('treats an override of zero as a free line, not as an absent override', () => {
    // The whole reason pricing.ts uses `??` instead of `||`. With `||` this is 8000.
    expect(unitPriceCents(0, 8000)).toBe(0);
  });

  it('prefers the override over the catalog price', () => {
    expect(unitPriceCents(4000, 8000)).toBe(4000);
  });

  it('accepts an override above the catalog price', () => {
    expect(unitPriceCents(12_000, 8000)).toBe(12_000);
  });
});

describe('subtotalCents', () => {
  it('multiplies the unit price by the quantity', () => {
    expect(subtotalCents(4000, 40)).toBe(160_000);
  });

  it('is zero for a quantity of zero', () => {
    // Rails permits quantity 0 and so does this port; see the README.
    expect(subtotalCents(8000, 0)).toBe(0);
  });

  it('is zero for a free line regardless of quantity', () => {
    expect(subtotalCents(unitPriceCents(0, 8000), 40)).toBe(0);
  });
});

describe('invoiceTotalCents', () => {
  it('is zero for an invoice with no line items', () => {
    expect(invoiceTotalCents([])).toBe(0);
  });

  it('sums every line item subtotal', () => {
    expect(
      invoiceTotalCents([
        { subtotalCents: 320_000 },
        { subtotalCents: 160_000 },
        { subtotalCents: 2_000_000 },
      ]),
    ).toBe(2_480_000);
  });

  it('counts a line item whose catalog row is priced at zero', () => {
    // Rails filters these out of both the table and the total. This port does not.
    const free = subtotalCents(unitPriceCents(null, 0), 10);
    expect(invoiceTotalCents([{ subtotalCents: free }, { subtotalCents: 500 }])).toBe(500);
  });

  it('counts an overridden line item whose catalog row is priced at zero', () => {
    // The sharpest version of the Rails bug: the row is dropped even though its
    // override is what should be billed.
    const overridden = subtotalCents(unitPriceCents(2500, 0), 2);
    expect(invoiceTotalCents([{ subtotalCents: overridden }])).toBe(5000);
  });
});

describe('dueDate', () => {
  it('adds netDays to the issue date', () => {
    expect(dueDate(new Date('2026-11-08T00:00:00Z'), 30)).toBe('2026-12-08');
  });

  it('crosses a month boundary', () => {
    expect(dueDate(new Date('2026-01-20T00:00:00Z'), 30)).toBe('2026-02-19');
  });

  it('crosses a year boundary', () => {
    expect(dueDate(new Date('2026-12-20T00:00:00Z'), 30)).toBe('2027-01-19');
  });

  it('crosses a leap day', () => {
    expect(dueDate(new Date('2028-02-01T00:00:00Z'), 30)).toBe('2028-03-02');
  });

  it('is the issue date itself when netDays is zero', () => {
    expect(dueDate(new Date('2026-11-08T00:00:00Z'), 0)).toBe('2026-11-08');
  });

  it('ignores the time of day', () => {
    expect(dueDate(new Date('2026-11-08T23:59:59Z'), 1)).toBe('2026-11-09');
  });
});

describe('assertProductXorService', () => {
  it('accepts a product alone', () => {
    expect(() => {
      assertProductXorService({ productId: 1, serviceId: null });
    }).not.toThrow();
  });

  it('accepts a service alone', () => {
    expect(() => {
      assertProductXorService({ productId: null, serviceId: 1 });
    }).not.toThrow();
  });

  it('rejects neither, with the message the Rails app uses', () => {
    expect(() => {
      assertProductXorService({ productId: null, serviceId: null });
    }).toThrow(new DomainValidationError('A line item must be either a product or a service'));
  });

  it('rejects both, with the message the Rails app uses', () => {
    expect(() => {
      assertProductXorService({ productId: 1, serviceId: 1 });
    }).toThrow(new DomainValidationError("A line item can't be both a product and a service"));
  });
});
