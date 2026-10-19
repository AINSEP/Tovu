import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeployTargetRegistry, DeployTargetInspection, DeployHostKit } from '../../deploy-targets/types.js';
import { createDeployHostKit } from '../../deploy-targets/host-kit.js';
import { inspectStaticPublish } from '../inspection.js';
import type { PublishCredentialSource } from '../types.js';

/** Tests the real provider-inspection boundary using actual host/registry/credential interfaces. */
function setup({ inspectionError, legacy = false, configured = true }: { inspectionError?: string; legacy?: boolean; configured?: boolean } = {}) {
  const seen: unknown[] = [];
  const inspection: DeployTargetInspection = { resourceName: 'remote-name', targetId: 'fixture', hostingChanges: [] };
  const kit: DeployHostKit = createDeployHostKit({ fetchFn: async () => assert.fail('The fake module must use its explicit seam') });
  const registry: DeployTargetRegistry = {
    refusals: [],
    get: target => target === 'fixture' ? { pluginId: 'fixture', descriptor: { id: 'fixture', label: 'Fixture', module: 'target.mjs', configFields: [] },
      module: { create: () => assert.fail('preview cannot construct a publishing target'),
        ...(!legacy ? { preview: async input => { seen.push(input); if (inspectionError) throw new Error(inspectionError); return inspection; } } : {}),
      } } : undefined,
    list: () => [],
  };
  const credentialSource: PublishCredentialSource = {
    isConfigured: async () => ({ configured: true }),
    resolve: async input => { seen.push(input); return configured ? { ok: true, token: 'secret-token', accountId: 'account', credentialId: 'selected-id' } : { ok: false, reason: 'Save a connection in the secure form.' }; },
  };
  return { deps: { credentialSource, loadDeployTargets: async () => registry, hostKit: kit }, seen, inspection };
}

test('inspection binds the chosen connection and config; returns no usable credential', async () => {
  const f = setup();
  const result = await inspectStaticPublish({ deps: f.deps, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site', credentialId: 'selected-id' } });
  assert.deepEqual(f.seen[0], { workspaceId: 'workspace', target: 'fixture', credentialId: 'selected-id' });
  assert.equal(result.credentialId, 'selected-id');
  assert.equal(result.inspection, f.inspection);
  assert.match(result.credentialBinding!, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('legacy local-only preview never resolves a credential; invalid config/project fails before decrypt', async () => {
  const legacy = setup({ legacy: true });
  assert.deepEqual(await inspectStaticPublish({ deps: legacy.deps, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: '' } }), {});
  assert.equal(legacy.seen.length, 0);
  const f = setup();
  await assert.rejects(inspectStaticPublish({ deps: f.deps, input: { workspaceId: 'workspace', config: { target: 'unknown' }, projectName: 'site' } }), /not available/);
  await assert.rejects(inspectStaticPublish({ deps: f.deps, input: { workspaceId: 'workspace', config: { target: 'fixture', customDomain: 'example.com' }, projectName: ' ' } }), /PROJECT_NAME_REQUIRED/);
  assert.equal(f.seen.length, 0);
});

test('a preview without a project label and without a domain keeps the local-only answer (admin card)', async () => {
  const f = setup();
  assert.deepEqual(await inspectStaticPublish({ deps: f.deps, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: '' } }), {});
  assert.equal(f.seen.length, 0);
});

test('unavailable credential and provider errors are actionable and redact secrets', async () => {
  for (const options of [{ configured: false }, { inspectionError: 'Provider rejected secret-token. Check permissions.' }]) {
    const f = setup(options);
    await assert.rejects(inspectStaticPublish({ deps: f.deps, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } }), error => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /secret-token/);
      assert.match(error.message, /Save a connection|Check permissions/);
      return true;
    });
  }
});
