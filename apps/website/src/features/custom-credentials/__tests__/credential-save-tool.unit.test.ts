import '../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolInputError, type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import { buildCredentialSaveRegistrations, type CredentialSaveAdapters } from '../credential-save-tool.js';
import { SECRET_FORM_TOOL_IDS } from '../../../contracts/headless/secret-form-cards.js';
import { isMcpUiToolCallPermitted } from '../../../assistant/mcp-ui-tool-calls.js';
import { approvalClassFor, applyToolApprovalPolicy } from '../../../assistant/tool-approval-policy.js';

const cases = [
  { adapter: 'apiCreate', input: { kind: 'api', label: 'billing', baseUrl: 'https://api.example.com', category: 'general' }, forwarded: { label: 'billing', baseUrl: 'https://api.example.com', category: 'general' } },
  { adapter: 'apiRotate', input: { kind: 'api', target: 'github' }, forwarded: { label: 'github' } },
  { adapter: 'mediaProvider', input: { kind: 'media-provider', target: 'openai', reason: 'Cover image' }, forwarded: { provider: 'openai', reason: 'Cover image' } },
  { adapter: 'sourceControl', input: { kind: 'source-control', target: 'github', label: 'backup' }, forwarded: { provider: 'github', label: 'backup' } },
  { adapter: 'publishHost', input: { kind: 'publish-host', target: 's3', prefill: { bucket: 'site', region: 'region-1' } }, forwarded: { target: 's3', bucket: 'site', region: 'region-1' } },
  { adapter: 'agentPluginToken', input: { kind: 'agent-plugin-token', target: 'supabase' }, forwarded: { pluginId: 'supabase' } },
  { adapter: 'pluginProvider', input: { kind: 'plugin-provider', target: 'mail-host' }, forwarded: { provider: 'mail-host' } },
] as const;

/** Inject observable adapters; no domain store, module mock or renderer is needed to test routing. */
function fixture() {
  const calls: Array<{ adapter: string; ctx: ToolExecutionContext; options: ToolExecutionOptions | undefined }> = [];
  const results = Object.fromEntries(cases.map(({ adapter }) => [adapter, Object.freeze({ owner: adapter })]));
  const adapters = Object.fromEntries(cases.map(({ adapter }) => [adapter, async (ctx: ToolExecutionContext, options?: ToolExecutionOptions) => {
    calls.push({ adapter, ctx, options }); return results[adapter];
  }])) as unknown as CredentialSaveAdapters;
  const registrations = buildCredentialSaveRegistrations({ adapters });
  const context = { executionId: 'save', principal: { id: 'owner' }, run: { id: 'run' }, signal: new AbortController().signal };
  return { registrations, calls, results, adapters, context };
}

for (const c of cases) test(`credential_save dispatches ${c.adapter} once with its original metadata and options`, async () => {
  const f = fixture();
  const options = { emitSurface: async () => undefined };
  const result = await f.registrations[0]!.handler({ ...f.context, input: c.input }, options);
  assert.equal(result, f.results[c.adapter], 'domain result identity is preserved');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.adapter, c.adapter);
  assert.deepEqual(f.calls[0]!.ctx.input, c.forwarded);
  assert.equal(f.calls[0]!.ctx.signal, f.context.signal);
  assert.equal(f.calls[0]!.ctx.principal, f.context.principal);
  assert.equal(f.calls[0]!.options, options);
});

test('only one save registration and five protected card ids remain; retired ids cannot redeem', () => {
  const f = fixture();
  assert.deepEqual(f.registrations.map(r => r.descriptor.id), ['credential_save']);
  assert.equal(f.registrations[0]!.descriptor.readOnly, false);
  // Phase 11: credential entry stays on the secure card without a separate approval ask.
  for (const c of cases) assert.equal(approvalClassFor({ toolId: 'credential_save', input: c.input }), 'edit');
  assert.equal(applyToolApprovalPolicy({ registration: f.registrations[0]!, surfaces: {} as never }), f.registrations[0], 'the card owns approval without a second confirmation');
  assert.deepEqual([...SECRET_FORM_TOOL_IDS].sort(), ['credential_save', 'database_transfer_set_destination', 'deployment_ops_set_secret', 'external_mcp_save', 'identity_user_create']);
  for (const id of ['custom_credential_create', 'custom_credential_set_token', 'media_propose_provider_credential', 'source_control_propose_credential', 'deployment_propose_custom_provider_credential', 'agent_plugin_set_access_token']) {
    assert.equal(isMcpUiToolCallPermitted(id, false), false);
    assert.equal(isMcpUiToolCallPermitted(id, true), false);
  }
  assert.equal(isMcpUiToolCallPermitted('credential_save', false), false);
  assert.equal(isMcpUiToolCallPermitted('credential_save', true), true);
});

test('unknown kinds, cross-kind fields, secret arguments and target replacement never call an owner', async () => {
  const f = fixture();
  for (const input of [
    { kind: 'toString' }, { kind: 'api', token: 'card-only-value' },
    { kind: 'api', target: 'existing', label: 'creation' },
    { kind: 'source-control', target: 'github', provider: 'other' },
    { kind: 'publish-host', target: 's3', prefill: { target: 'other' } },
    { kind: 'publish-host', target: 's3', prefill: [] },
    { kind: 'plugin-provider', target: 'mail-host', label: 'other row' },
    { kind: 'plugin-provider', target: 'mail-host', baseUrl: 'https://elsewhere.example' },
  ]) {
    await assert.rejects(f.registrations[0]!.handler({ ...f.context, input }), ToolInputError);
  }
  assert.deepEqual(f.calls, []);
});

