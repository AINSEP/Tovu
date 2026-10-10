import path from 'node:path';

// Import aliases and relative spellings must all resolve to the same host composition file.
// Restrict the composition import itself: allowing a screen to import it but merely warning
// about JSX misses createElement, renamed imports and wrapper components that shadow the cache.
const allowed = [
  '/apps/admin/src/main.tsx',
  '/apps/admin/src/__tests__/fetch-query-provider.test-helper.tsx',
  '/apps/admin/src/lib/fetch-query/__tests__/provider.unit.test.tsx',
];
export default {
  meta: { type: 'problem', schema: [], messages: { secondProvider: 'Only main.tsx composes the admin fetch-query provider; tests use fetch-query-provider.test-helper. A second mount shadows the shared query cache.' } },
  create(context) {
    const filename = context.getFilename().replaceAll('\\', '/');
    if (allowed.some(suffix => filename.endsWith(suffix))) return {};
    function check(node) {
      const source = node.source?.value;
      if (typeof source !== 'string') return;
      const resolved = source.startsWith('@/') ? `/apps/admin/src/${source.slice(2)}`
        : source.startsWith('.') ? path.resolve(path.dirname(filename), source).replaceAll('\\', '/') : source;
      if (/\/apps\/admin\/src\/lib\/fetch-query\/provider(?:\.[cm]?[jt]sx?)?$/.test(resolved)) context.report({ node, messageId: 'secondProvider' });
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check,
      ImportExpression: check };
  },
};
