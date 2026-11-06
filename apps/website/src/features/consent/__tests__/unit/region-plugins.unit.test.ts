/** @file Region readers come only from the configured ingress plugin's data file; anything else is strict. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveRegion } from '@jini-ai/cookie-consent/server';
import { agentPluginSourceDir } from '../../../../../../../development/test-support/agent-plugin-source.mjs';
import { CONSENT_CONTRIBUTIONS_FILENAME, loadSiteRegionResolvers, loadSiteConsentBridges, parseConsentContributions, toRegionResolvers } from '../../region-plugins.js';

const request = (headers: Record<string, string>) => ({ header: (name: string) => headers[name] ?? null, ip: null });
const file = (contributions: unknown[]) => JSON.stringify({ schemaVersion: 2, contributions });

test('schema 2 parses; region entries are kept and unknown kinds are skipped, not refused', () => {
  const parsed = parseConsentContributions({ raw: file([{ kind: 'region-resolver', id: 'a', header: 'x-a' }, { kind: 'tracker-signature', id: 'b' }, null, 'x']) });
  assert.deepEqual(parsed, { ok: true, descriptors: [{ kind: 'region-resolver', id: 'a', header: 'x-a' }] });
  assert.equal(parseConsentContributions({ raw: '{' }).ok, false);
  assert.equal(parseConsentContributions({ raw: JSON.stringify({ schemaVersion: 1, contributions: [] }) }).ok, false);
  assert.equal(parseConsentContributions({ raw: JSON.stringify({ schemaVersion: 2 }) }).ok, false);
});

test('the bundled host plugins ship one valid reader each', async () => {
  for (const [plugin, header] of [['cloudflare', 'cf-ipcountry'], ['vercel', 'x-vercel-ip-country'], ['netlify', 'x-country']] as const) {
    const raw = readFileSync(path.join(agentPluginSourceDir({ pluginId: plugin }), CONSENT_CONTRIBUTIONS_FILENAME), 'utf8');
    const parsed = parseConsentContributions({ raw });
    assert.ok(parsed.ok);
    const resolvers = toRegionResolvers({ entries: parsed.descriptors });
    assert.equal(await resolveRegion({ resolvers, request: request({ [header]: 'US' }) }), 'us');
    assert.equal(await resolveRegion({ resolvers, request: request({ [header]: 'DE' }) }), 'strict');
  }
});

test('an entry the region slot refuses is dropped; the legacy header setting is one more reader', async () => {
  const resolvers = toRegionResolvers({ entries: [{ kind: 'region-resolver', id: 'bad', header: 'not a header!' }] }, { legacyHeader: 'x-country-code' });
  assert.equal(resolvers.length, 1);
  assert.equal(await resolveRegion({ resolvers, request: request({ 'x-country-code': 'us' }) }), 'us');
});

/** A fake loader returning two active plugins' readers, recording what it was asked. */
function loader(calls: unknown[]) {
  return (async (required: unknown, optional: unknown) => {
    calls.push({ required, optional });
    return { items: [{ pluginId: 'cloudflare', entry: { kind: 'region-resolver', id: 'cloudflare', header: 'cf-ipcountry' } },
      { pluginId: 'vercel', entry: { kind: 'region-resolver', id: 'vercel', header: 'x-vercel-ip-country' } }], refusals: [] };
  }) as unknown as Parameters<typeof loadSiteRegionResolvers>[0]['loadContributions'];
}

test('only the configured ingress plugin is trusted, from active plugins only', async () => {
  const calls: Array<{ optional: unknown }> = [];
  const resolvers = await loadSiteRegionResolvers({ workspaceId: 'w', loadContributions: loader(calls) }, { ingress: 'vercel' });
  assert.deepEqual(resolvers.map(item => item.id), ['vercel']);
  assert.deepEqual(calls[0]!.optional, { requireActive: true });
  // The other host's header is now just a visitor-supplied header: strict.
  assert.equal(await resolveRegion({ resolvers, request: request({ 'cf-ipcountry': 'US' }) }), 'strict');
});

test('no ingress (Fly, Electron) loads nothing and stays strict; a loader fault stays strict too', async () => {
  const calls: unknown[] = [];
  assert.deepEqual(await loadSiteRegionResolvers({ workspaceId: 'w', loadContributions: loader(calls) }), []);
  assert.equal(calls.length, 0);
  const failing = (async () => { throw new Error('disk'); }) as unknown as Parameters<typeof loadSiteRegionResolvers>[0]['loadContributions'];
  const error = console.error; console.error = () => {};
  try { assert.deepEqual(await loadSiteRegionResolvers({ workspaceId: 'w', loadContributions: failing }, { ingress: 'cloudflare' }), []); }
  finally { console.error = error; }
});


test('bridge declarations keep safe served URLs and reject executable URL schemes', () => {
  const valid = ['/plugins/banner.js', 'https://cmp.example/bridge.js', 'http://localhost:3000/bridge.js'];
  const invalid = ['javascript:alert(1)', 'data:text/javascript,alert(1)', '//other.example/bridge.js', 'bridge.js', '/\\other.example/bridge.js'];
  const parsed = parseConsentContributions({ raw: file([...valid, ...invalid].map((src, i) => ({ kind: 'consent-bridge', id: `bridge-${i}`, src }))) });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.descriptors.map(item => item.src), valid);
});

test('active browser bridges are loaded without trusting their region readers', async () => {
  const calls: Array<{ optional: unknown }> = [];
  const loadContributions = (async (required: unknown, optional: unknown) => {
    calls.push({ optional });
    return { items: [
      { pluginId: 'cmp', entry: { kind: 'consent-bridge', id: 'cmp', src: '/plugins/cmp.js' } },
      { pluginId: 'cmp', entry: { kind: 'region-resolver', id: 'cmp-region', header: 'x-country' } },
      { pluginId: 'cmp', entry: { kind: 'consent-bridge', id: 'bad', src: 'javascript:alert(1)' } },
    ], refusals: [] };
  }) as unknown as Parameters<typeof loadSiteRegionResolvers>[0]['loadContributions'];
  assert.deepEqual(await loadSiteConsentBridges({ workspaceId: 'w', loadContributions }), [{ kind: 'consent-bridge', id: 'cmp', src: '/plugins/cmp.js' }]);
  assert.deepEqual(calls[0]!.optional, { requireActive: true });
  const resolvers = await loadSiteRegionResolvers({ workspaceId: 'w', loadContributions }, { ingress: 'cmp' });
  assert.deepEqual(resolvers.map(item => item.id), ['cmp-region']);
});
