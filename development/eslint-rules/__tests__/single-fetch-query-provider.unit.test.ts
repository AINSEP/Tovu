import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linter, type Rule } from 'eslint';
import rule from '../single-fetch-query-provider.mjs';

// Flat config only matches files under the Linter's cwd (process.cwd() by default), so the fixture
// paths need a pinned root or every case reports "No matching configuration" off the author's machine.
const root = '/repo';
function messages(source: string, filename: string, provider: Rule.RuleModule = rule) {
  return new Linter({ cwd: root }).verify(source, [{ files: ['**/*.ts', '**/*.tsx'], plugins: { host: { rules: { provider } } }, rules: { 'host/provider': 'error' } }], { filename });
}
for (const source of [
  'import { FetchQueryProvider as Shadow } from "@/lib/fetch-query/provider";',
  'import * as Cache from "../../lib/fetch-query/provider";',
  'export { FetchQueryProvider } from "@/lib/fetch-query/provider.tsx";',
  'export * from "@/lib/fetch-query/provider";',
  'const provider = import("@/lib/fetch-query/provider");',
]) {
  test(`rejects a second composition via ${source}`, () => {
    const result = messages(source, `${root}/apps/admin/src/features/posts/Posts.tsx`);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.messageId, 'secondProvider');
  });
}
for (const filename of ['main.tsx', '__tests__/fetch-query-provider.test-helper.tsx', 'lib/fetch-query/__tests__/provider.unit.test.tsx']) {
  test(`allows the registered composition ${filename}`, () => {
    assert.deepEqual(messages('import { FetchQueryProvider } from "@/lib/fetch-query/provider";', `${root}/apps/admin/src/${filename}`), []);
  });
}
test('allows read hooks from the shared library boundary', () => {
  assert.deepEqual(messages('import { useFetchQuery } from "@jini-ai/ui/fetch-query";', `${root}/apps/admin/src/features/posts/Posts.tsx`), []);
});

test('falls back to context.getFilename() on pre-ESLint-9 hosts without context.filename', () => {
  const legacy = { ...rule, create: (context: Rule.RuleContext) => rule.create(Object.create(context, { filename: { value: undefined }, getFilename: { value: () => context.filename } })) };
  assert.deepEqual(messages('import * as Cache from "../../lib/fetch-query/provider";', `${root}/apps/admin/src/features/posts/Posts.tsx`, legacy).map(m => m.messageId), ['secondProvider']);
  assert.deepEqual(messages('import { FetchQueryProvider } from "@/lib/fetch-query/provider";', `${root}/apps/admin/src/main.tsx`, legacy), []);
});
