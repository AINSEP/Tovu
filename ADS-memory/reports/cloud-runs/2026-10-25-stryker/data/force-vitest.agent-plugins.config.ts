// @ts-nocheck
import { defineConfig, configDefaults } from 'vitest/config';
// Stryker wrapper (untracked). ABSOLUTE alias: inside .stryker-tmp/sandbox-* a relative/import.meta.url alias resolves to nothing.
export default defineConfig({
  resolve: { alias: [{ find: '@jini-ai/plugins/host', replacement: '/home/user/Jini/packages/plugins/src/host/index.ts' }] },
  test: { exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'], testTimeout: 30000, hookTimeout: 30000 },
});
