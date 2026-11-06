import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSiteRouteDeps } from '../deps.js';
import { bootProviderPlugins } from '../provider-plugins.js';

/** Exercise the actual activation callback handed to HTTP, tools and the daemon activation poll. */
test('site activation refreshes the existing provider host after the plugin runtime accepts enable', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'provider-enable-'));
  const applied: string[] = [];
  const deps = await createSiteRouteDeps(path.join(dir, 'content.db'), {
    bootProviderPlugins: async (...args) => {
      const ports = await bootProviderPlugins(...args);
      return { ...ports, reapply: async input => { applied.push(input.pluginId); return ports.reapply(input); } };
    },
  });
  t.after(async () => { await deps.contentKernel?.close(); await rm(dir, { recursive: true, force: true }); });
  await Promise.all([deps.identityReady, deps.settingsReady, deps.seoReady, deps.commentsReady, deps.commentsSettingsReady,
    deps.executionSettingsReady, deps.settingsUiTabsReady, deps.analyticsSettingsReady, deps.siteTitleReady,
    deps.pluginRuntimeReady, deps.blobHydrationReady, deps.adminPasswordResetReady, deps.legacyPublishCredentialsReady]);
  await deps.onPluginEnabled('word-count');
  assert.ok(applied.includes('word-count'), 'an activation must refresh the provider inventory without a settings save');
  const accepted = applied.length;
  await assert.rejects(deps.onPluginEnabled('missing-provider-fixture'));
  assert.equal(applied.length, accepted, 'runtime rejection must not reach provider admission');
});
