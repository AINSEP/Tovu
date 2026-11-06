import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFormCollectionRegistry } from '@jini-ai/cms/forms';
import type { LoadedDeployTarget } from '../../deploy-targets/types.js';
import { publicPageSecurityHeaders } from '../../../theme/public-page-security-headers.js';
import { publishStaticSite } from '../adapter.js';

test('publishing carries current declared frame origins through its existing header data', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'tovu-publish-frame-headers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const providers = createFormCollectionRegistry({});
  providers.contribute({ pluginId: 'fourth', definition: { id: 'fourth', provider: {
    describe: () => ({ label: 'Fourth', fields: [], answers: 'Fourth answers', validation: 'Fourth checks', frameOrigins: ['https://frames.example.test'] }),
    plan: () => ({ kind: 'unavailable', code: 'invalid_configuration', message: 'Configure a public form.' }),
  } } });
  let seen: Readonly<Record<string, string>> | undefined;
  const target: LoadedDeployTarget = { pluginId: 'deploy', descriptor: { id: 'acme', label: 'Acme', module: 'acme.mjs', configFields: [] }, module: { create: () => ({
    id: 'acme',
    publish: async input => { seen = input.responseHeaders; return { targetId: 'acme', url: 'https://site.example.test', status: 'ready' }; },
    checkReachability: async () => ({ reachable: true }),
  }) } };
  const outcome = await publishStaticSite({
    credentialSource: { resolve: async () => ({ ok: true, token: 'dummy' }), isConfigured: async () => ({ configured: true }) },
    loadDeployTargets: async () => ({ get: () => target, list: () => [target], refusals: [] }),
    publicPageSecurityHeaders: () => publicPageSecurityHeaders({ formCollectionProviders: () => providers }),
  }, {
    workspaceId: 'ws-frames', publishOutputRootDir: root, idGen: { newId: () => 'run-1' }, config: { target: 'acme' }, projectName: 'Public collection headers',
    exportSiteBound: async () => ({
      outputDir: root, basePath: '/', startedAt: '2026-11-05T00:00:00.000Z', finishedAt: '2026-11-05T00:00:00.000Z',
      routes: { succeeded: [], failed: [] }, assets: { succeeded: [], failed: [] },
      skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [],
    }),
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(seen, publicPageSecurityHeaders({ formCollectionProviders: () => providers }));
  assert.match(seen?.['Content-Security-Policy-Report-Only'] ?? '', /frame-src [^;]* https:\/\/frames.example.test(?:;|$)/);
});
