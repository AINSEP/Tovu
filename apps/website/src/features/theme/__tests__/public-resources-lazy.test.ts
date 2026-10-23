import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('theme resources load on first use, retry failures and memoize successful resources and headers', async t => {
  let reads = 0;
  let text: string | undefined;
  t.mock.module('node:fs', { namedExports: { ...fs, readFileSync: (file: string) => {
    reads++;
    assert.equal(file, '/product/content/themes/public-resources.json');
    if (text === undefined) throw new Error('missing resources');
    return text;
  } } });
  t.mock.module('../../../platform/site-dir/product-root.js', { namedExports: { resolveProductRoot: () => '/product' } });
  const { publicThemeResources, publicPageSecurityHeaders } = await import('../public-page-security-headers.js');
  assert.equal(reads, 0, 'import must not read resource data');
  assert.throws(() => publicThemeResources({}), /missing resources/);
  text = '{';
  assert.throws(() => publicPageSecurityHeaders({}), SyntaxError);
  text = JSON.stringify({ scripts: [], styles: [], fonts: [], fontPreconnects: {} });
  const resources = publicThemeResources({});
  assert.strictEqual(publicThemeResources({}), resources);
  const headers = publicPageSecurityHeaders({});
  assert.strictEqual(publicPageSecurityHeaders({}), headers);
  assert.ok(Object.isFrozen(headers));
  assert.equal(reads, 3, 'failed loads retry; successful loads are reused');
});
