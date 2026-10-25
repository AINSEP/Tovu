import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: [{ find: '@jini-ai/plugins/host', replacement: '/root/Jini/packages/plugins/src/host/index.ts' }] },
  test: { testTimeout: 30000, hookTimeout: 30000 },
});
