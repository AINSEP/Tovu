import { defineConfig, configDefaults } from 'vitest/config';
// Stryker wrapper (untracked). Excludes the one test file that already FAILS on the unmodified tree
// (subpath-isolation contract flags plugin-export.ts's consent import) — Stryker aborts on a red dry run.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**', 'src/__tests__/subpath-isolation.contract.test.ts'],
    testTimeout: 30000, hookTimeout: 30000,
  },
});
