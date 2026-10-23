import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { loadSourceControlProviderRegistryFromSource } from '../../../../apps/website/src/features/source-control/provider-registry.ts';
import { createSourceControlCredential } from '../../../../apps/website/src/features/source-control/store.ts';
import { buildSourceControlRegistrations } from '../../../../apps/website/src/features/source-control/tool-registrations.ts';
import { InMemorySourceControlCredentialSetRepo } from '../../../../apps/website/src/features/source-control/repo.memory.ts';
import { InMemoryKeyring } from '../../../../apps/website/src/features/webhooks/keyring.memory.ts';
import { AesGcmSecretSealer } from '../../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.ts';

// Regression (2026-09-24): production never passes `gitAdapter`, and the tool used to forward only an
// injected one, so every confirmed commit answered "no GitHub commit adapter is configured — this is
// a wiring bug". With no override, the confirmed call must reach the real GitHub adapter.
test('with no gitAdapter override, a confirmed commit reaches the real GitHub adapter', async t => {
  const exportDir = mkdtempSync(path.join(tmpdir(), 'tovu-github-tool-wiring-'));
  t.after(() => rmSync(exportDir, { recursive: true, force: true }));
  const keyring = new InMemoryKeyring();
  const repo = new InMemorySourceControlCredentialSetRepo();
  const sealer = new AesGcmSecretSealer(keyring);
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const loadSourceControlProviders = () => loadSourceControlProviderRegistryFromSource({ pluginId: 'github', packageRoot });
  await createSourceControlCredential({ deps: {
    repo, sealer, keyring, clock: createSystemClock(), idGen: createRandomUuidGenerator(), loadSourceControlProviders,
    fetchFn: async url => {
      assert.equal(String(url), 'https://api.github.com/user');
      return Response.json({ login: 'octo' });
    },
  }, input: { workspaceId: 'github-wiring', label: 'Test', connection: { providerId: 'github', token: 'ghp_wiring_probe' } } });
  const requested = [];
  // A strict fake transport must never fall through to real HTTP. Only the repository lookup
  // is expected here; credential identity discovery above has its own injected transport.
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = String(input);
    requested.push({ url, authorization: new Headers(init?.headers).get('authorization') });
    assert.equal(url, 'https://api.github.com/repos/octo/demo');
    assert.equal(init?.method ?? 'GET', 'GET');
    return Response.json({ message: 'Not Found' }, { status: 404 });
  });
  let exportCount = 0;
  const permissions = [];
  const deps = {
    workspaceId: 'github-wiring', sourceControlCredentialSetRepo: repo,
    siteAssistantSecretSealer: sealer, siteAssistantSecretKeyring: keyring,
    clock: createSystemClock(), idGen: createRandomUuidGenerator(), loadSourceControlProviders,
    sourceControlExportRootDir: exportDir,
    authorize: async input => { permissions.push(input.permission); return { allowed: true, reason: 'matched' }; },
    exportSiteBound: async ({ outputDir }) => {
      exportCount++;
      assert.equal(path.dirname(outputDir), path.join(exportDir, 'github'));
      return { outputDir, routes: { succeeded: [{ path: '/', kind: 'home', outputFile: 'index.html', data: '<html>export fixture</html>' }], failed: [] },
        assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [], droppedReferences: [] };
    },
  };
  const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registration = buildSourceControlRegistrations(deps, { surfaceExchanges: surfaces }).find(tool => tool.descriptor.id === 'source_control_execute_commit');
  assert.ok(registration);
  assert.equal('gitAdapter' in deps, false);
  const result = await registration.handler({ executionId: 'github-wiring-exec', principal: { id: 'person' }, run: { id: 'github-wiring-run' },
    input: { provider: 'github', owner: 'octo', repo: 'demo', commitMessage: 'x' }, signal: new AbortController().signal });
  assert.deepEqual(result, { committed: false, cancelled: false, code: 'REPOSITORY_NOT_FOUND',
    message: "no repository 'octo/demo' is reachable with this token — it may not exist, or the token cannot see it" });
  assert.deepEqual(requested, [{ url: 'https://api.github.com/repos/octo/demo', authorization: 'Bearer ghp_wiring_probe' }]);
  assert.deepEqual(permissions, ['source-control.commit']);
  assert.equal(exportCount, 1);
  assert.equal(surfaces.size(), 0);
});
