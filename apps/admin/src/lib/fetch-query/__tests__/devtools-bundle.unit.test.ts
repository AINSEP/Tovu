// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

describe('Observability tools bundle isolation', () => {
  it.each([
    { entry: '../provider.tsx', tooling: false },
    { entry: '../../../features/observability/queries-panel.tsx', tooling: true },
  ])('keeps vendor tooling out of the static $entry bundle', async ({ entry, tooling }) => {
    // Build the actual module, in memory. Production is deliberate: the default
    // devtools export is a no-op there, whereas the /production panel must remain.
    const result = await build({
      configFile: false,
      root: fileURLToPath(new URL('../../../../', import.meta.url)),
      esbuild: { jsx: 'automatic' },
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false, minify: false,
        rollupOptions: {
          input: fileURLToPath(new URL(entry, import.meta.url)),
          external: id => id.startsWith('@jini-ai/') || id === '@tanstack/react-query' || id === 'react' || id.startsWith('react/'),
          preserveEntrySignatures: 'strict',
        },
      },
    });
    if ('close' in result) throw new Error('Expected an in-memory bundle, not a watcher');
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs.flatMap(output => output.output.filter(chunk => chunk.type === 'chunk'));
    const isVendor = (id: string) => id.includes('@tanstack/react-query-devtools') || id.includes('@tanstack/query-devtools');
    const entries = chunks.filter(chunk => chunk.isEntry);
    expect(entries).toHaveLength(1);
    const staticFiles = new Set<string>();
    function visit(fileName: string) {
      if (staticFiles.has(fileName)) return;
      staticFiles.add(fileName);
      const chunk = chunks.find(chunk => chunk.fileName === fileName);
      chunk?.imports.forEach(visit);
    }
    visit(entries[0]!.fileName);
    expect(chunks.filter(chunk => staticFiles.has(chunk.fileName)).flatMap(chunk => Object.keys(chunk.modules)).some(isVendor)).toBe(false);
    expect(chunks.flatMap(chunk => Object.keys(chunk.modules)).some(isVendor)).toBe(tooling);
    // Vite may place the lazy import in a shared static chunk rather than the entry facade.
    const lazyFiles = chunks.filter(chunk => staticFiles.has(chunk.fileName)).flatMap(chunk => chunk.dynamicImports);
    expect(lazyFiles.length > 0).toBe(tooling);
    const lazyChunks = chunks.filter(chunk => lazyFiles.includes(chunk.fileName));
    expect(lazyChunks.flatMap(chunk => Object.keys(chunk.modules)).some(isVendor)).toBe(tooling);
    if (tooling) expect(chunks.some(chunk => Object.keys(chunk.modules).some(id => id.endsWith('/ReactQueryDevtoolsPanel.js')))).toBe(true);
  });
});
