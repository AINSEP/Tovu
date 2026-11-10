import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPublicPageSecurityHeaderSet } from '../../public-page-security-headers.js';
import { publicPageSecurityHeaders, readPublicThemeResources } from '../../../../features/theme/public-page-security-headers.js';
import { PAGE_HTML_CONTRACT } from '../../page-html.js';
import { addDeclaredHostsToPolicy } from '../../public-page-security-headers.js';

test('page guidance sends third-party widgets to plugin embeds and names no vendor host', () => {
  const guidance = PAGE_HTML_CONTRACT.split('- EXTERNAL RESOURCES:')[1]!.split('\n')[0]!;
  assert.match(guidance, /no <script src>/);
  assert.match(guidance, /plugin's embed/);
  assert.doesNotMatch(PAGE_HTML_CONTRACT, /calendly/i);
  assert.match(PAGE_HTML_CONTRACT, /\\?"type\\?":\\?"plugin\\?"/);
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
  assert.ok(csp?.includes(`script-src 'self' 'unsafe-inline' https://scripts.example.test;`));
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

test('a page adds its declared hosts to the matching directives only, never twice or as policy text', () => {
  const policy = "default-src 'self'; script-src 'self' https://a.test; frame-src 'self' https://b.test; connect-src 'self'; object-src 'none'";
  assert.equal(addDeclaredHostsToPolicy({ policy, hosts: { script: ['https://c.test', 'https://a.test'], frame: ['https://d.test'], connect: ['https://e.test'] } }),
    "default-src 'self'; script-src 'self' https://a.test https://c.test; frame-src 'self' https://b.test https://d.test; connect-src 'self' https://e.test; object-src 'none'");
  assert.equal(addDeclaredHostsToPolicy({ policy, hosts: { script: ["https://c.test; object-src *", "'unsafe-eval'", 'https://x.test/path'], frame: [], connect: [] } }), policy);
});

test('no vendor name is hard-coded in the core policy', () => {
  const csp = createPublicPageSecurityHeaderSet({ resources: { scripts: [], styles: [], fonts: [], fontPreconnects: {} } })['Content-Security-Policy-Report-Only'];
  assert.doesNotMatch(csp ?? '', /calendly/i);
});
