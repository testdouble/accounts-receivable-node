/**
 * Configuration, parsed and defaulted in one place.
 *
 * Every value has a default, so a fresh clone runs with no `.env` file and no copy
 * step.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  /** A path for better-sqlite3. ':memory:' is the one magic value SQLite accepts. */
  DATABASE_URL: z.string().min(1).default('./dev.sqlite3'),
});

export const env = EnvSchema.parse(process.env);
