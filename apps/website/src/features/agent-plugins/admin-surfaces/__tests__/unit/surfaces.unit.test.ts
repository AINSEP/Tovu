/**
 * @file Unit tests for `surfaces.ts`: the surface file URL, the default no-op host, the
 * lifecycle-backed source (activation required, ordered by plugin id), the id lookup and the
 * declared-file read. Typed fakes of the lifecycle's two methods; vendor-neutral ids.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAdminSurfacesFile, type LoadedAdminSurface } from '@jini-ai/agent-plugins/admin-surfaces';
import type { LoadPluginContributionsOptional, PluginContributionDefinition, TrustedPluginPackage } from '@jini-ai/agent-plugins/lifecycle';

import { createIssuedSignInCollector } from '../../issued-sign-ins.js';
import type { TovuAgentPluginLifecycle } from '#src/features/agent-plugins/lifecycle';
import {
  ADMIN_SURFACES_FILENAME, ADMIN_SURFACE_FILES_PREFIX, NO_ADMIN_SURFACE_HOST,
  withAdminSurfaceSignIns, adminSurfaceFileUrl, createAgentPluginAdminSurfaceSource, findAdminSurface, readSurfaceFile, type AdminSurfaceSource,
} from '../../surfaces.js';

type Lifecycle = Pick<TovuAgentPluginLifecycle, 'loadPluginContributions' | 'readTrustedPluginFile'>;

function surface(pluginId: string, id: string): LoadedAdminSurface {
  const parsed = parseAdminSurfacesFile({ raw: JSON.stringify({ schemaVersion: 1, surfaces: [{ id, title: 'Manage connection', entry: 'surface/index.html', files: ['surface/app.mjs'], actions: [], csp: {} }] }) });
  assert.ok(parsed.ok);
  return { plugin: { pluginId, packageRoot: `/nonexistent/${pluginId}` }, descriptor: parsed.descriptors[0]! };
}

function fakeSource(surfaces: readonly LoadedAdminSurface[]) {
  const reads: Array<{ plugin: TrustedPluginPackage; filename: string }> = [];
  const source: AdminSurfaceSource = {
    list: async () => surfaces,
    readFile: async (input) => { reads.push(input); return `/* ${input.filename} */`; },
  };
  return { source, reads };
}

test('the file URL sits under the public prefix and encodes every segment but keeps the path separators', () => {
  assert.equal(ADMIN_SURFACE_FILES_PREFIX, '/api/agent-plugin-surfaces/v1');
  assert.equal(
    adminSurfaceFileUrl({ pluginId: 'acme office', surfaceId: 'a/b', path: 'surface/my file.html' }),
    '/api/agent-plugin-surfaces/v1/acme%20office/a%2Fb/surface/my%20file.html',
  );
});

test('the default host has no handlers and starts every surface with null data', async () => {
  assert.deepEqual(NO_ADMIN_SURFACE_HOST.handlersFor({ pluginId: 'acme-office', surfaceId: 's' }), {});
  assert.equal(await NO_ADMIN_SURFACE_HOST.bootstrapData({ context: { workspaceId: 'ws-1', principalId: 'owner', pluginId: 'acme-office', surfaceId: 's' } }), null);
  assert.equal(NO_ADMIN_SURFACE_HOST.signIns, undefined);
});

test('the lifecycle source loads the surfaces file for the workspace, active plugins only, ordered by plugin id', async () => {
  const calls: Array<{ workspaceId: string; filename: string; optional: unknown }> = [];
  const plugin = { pluginId: 'acme-office', packageRoot: '/nonexistent/acme-office' };
  const raw = JSON.stringify({ schemaVersion: 1, surfaces: [{ id: 'connection-settings', title: 'Manage connection', entry: 'surface/index.html', files: [], actions: [], csp: {} }] });
  // A one-package loader that runs the source's own definition, so the items are real loads.
  const lifecycle: Lifecycle = {
    loadPluginContributions: async <D, T>(required: { readonly workspaceId: string; readonly definition: PluginContributionDefinition<D, T> }, optional?: LoadPluginContributionsOptional) => {
      calls.push({ workspaceId: required.workspaceId, filename: required.definition.filename, optional });
      const parsed = required.definition.parse({ raw });
      assert.ok(parsed.ok);
      const importModule = async (): Promise<never> => { throw new Error('a data contribution imports no module'); };
      const items: T[] = [];
      for (const descriptor of parsed.descriptors) {
        const loaded = await required.definition.load({ plugin, descriptor, importModule });
        // `Awaited<T>` is `T` here (a loaded surface is never a thenable); TS cannot see that for a free T.
        if (typeof loaded !== 'string') items.push(loaded as T);
      }
      return { items, refusals: [] };
    },
    readTrustedPluginFile: async () => '',
  };
  const items = await createAgentPluginAdminSurfaceSource({ lifecycle }).list({ workspaceId: 'ws-1' });
  assert.deepEqual(items.map((item) => [item.plugin.pluginId, item.descriptor.id]), [['acme-office', 'connection-settings']]);
  assert.deepEqual(calls, [{ workspaceId: 'ws-1', filename: ADMIN_SURFACES_FILENAME, optional: { requireActive: true, orderByPluginId: true } }]);
});

test('the lifecycle source reads a file through the lifecycle\'s contained read for that plugin', async () => {
  const reads: Array<{ plugin: TrustedPluginPackage; filename: string }> = [];
  const lifecycle: Lifecycle = {
    loadPluginContributions: async () => ({ items: [], refusals: [] }),
    readTrustedPluginFile: async (plugin, filename) => { reads.push({ plugin, filename }); return 'contents'; },
  };
  const plugin = { pluginId: 'acme-office', packageRoot: '/nonexistent/acme-office' };
  assert.equal(await createAgentPluginAdminSurfaceSource({ lifecycle }).readFile({ plugin, filename: 'surface/app.mjs' }), 'contents');
  assert.deepEqual(reads, [{ plugin, filename: 'surface/app.mjs' }]);
});

test('findAdminSurface needs both the plugin id and the surface id to match', async () => {
  const wanted = surface('acme-office', 'connection-settings');
  const { source } = fakeSource([surface('other-plugin', 'connection-settings'), surface('acme-office', 'other-surface'), wanted]);
  assert.equal(await findAdminSurface({ source, workspaceId: 'ws-1', pluginId: 'acme-office', surfaceId: 'connection-settings' }), wanted);
  assert.equal(await findAdminSurface({ source, workspaceId: 'ws-1', pluginId: 'acme-office', surfaceId: 'missing' }), undefined);
});

test('readSurfaceFile serves a declared file through the source and refuses an undeclared one without reading', async () => {
  const loaded = surface('acme-office', 'connection-settings');
  const { source, reads } = fakeSource([loaded]);
  const declared = await readSurfaceFile({ source, surface: loaded, path: 'surface/app.mjs' });
  assert.equal(declared.ok, true);
  const undeclared = await readSurfaceFile({ source, surface: loaded, path: 'secrets.json' });
  assert.equal(undeclared.ok, false);
  assert.deepEqual(reads.map((read) => read.filename), ['surface/app.mjs']);
});


test('screen and assistant actions return host-issued sign-in URLs without opening a browser', async () => {
  const signIns = createIssuedSignInCollector();
  const link = { authorizationUrl: 'https://auth.example.test/start', expiresAt: '2026-10-20T00:10:00Z' };
  const result = await withAdminSurfaceSignIns({ host: { ...NO_ADMIN_SURFACE_HOST, signIns }, run: async () => {
    signIns.record(link);
    return { ok: true, result: { expiresAt: link.expiresAt } };
  } });
  assert.deepEqual(result, { ok: true, result: { expiresAt: link.expiresAt }, hostSignIns: [link] });
});

test('failed actions never expose a collected sign-in URL, and hosts without collectors preserve the outcome', async () => {
  const signIns = createIssuedSignInCollector();
  const outcome = { ok: false, error: { code: 'refused', message: 'Refused', retryable: false } } as const;
  const result = await withAdminSurfaceSignIns({ host: { ...NO_ADMIN_SURFACE_HOST, signIns }, run: async () => {
    signIns.record({ authorizationUrl: 'https://auth.example.test/start', expiresAt: '2026-10-20T00:10:00Z' });
    return outcome;
  } });
  assert.equal(result, outcome);
  assert.equal(await withAdminSurfaceSignIns({ host: NO_ADMIN_SURFACE_HOST, run: async () => outcome }), outcome);
});
