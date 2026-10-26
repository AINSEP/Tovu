import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { parseAgentPluginManifest } from '@jini-ai/agent-plugins/manifest';
import { fillPluginExportTemplate, substituteHtmlEmbeds } from '@jini-ai/cms/widgets/html';
import { embedMarkerSnippetFromConfig } from '@jini-ai/cms/widgets/markers';
import { createPluginExportRuntime } from '../../../../apps/website/src/features/agent-plugins/exports/runtime.ts';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('plugin.json', root), 'utf8'));
const parsed = parseAgentPluginManifest({ value: raw }, { identityNamespace: 'tovu' });
const workspaceId = 'ws-google-button';
const config = { type: 'plugin', plugin: 'tovu/google-login', component: 'sign-in-button', version: 1, props: { variant: 'light' } };

function harness({ enabled = true, ready = true, providerPlugin = 'google-login' } = {}) {
  assert.equal(parsed.ok, true);
  const owner = { ...parsed.manifest, id: 'tovu/google-login', enabled,
    plugin: { pluginId: 'google-login', packageRoot: '/unused/google-login' } };
  return createPluginExportRuntime({ workspaceId, source: {
    list: async () => [owner],
    readFile: async ({ filename }) => readFileSync(new URL(filename, root), 'utf8'),
    readAsset: async ({ filename }) => readFileSync(new URL(filename, root), 'utf8'),
  }, listProviders: async () => ready ? [{ id: 'google', pluginId: providerPlugin }] : [] });
}

test('U1: the bundled contract pins the host link, fixed label, consent and static fallback', () => {
  assert.equal(parsed.ok, true);
  const definition = parsed.manifest.exports['sign-in-button'];
  assert.equal(definition.staticExport, 'fallback-only');
  assert.equal(definition.consent, 'necessary');
  assert.deepEqual(definition.hostLinks, { signIn: 'member-login:google' });
  assert.deepEqual(definition.props.properties.variant.enum, ['light', 'dark', 'neutral']);
});

test('U1: each variant passes the real fragment policy with native keyboard navigation and local assets', async () => {
  for (const variant of ['light', 'dark', 'neutral']) {
    const definition = await harness().forRender({ mode: 'live' }).resolve({ workspaceId, config: { ...config, props: { variant } } });
    assert.ok(definition);
    const html = fillPluginExportTemplate({ definition });
    assert.ok(html.includes(`class="plugin-google-login-sign-in-button plugin-google-login-sign-in-button--${variant}"`));
    assert.ok(html.startsWith('<a class="plugin-google-login-sign-in-button '));
    assert.ok(html.includes('href="/api/members/v1/workspaces/ws-google-button/oidc/google/start"'));
    assert.ok(html.includes('width="20" height="20" alt=""'));
    assert.ok(html.includes('>Sign in with Google</span>'));
    assert.ok(html.includes('src="/api/agent-plugin-exports/v1/google-login/sign-in-button/exports/google-g.svg"'));
    assert.doesNotMatch(html, /<script|<svg|style=|onclick=|{{|data-embed-config/);
  }
});

test('U1: disabled, unconfigured and foreign-owner providers cannot render a button', async () => {
  for (const options of [{ enabled: false }, { ready: false }, { providerPlugin: 'other-plugin' }]) {
    const runtime = harness(options);
    assert.equal(await runtime.forRender({ mode: 'live' }).resolve({ workspaceId, config }), undefined);
    const warnings = await runtime.validateHtml({ workspaceId, html: embedMarkerSnippetFromConfig({ config }) });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, options.enabled === false ? 'PLUGIN_DISABLED' : 'PLUGIN_HOST_UNAVAILABLE');
  }
  const rows = await harness({ ready: false }).catalog({ workspaceId });
  assert.equal(rows.get('google-login')[0].availability, 'host-unavailable');
  assert.equal(rows.get('google-login')[0].snippet, null);
  const configured = await harness().catalog({ workspaceId });
  assert.equal(configured.get('google-login')[0].availability, 'props-required');
  assert.equal(configured.get('google-login')[0].plugin, 'tovu/google-login');
});

test('U1: arbitrary variant, label and URL props are rejected, including a mixed valid/invalid batch', async () => {
  const runtime = harness();
  for (const props of [{}, { variant: 'pink' }, { variant: 'light', label: 'Other' }, { variant: 'light', href: '//elsewhere.invalid' }]) {
    const bad = { ...config, props };
    assert.equal(await runtime.forRender({ mode: 'live' }).resolve({ workspaceId, config: bad }), undefined);
    await assert.rejects(runtime.validateHtml({ workspaceId, html: embedMarkerSnippetFromConfig({ config }) + embedMarkerSnippetFromConfig({ config: bad }) }),
      { code: 'PLUGIN_EMBED_INVALID_PROPS' });
  }
});

test('U1: static mode keeps authored fallback and bundles deduplicated CSS and G artwork references', async () => {
  const session = harness().forRender({ mode: 'static' });
  assert.equal(await session.resolve({ workspaceId, config }), undefined);
  assert.equal(await session.resolve({ workspaceId, config }), undefined);
  const marker = embedMarkerSnippetFromConfig({ config }).replace('></div>', '><p>Google sign-in is currently unavailable.</p></div>');
  const html = substituteHtmlEmbeds({ html: marker, resolve: () => undefined });
  assert.ok(html.includes('<p>Google sign-in is currently unavailable.</p>'));
  assert.doesNotMatch(html, /data-embed-config|oidc\/google\/start|<button/);
  const head = session.headHtml({});
  assert.equal((head.match(/rel="stylesheet"/g) ?? []).length, 1);
  assert.ok(head.includes('/exports/sign-in-button.css'));
  assert.ok(head.includes('/exports/google-g.svg'));
});

test('U1: every bundled public export template passes the single CMS fragment validator', () => {
  const pluginsRoot = new URL('../', root);
  let count = 0;
  // Bundled-only v1: a new export joins this contract check without an install-time CMS dependency.
  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true }).filter(item => item.isDirectory())) {
    const pluginRoot = new URL(`${entry.name}/`, pluginsRoot);
    let manifest;
    try { manifest = JSON.parse(readFileSync(new URL('plugin.json', pluginRoot), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const definition of Object.values(manifest.extensions?.tovu?.exports ?? {})) {
      count += 1;
      const host = Object.fromEntries(Object.keys(definition.hostLinks ?? {}).map(key => [key, '/fixture/start']));
      host.assets = Object.fromEntries(Object.keys(definition.assets ?? {}).map(key => [key, '/fixture/mark.svg']));
      assert.doesNotThrow(() => fillPluginExportTemplate({ definition: { ...definition,
        template: readFileSync(new URL(definition.template, pluginRoot), 'utf8'), props: { variant: 'light' }, host } }));
    }
  }
  assert.ok(count > 0);
});
