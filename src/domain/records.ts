/**
 * The one place a database row becomes a wire record.
 *
 * Drizzle hands back `Date` objects for the timestamp columns. The API serialises them
 * as ISO 8601 strings, and doing that conversion here -- rather than in the HTTP layer
 * -- is what lets the response schemas in `src/api/schemas.ts` be plain
 * `z.iso.datetime()` strings, which is also what the OpenAPI document then advertises.
 */
export interface WireTimestamps {
  createdAt: string;
  updatedAt: string;
}

export function wireTimestamps(row: { createdAt: Date; updatedAt: Date }): WireTimestamps {
  return {
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
