import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveProductRoot } from '#src/platform/site-dir/product-root';
import { loadTheme } from '#src/features/theme/theme';
import { pageShell } from '../render.js';

test('the public page shell emits the pre-extraction font link bytes from theme declarations', () => {
  const root = path.join(resolveProductRoot(), 'content/themes');
  const golden = JSON.parse(readFileSync(new URL('../../../../../../features/theme/__tests__/fixtures/font-links.json', import.meta.url), 'utf8'));
  for (const [relative, expected] of Object.entries(golden)) {
    const theme = loadTheme({ themeDir: path.join(root, relative), id: path.basename(relative), source: 'built-in' });
    const html = pageShell({ title: 'Font contract', body: '<p>Example</p>', theme });
    assert.ok(html.includes(String(expected)), relative);
  }
  assert.doesNotMatch(pageShell({ title: 'No theme', body: '<p>Example</p>', theme: null }), /rel="preconnect"/);
});
