import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeployTargetRegistry, DeployTargetInspection, DeployHostKit } from '../../deploy-targets/types.js';
import { createDeployHostKit } from '../../deploy-targets/host-kit.js';
import { inspectStaticPublish } from '../inspection.js';
import type { PublishCredentialSource } from '../types.js';
import type { FormDestinationForm, FormReceiverPort, FormSubmissionsInspection } from '#src/features/form-destinations/types';

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

test('a connection that cannot be opened refuses with the repair step and never echoes the vault fault', async () => {
  const f = setup();
  const credentialSource: PublishCredentialSource = { isConfigured: async () => ({ configured: true }), resolve: async () => { throw new Error('vault fault secret-token'); } };
  await assert.rejects(inspectStaticPublish({ deps: { ...f.deps, credentialSource }, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } }),
    { message: 'CREDENTIAL_RESOLUTION_FAILED: The saved connection could not be opened. Reopen the secure connection form and select or repair it before previewing again.' });
});

test('a provider preview that throws a non-Error value gets the generic actionable message', async () => {
  const f = setup();
  const registry = await f.deps.loadDeployTargets();
  const fixture = registry.get('fixture')!;
  const throwing: DeployTargetRegistry = { ...registry, get: target => target === 'fixture' ? { ...fixture, module: { ...fixture.module, preview: async () => { throw 'opaque provider value'; } } } : undefined };
  await assert.rejects(inspectStaticPublish({ deps: { ...f.deps, loadDeployTargets: async () => throwing }, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } }),
    { message: 'Provider inspection failed. Check the connection and preview again.' });
});

test('without an injected host kit the preview receives the default traced kit', async () => {
  const f = setup();
  const { hostKit: _injected, ...deps } = f.deps;
  assert.equal((await inspectStaticPublish({ deps, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } })).inspection, f.inspection);
  const previewInput = f.seen[1] as { kit: DeployHostKit };
  assert.equal(typeof previewInput.kit.fetch, 'function');
  assert.equal(typeof previewInput.kit.waitForReachableDeploymentUrl, 'function');
});

test('provider preview errors redact both declared secrets, including repeated values', async () => {
  const primary = 'private-primary-value';
  const secondary = 'private-secondary-value';
  const f = setup();
  const registry = await f.deps.loadDeployTargets();
  const target = registry.get('fixture')!;
  const multiSecret: DeployTargetRegistry = { ...registry, get: id => id === 'fixture' ? {
    ...target,
    descriptor: { ...target.descriptor, credential: { vendorId: 'fixture', tokenField: 'token', fields: [
      { name: 'token', label: 'Token', required: true, secret: true },
      { name: 'secondSecret', label: 'Secondary', required: true, secret: true },
    ] } },
    module: { ...target.module, preview: async ({ credential }) => {
      assert.equal(credential.token, primary);
      assert.equal(credential.secondSecret, secondary);
      throw new Error(`Provider refused ${credential.token}; secondary ${credential.secondSecret}; retry ${credential.secondSecret}. Check permissions.`);
    } },
  } : undefined };
  const credentialSource: PublishCredentialSource = { isConfigured: async () => ({ configured: true }),
    resolve: async () => ({ ok: true, token: primary, secondSecret: secondary }) };
  await assert.rejects(inspectStaticPublish({ deps: { ...f.deps, credentialSource, loadDeployTargets: async () => multiSecret },
    input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Provider refused [REDACTED:exact_secret]; secondary [REDACTED:exact_secret]; retry [REDACTED:exact_secret]. Check permissions.');
    assert.equal(error.message.includes(primary), false);
    assert.equal(error.message.includes(secondary), false);
    return true;
  });
});

test('a wired form port hands co-hosted forms to the host and adds core form line to the inspection', async () => {
  const f = setup();
  const asked: unknown[] = [];
  const forms: readonly FormDestinationForm[] = [{ slug: 'contact', fields: [{ name: 'email', required: true }] }];
  const formSubmissions: FormSubmissionsInspection = { status: 'on', forms: 1, message: 'Forms post to the co-hosted receiver.', changes: [] };
  const port = (answer: Awaited<ReturnType<FormReceiverPort['previewInput']>>): FormReceiverPort => ({
    previewInput: async (input: unknown) => { asked.push(input); return answer; },
    prepare: async () => assert.fail('preview never prepares a receiver'),
  });
  const hosted = await inspectStaticPublish({ deps: { ...f.deps, formDestination: port({ hosting: { forms }, formSubmissions }) }, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } });
  assert.equal((f.seen[1] as { formDestination?: unknown }).formDestination !== undefined, true);
  assert.deepEqual((f.seen[1] as { formDestination: { forms: unknown } }).formDestination.forms, forms);
  assert.deepEqual(hosted.inspection, { ...f.inspection, formSubmissions });
  assert.deepEqual((asked[0] as { workspaceId: string; hostingTargetId: string; projectName: string }), { workspaceId: 'workspace', hostingTargetId: 'fixture', projectName: 'site', kit: (asked[0] as { kit: unknown }).kit });
  const g = setup();
  const plain = await inspectStaticPublish({ deps: { ...g.deps, formDestination: port({}) }, input: { workspaceId: 'workspace', config: { target: 'fixture' }, projectName: 'site' } });
  assert.equal(plain.inspection, g.inspection);
  assert.equal('formDestination' in (g.seen[1] as object), false);
});
