// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

describe('development tools bundle isolation', () => {
  it.each([
    { development: false, optIn: true, emitted: false },
    { development: true, optIn: false, emitted: false },
    { development: true, optIn: true, emitted: true },
  ])('emits Devtools only in development with VITE_TANSTACK_DEVTOOLS=1 (DEV=$development, opt-in=$optIn)', async ({ development, optIn, emitted }) => {
    // Bundle the real composition with Vite, in memory. The opted-in development treatment
    // proves the guard reaches the lazy import instead of passing on an unused entry.
    // The flag is always defined explicitly so a developer's .env or shell cannot flip the result.
    const result = await build({
      configFile: false,
      root: fileURLToPath(new URL('../../../../', import.meta.url)),
      esbuild: { jsx: 'automatic' },
      define: {
        'import.meta.env.DEV': JSON.stringify(development),
        'import.meta.env.VITE_TANSTACK_DEVTOOLS': optIn ? JSON.stringify('1') : 'undefined',
        'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production'),
      },
      build: {
        write: false, minify: false,
        rollupOptions: {
          input: fileURLToPath(new URL('../provider.tsx', import.meta.url)),
          external: id => id.startsWith('@jini-ai/') || id === '@tanstack/react-query' || id === 'react' || id.startsWith('react/'),
          preserveEntrySignatures: 'strict',
        },
      },
    });
    if ('close' in result) throw new Error('Expected an in-memory bundle, not a watcher');
    const outputs = Array.isArray(result) ? result : [result];
    const modules = outputs.flatMap(output => output.output.flatMap(chunk => chunk.type === 'chunk' ? Object.keys(chunk.modules) : []));
    expect(modules.some(id => id.includes('@tanstack/react-query-devtools') || id.includes('@tanstack/query-devtools'))).toBe(emitted);
    if (!emitted) {
      const code = outputs.flatMap(output => output.output.flatMap(chunk => chunk.type === 'chunk' ? [chunk.code] : [])).join('\n');
      expect(code).not.toContain('react-query-devtools');
    }
  });
});
