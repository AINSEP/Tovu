import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { InMemorySettingsRepo, getEffective, set } from '@jini-ai/core/settings';
import { injectPublishedWebMcp } from '../published-html.js';
import { ensureSettingsUiTabDefinitions, isPublishedWebMcpEnabled, PUBLISHED_WEBMCP_KEY, PUBLISHED_WEBMCP_NAMESPACE } from '../settings.js';

test('opt-out removes tools inside nested templates while preserving ordinary attributes and scripts', () => {
  const html = '<template id="outer"><template><form toolname="contact" class="keep"><input toolparamdescription="Address" name="email"></form></template><script type="application/json">{"toolname":"keep"}</script></template>';
  assert.equal(injectPublishedWebMcp({ html, enabled: false }, {}),
    '<template id="outer"><template><form  class="keep"><input  name="email"></form></template><script type="application/json">{"toolname":"keep"}</script></template>');
});

test('opt-out removes a marked script even when the marker follows other attributes', () => {
  const html = '<body><script src="keep.js"></script><script type="text/javascript" data-tovu-webmcp-script>remove()</script><p title="keep">Text</p></body>';
  assert.equal(injectPublishedWebMcp({ html, enabled: false }),
    '<body><script src="keep.js"></script><p title="keep">Text</p></body>');
});

test('injection respects an uppercase closing body and preserves the remaining document bytes', () => {
  const html = '<HTML><BODY>Text</BODY></HTML>';
  const injected = injectPublishedWebMcp({ html, enabled: true }, {});
  assert.ok(injected.startsWith('<HTML><BODY>Text<script data-tovu-webmcp-script data-consent-category="functional">'));
  assert.ok(injected.endsWith('</script></BODY></HTML>'));
  assert.equal(injectPublishedWebMcp({ html: injected, enabled: false }), html);
});

test('opt-out preserves ordinary attributes adopted onto implicit or repeated body elements', () => {
  for (const html of ['Text<body class="keep">', '<body>Text<body class="keep">']) {
    assert.equal(injectPublishedWebMcp({ html, enabled: false }), html);
  }
});

test('published HTML opt-out removes native form discovery without rewriting scripts, comments or form transport', () => {
  const html = '<!doctype html><html><body><!-- toolname="example" --><form action="/forms/contact" method="post" toolname="contact" tooldescription="Contact" toolautosubmit><input name="email" toolparamtitle="Email"></form><script>const example = \'toolname="example"\';</script></body></html>';
  const off = injectPublishedWebMcp({ html, enabled: false });
  assert.equal(off, '<!doctype html><html><body><!-- toolname="example" --><form action="/forms/contact" method="post"   ><input name="email" ></form><script>const example = \'toolname="example"\';</script></body></html>');
  assert.doesNotMatch(off, /data-tovu-webmcp-script/);
  const on = injectPublishedWebMcp({ html, enabled: true });
  assert.match(on, /<form[^>]*toolname="contact"/);
  assert.match(on, /data-tovu-webmcp-script/);
  assert.equal(injectPublishedWebMcp({ html: on, enabled: true }), on);
  assert.equal(injectPublishedWebMcp({ html: on, enabled: false }), off);
  assert.match(injectPublishedWebMcp({ html: '<main>Fragment</main>', enabled: true }), /data-tovu-webmcp-script/);
});

test('published setting registers ON by default and an explicit workspace opt-out wins', async () => {
  const settingsRepo = new InMemorySettingsRepo();
  let id = 0;
  const deps = { settingsRepo, clock: { nowMs: () => Date.parse('2026-10-04T00:00:00Z'), nowIso: () => '2026-10-04T00:00:00Z' }, ids: { newId: () => `id-${++id}` }, principals: { findActiveById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => ({ id, workspaceId }) } };
  assert.equal(await isPublishedWebMcpEnabled({ settingsRepo, getEffective }, { workspaceId: 'site' }), true);
  await ensureSettingsUiTabDefinitions(deps, { systemPrincipalId: 'system' });
  assert.equal(await isPublishedWebMcpEnabled({ settingsRepo, getEffective }, { workspaceId: 'site' }), true);
  await set({ deps: { repo: settingsRepo, clock: deps.clock, ids: deps.ids, principals: deps.principals, authorize: async () => ({ allowed: true, reason: 'test' }) }, input: { namespace: PUBLISHED_WEBMCP_NAMESPACE, key: PUBLISHED_WEBMCP_KEY, scope: 'workspace', value: false, workspaceId: 'site', authWorkspaceId: 'site', callerPrincipalId: 'owner' } });
  assert.equal(await isPublishedWebMcpEnabled({ settingsRepo, getEffective }, { workspaceId: 'site' }), false);
  assert.equal(await isPublishedWebMcpEnabled({ settingsRepo, getEffective }, { workspaceId: 'other-site' }), true);
});

test('the deployment snapshot matches its captured Jini source hash without requiring a sibling checkout', () => {
  const snapshot = readFileSync(new URL('../generated/annotated-actions-script.ts', import.meta.url), 'utf8');
  const provenance = JSON.parse(readFileSync(new URL('../generated/provenance.json', import.meta.url), 'utf8'));
  const prefix = '// GENERATED SOURCE SNAPSHOT — owned by @jini-ai/agentic; see ../README.md.\n';
  assert.ok(snapshot.startsWith(prefix));
  assert.equal(provenance.source, 'packages/agentic/src/core/annotated-actions-script.ts');
  assert.equal(createHash('sha256').update(snapshot.slice(prefix.length)).digest('hex'), provenance.sha256);
});
