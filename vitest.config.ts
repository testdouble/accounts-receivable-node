import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Explicit imports of describe/it/expect, so test files type-check under the same
    // tsconfig as src/ with no ambient globals.
    globals: false,
    // better-sqlite3 is a native addon. `forks` gives each test file its own process,
    // so a database handle can never leak across files. (This is Vitest's default; it
    // is stated because the native-addon reason is not obvious.)
    pool: 'forks',
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
    },
  },
});