test('unknown credential kinds explain the supported kinds without calling an owner', async () => {
  const f = fixture();
  await assert.rejects(f.registrations[0]!.handler({ ...f.context, input: { kind: 'unsupported' } }), {
    name: 'ToolInputError',
    message: 'Unknown credential kind. Use api, media-provider, source-control, publish-host, agent-plugin-token or plugin-provider.',
  });
  assert.deepEqual(f.calls, []);
});

test('plugin token saves refuse pluginId metadata even when target is valid', async () => {
  const f = fixture();
  await assert.rejects(f.registrations[0]!.handler({ ...f.context,
    input: { kind: 'agent-plugin-token', target: 'supabase', pluginId: 'other-plugin' },
  }), { name: 'ToolInputError', message: 'Use target for the installed plugin id.' });
  assert.deepEqual(f.calls, []);
});

test('domain authorization and errors propagate without replacing their identity or text', async () => {
  const f = fixture();
  const error = new ToolInputError({ message: 'Domain permission denied' });
  const registrations = buildCredentialSaveRegistrations({ adapters: { ...f.adapters, apiCreate: async () => { throw error; } } });
  await assert.rejects(registrations[0]!.handler({ ...f.context, input: { kind: 'api' } }), e => e === error);
  assert.deepEqual(f.calls, []);
});

test('publish credentials without prefill forward only the authoritative target', async () => {
  const f = fixture();
  const result = await f.registrations[0]!.handler({ ...f.context, input: { kind: 'publish-host', target: 's3' } });
  assert.equal(result, f.results.publishHost);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0]!.ctx.input, { target: 's3' });
  assert.deepEqual(f.calls[0]!.options, {});
});

test('publish credentials reject cross-kind metadata before opening the form', async () => {
  const f = fixture();
  await assert.rejects(f.registrations[0]!.handler({ ...f.context, input: { kind: 'publish-host', target: 's3', label: 'not-a-publish-field' } }), {
    name: 'ToolInputError', message: 'credential_save accepts only non-secret metadata for the selected kind; enter secrets in the human form.',
  });
  assert.deepEqual(f.calls, []);
});

test('media credentials reject the provider alias even when target is present', async () => {
  const f = fixture();
  await assert.rejects(f.registrations[0]!.handler({ ...f.context, input: { kind: 'media-provider', target: 'openai', provider: 'other' } }), {
    name: 'ToolInputError', message: 'Use target for the credential provider.',
  });
  assert.deepEqual(f.calls, []);
});

test('API creation forwards explicit worksFor including an empty human prefill', async () => {
  for (const worksFor of [["vercel"], []]) {
    const f = fixture();
    await f.registrations[0]!.handler({ ...f.context, input: { kind: 'api', label: 'Production access', worksFor } });
    assert.deepEqual(f.calls[0]!.ctx.input, { label: 'Production access', worksFor });
  }
});

for (const input of [
  { kind: 'api', target: undefined, baseUrl: 'https://example.com' },
  { kind: 'media-provider', target: null, reason: 'hint' },
  { kind: 'source-control', label: 'backup' },
  { kind: 'agent-plugin-token', target: 42 },
]) test(`routing preserves raw target validation for ${input.kind}`, async () => {
  const f = fixture();
  await f.registrations[0]!.handler({ ...f.context, input });
  const { kind, target, ...hints } = input;
  const field = kind === 'api' ? 'label' : kind === 'agent-plugin-token' ? 'pluginId' : 'provider';
  assert.deepEqual(f.calls[0]!.ctx.input, { ...hints, [field]: target });
});

for (const prefill of [null, 42, 'fields']) test(`publish routing rejects malformed prefill ${JSON.stringify(prefill)}`, async () => {
  const f = fixture();
  await assert.rejects(f.registrations[0]!.handler({ ...f.context, input: { kind: 'publish-host', target: 's3', prefill } }), ToolInputError);
  assert.deepEqual(f.calls, []);
});

test('plugin-provider cards dispatch to their existing save owner and preserve its options', async () => {
  for (const [saveKind, adapter, forwarded] of [
    ['publish-host', 'publishHost', { target: 'host' }],
    ['source-control', 'sourceControl', { provider: 'host' }],
    ['agent-plugin-token', 'agentPluginToken', { pluginId: 'host' }],
  ] as const) {
    const f = fixture();
    const registrations = buildCredentialSaveRegistrations({ adapters: f.adapters, loadPluginCredentialCards: async () => [{ providerId: 'card', label: 'Key', category: 'general', baseUrl: 'https://example.com', title: 'Connect', saveKind, saveTarget: 'host' }] });
    const options = { emitSurface: async () => undefined };
    await registrations[0]!.handler({ ...f.context, input: { kind: 'plugin-provider', target: 'card' } }, options);
    assert.equal(f.calls[0]!.adapter, adapter);
    assert.deepEqual(f.calls[0]!.ctx.input, forwarded);
    assert.equal(f.calls[0]!.options, options);
  }
});

test('OAuth-only cards direct callers to sign-in without saving to the API store', async () => {
  const f = fixture();
  const registrations = buildCredentialSaveRegistrations({ adapters: f.adapters, loadPluginCredentialCards: async () => [{ providerId: 'sign-in', label: 'Account', category: 'general', baseUrl: 'https://example.com', title: 'Connect', saveKind: 'oauth' }] });
  await assert.rejects(registrations[0]!.handler({ ...f.context, input: { kind: 'plugin-provider', target: 'sign-in' } }), /agent_plugin_connect/);
  assert.deepEqual(f.calls, []);
});
