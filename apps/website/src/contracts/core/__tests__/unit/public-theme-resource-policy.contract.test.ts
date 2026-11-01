import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPublicPageSecurityHeaderSet } from '../../public-page-security-headers.js';
import { publicPageSecurityHeaders, readPublicThemeResources } from '../../../../features/theme/public-page-security-headers.js';
import { PAGE_HTML_CONTRACT } from '../../page-html.js';
import { PAGE_EMBED_ORIGINS } from '../../page-embed-origins.js';

test('every external embed origin permitted by page guidance is allowed by the public CSP', () => {
  const guidance = PAGE_HTML_CONTRACT.split('- EXTERNAL RESOURCES:')[1]!.split('\n')[0]!;
  const origins = guidance.match(/https:\/\/[a-z0-9.-]+/g)!;
  assert.equal(origins.length, 2, 'the vetted script and booking frame are both described');
  const csp = createPublicPageSecurityHeaderSet({ resources: { scripts: [], styles: [], fonts: [], fontPreconnects: {} } })['Content-Security-Policy-Report-Only']!;
  for (const [index, directive] of ['script-src', 'frame-src'].entries()) {
    const sources = csp.split('; ').find(part => part.startsWith(`${directive} `))!.split(' ').slice(1);
    assert.ok(sources.includes(origins[index]!), `${directive} must allow guidance origin ${origins[index]}`);
    assert.ok(sources.every(source => !source.includes('*') && source !== 'https:'), 'embed exceptions must not admit arbitrary hosts');
  }
});

test('theme data keeps the entire shared public header set byte-identical', () => {
  const golden = JSON.parse(readFileSync(new URL('../fixtures/public-security-headers.json', import.meta.url), 'utf8'));
  assert.deepEqual(publicPageSecurityHeaders({}), golden);
  assert.equal(Object.hasOwn(publicPageSecurityHeaders({}), 'Content-Security-Policy'), false);
  assert.ok(Object.isFrozen(publicPageSecurityHeaders({})));
});

test('origins derive from data, deduplicate stably, and retain all core directives', () => {
  const resources = { scripts: ['https://scripts.example.test/a.js', 'https://scripts.example.test/b.js'], styles: ['https://styles.example.test/a.css'], fonts: ['https://files.example.test/a.woff2'], fontPreconnects: {} };
  const headers = createPublicPageSecurityHeaderSet({ resources });
  const csp = headers['Content-Security-Policy-Report-Only'];
  assert.ok(csp?.includes(`script-src 'self' 'unsafe-inline' https://scripts.example.test ${PAGE_EMBED_ORIGINS.script};`));
  assert.ok(csp?.includes("style-src 'self' 'unsafe-inline' https://styles.example.test;"));
  assert.ok(csp?.includes("font-src 'self' data: https://files.example.test;"));
  assert.equal(csp?.match(/https:\/\/scripts\.example\.test/g)?.length, 1);
  assert.ok(csp?.endsWith("object-src 'none'; base-uri 'self'"));
  const local = createPublicPageSecurityHeaderSet({ resources: { scripts: [], styles: [], fonts: [], fontPreconnects: {} } });
  assert.ok(local['Content-Security-Policy-Report-Only']?.includes("font-src 'self' data:;"));
  assert.throws(() => createPublicPageSecurityHeaderSet({ resources: { ...resources, scripts: ['invalid URL'] } }), TypeError);
});

test('theme data reader uses its port and preserves malformed/missing-data failures', () => {
  const data = { scripts: [], styles: [], fonts: [], fontPreconnects: {} };
  assert.deepEqual(readPublicThemeResources({ resourceFile: '/product/resources.json' }, { readText: file => {
    assert.equal(file, '/product/resources.json');
    return JSON.stringify(data);
  } }), data);
  assert.throws(() => readPublicThemeResources({ resourceFile: '/missing' }, { readText: () => { throw new Error('missing'); } }), /missing/);
  assert.throws(() => readPublicThemeResources({ resourceFile: '/bad' }, { readText: () => '{' }), SyntaxError);
});
