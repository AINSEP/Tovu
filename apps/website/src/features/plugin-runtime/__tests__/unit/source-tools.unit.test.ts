import assert from 'node:assert/strict';
import test from 'node:test';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { ToolInputError, ToolPermissionDeniedError, type ToolExecutionContext, type SurfaceEmitter } from '@jini-ai/core';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { PluginInstallError, PluginSourceError, type PluginSourcePort, type PluginInstallPreview } from '@jini-ai/plugins/host/node';
import { buildPluginSourceRegistrations, contributePluginSourceTools, pluginSourceAgentToolCatalog, pluginSourceDerivedRisk } from '../../source-tools.js';
import { pluginAgentToolCatalog } from '../../agent-tools.js';
import { toolMetadata } from '../../../../contracts/core/tool-metadata/plugin-runtime.js';
import { resolveBatchableTools } from '../../../../assistant/batch-tool-inputs.js';
import { isMcpUiToolCallPermitted } from '../../../../assistant/mcp-ui-tool-calls.js';

const preview: PluginInstallPreview = { id: 'rules', name: 'Rules', version: '0.1.0', tier: 'tier-3', capabilities: [], hooks: [], hasCode: true, digest: 'sha256-' + 'a'.repeat(64), contentTypes: [], conflicts: [] };
const ctx = (input: unknown): ToolExecutionContext => ({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, signal: new AbortController().signal, input });
test('assistant authoring and enable guidance advertise executable contributions and their grants', () => {
  const descriptions = [pluginSourceAgentToolCatalog.find(tool => tool.name === 'plugin_source_create')!.description,
    pluginAgentToolCatalog.find(tool => tool.name === 'plugins_set_enabled')!.description];
  for (const description of descriptions) {
    assert.doesNotMatch(description, /not mounted yet/);
    for (const term of ['sdk.routes.add', 'sdk.tools.add', 'sdk.widgets.add', 'http.route.register', 'tools.register', 'render.contribute', 'contributes.routes', 'contributes.tools', 'contributes.widgets', '/api/p/<plugin-id>']) assert.ok(description.includes(term), term);
  }
});
function fixture(options: { allowed?: boolean; source?: boolean; error?: Error } = {}) {
  const calls: Array<{ operation: string; input: unknown; options: unknown }> = [];
  let digest = 'original';
  function record(operation: string, input: unknown, executionOptions: unknown) { if (executionOptions === undefined) assert.fail('Every source call carries two objects'); if (options.error) throw options.error; calls.push({ operation, input, options: executionOptions }); }
  // Ports are fakes; production modules and the shared approval transport remain real.
  const source: PluginSourcePort = {
    create: async (input, opts) => { record('create', input, opts); return { created: true }; },
    open: async (input, opts) => { record('open', input, opts); return { created: true }; },
    list: async (input, opts) => { record('list', input, opts); return { files: [{ path: 'README.md', bytes: 4 }] }; },
    read: async (input, opts) => { record('read', input, opts); return { content: 'text', bytes: 4, digest }; },
    write: async (input, opts) => { record('write', input, opts); return { bytesWritten: input.content.length }; },
    edit: async (input, opts) => { record('edit', input, opts); return { bytesWritten: input.newString.length, replacements: 1 }; },
    delete: async (input, opts) => { record('delete', input, opts); if (opts?.expectedDigest !== digest) throw new PluginSourceError('PLUGIN_SOURCE_CHANGED', 'The draft file changed; nothing deleted.'); return { deleted: true }; },
    seal: async (input, opts) => { record('seal', input, opts); return { installed: true, plugin: preview, reloaded: false }; },
    rollback: async (input, opts) => { record('rollback', input, opts); return { installed: true, plugin: preview, reloaded: true, rollbackFrom: '0.0.9' }; },
    isSealedHere: async () => true,
    readApproval: async () => undefined,
    recordApproval: async () => {},
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registrations = buildPluginSourceRegistrations({ deps: { workspaceId: 'site', authorize: async () => ({ allowed: options.allowed !== false, reason: 'matched' }), ...(options.source === false ? {} : { pluginSource: source }) }, surfaces: { surfaceExchanges } });
  const tool = (name: string) => { const registration = registrations.find(tool => tool.descriptor.id === name); assert.ok(registration); return registration; };
  return { tool, calls, surfaceExchanges, change: () => { digest = 'changed'; } };
}

test('create/open/list/read/write/edit/seal/rollback run without confirmation and delegate two-object inputs', async () => {
  const f = fixture();
  const inputs = [
    ['create', { id: 'rules', name: 'Rules', description: 'Per-site content behavior' }],
    ['open', { id: 'rules' }], ['list', { id: 'rules' }], ['read', { id: 'rules', path: 'README.md' }],
    ['write', { id: 'rules', path: 'README.md', content: '' }],
    ['edit', { id: 'rules', path: 'README.md', oldString: 'text', newString: '', replaceAll: false }],
    ['seal', { id: 'rules' }], ['rollback', { id: 'rules' }],
  ] as const;
  for (const [operation, input] of inputs) {
    await f.tool('plugin_source_' + operation).handler(ctx(input), { emitSurface: async () => assert.fail('Reversible authoring must not ask') });
  }
  assert.deepEqual(f.calls, inputs.map(([operation, input]) => ({ operation, input, options: {} })));
});

test('source authoring is authorized before the port is accessed, and an unavailable owner is a plain input error', async () => {
  const denied = fixture({ allowed: false });
  await assert.rejects(denied.tool('plugin_source_seal').handler(ctx({ id: 'rules' }), {}), error => error instanceof ToolPermissionDeniedError && error.message === "principal 'owner' is not authorized for 'admin.plugins.enable' (matched)");
  assert.deepEqual(denied.calls, []);
  const missing = fixture({ source: false });
  await assert.rejects(missing.tool('plugin_source_create').handler(ctx({ id: 'rules', name: 'Rules', description: '' }), {}), error => error instanceof ToolInputError && /no plugin directory/.test(error.message));
});

test('validation refusals are returned plainly with their codes and descriptions', async () => {
  for (const error of [new PluginSourceError('PLUGIN_SOURCE_PATH_INVALID', 'Absolute paths are refused.'), new PluginInstallError('PLUGIN_MANIFEST_INVALID', 'server/index.mjs is required.')]) {
    const f = fixture({ error });
    await assert.rejects(f.tool('plugin_source_seal').handler(ctx({ id: 'rules' }), {}), thrown => thrown instanceof ToolInputError && thrown.message === `${error.code}: ${error.message}`);
  }
});

test('delete fails closed without a human channel', async () => {
  const f = fixture();
  await assert.rejects(f.tool('plugin_source_delete').handler(ctx({ id: 'rules', path: 'README.md' }), {}), error => error instanceof ToolInputError && /NO_CONFIRMATION_CHANNEL/.test(error.message));
  assert.equal(f.calls.some(call => call.operation === 'delete'), false);
});

test('permanent draft deletion uses the existing exchange and only deletes the approved bytes', async () => {
  for (const decision of ['confirm', 'cancel', 'changed'] as const) {
    const f = fixture();
    let raised!: (surface: unknown) => void;
    const dialog = new Promise<unknown>(resolve => { raised = resolve; });
    const emitSurface: SurfaceEmitter = async surface => { raised(surface); };
    const pending = f.tool('plugin_source_delete').handler(ctx({ id: 'rules', path: 'README.md' }), { emitSurface });
    const first = await Promise.race([dialog, pending.then(() => assert.fail('Delete must wait for a human'), error => { throw error; })]);
    const html = (first as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
    const planMatch = html.match(/var PLAN = (.*);/); assert.ok(planMatch);
    const plan = JSON.parse(planMatch[1]!) as Record<string, { toolName: string; params: Record<string, unknown> }>;
    const action = plan[decision === 'cancel' ? 'cancel' : 'confirm']; assert.ok(action);
    assert.equal(action.toolName, 'plugin_source_delete');
    if (decision === 'changed') f.change();
    const outcome = decision === 'changed' ? assert.rejects(pending, error => error instanceof ToolInputError && /changed/.test(error.message)) : pending;
    assert.equal(f.surfaceExchanges.deliver({ exchangeId: action.params[SURFACE_EXCHANGE_ID_PARAM] as string, params: action.params, principalId: 'owner' }, { toolId: action.toolName }).ok, true);
    const result = await outcome;
    if (decision === 'confirm') assert.deepEqual(result, { deleted: true });
    if (decision === 'cancel') { assert.equal((result as { deleted: boolean }).deleted, false); assert.equal(f.calls.some(call => call.operation === 'delete'), false); }
    if (decision !== 'cancel') assert.deepEqual(f.calls.at(-1), { operation: 'delete', input: { id: 'rules', path: 'README.md' }, options: { expectedDigest: 'original' } });
  }
});

test('tool schema, metadata, callback admission and batch mirrors cover the workflow', () => {
  assert.equal(pluginSourceAgentToolCatalog.length, 9);
  for (const tool of pluginSourceAgentToolCatalog) {
    assert.match(tool.description, /content filters/);
    assert.doesNotMatch(tool.description, /not mounted/);
    for (const term of ['sdk.routes.add', 'sdk.tools.add', 'sdk.widgets.add', 'http.route.register', 'tools.register', 'render.contribute', 'contributes.routes', 'contributes.tools', 'contributes.widgets', '/api/p/<plugin-id>']) assert.ok(tool.description.includes(term), `${tool.name}: ${term}`);
    assert.ok(tool.inputSchema);
    assert.equal((tool.inputSchema.required as string[]).includes('id'), true);
    const policy = toolMetadata[tool.name as keyof typeof toolMetadata].approval;
    assert.equal(policy.confirmation, tool.name === 'plugin_source_delete' ? 'plan' : 'direct');
  }
  const batchable = resolveBatchableTools({ registrations: pluginSourceAgentToolCatalog.map(tool => ({
    descriptor: { id: tool.name, description: tool.description, inputSchema: tool.inputSchema, readOnly: tool.sideEffects === 'none' },
    handler: async () => ({}), policy: { authorize: () => 'allow' as const } })) }).map(tool => tool.toolId);
  for (const name of ['plugin_source_read', 'plugin_source_write', 'plugin_source_edit']) assert.equal(batchable.includes(name), true);
  assert.equal(batchable.includes('plugin_source_delete'), false, 'a permanent delete never batches per item');
  assert.equal(isMcpUiToolCallPermitted('plugin_source_delete', true), true);
  assert.equal(isMcpUiToolCallPermitted('plugin_source_delete', false), false);
});

test('a non-string field is refused by name before the port is called', async () => {
  const f = fixture();
  await assert.rejects(f.tool('plugin_source_create').handler(ctx({ id: 'rules', name: 3, description: '' }), {}), error => error instanceof ToolInputError && error.message === 'name must be a string.');
  assert.deepEqual(f.calls, []);
});

test('a missing source owner is reported before field validation', async () => {
  const f = fixture({ source: false });
  await assert.rejects(f.tool('plugin_source_write').handler(ctx({ id: 'rules', path: 7 }), {}), error => error instanceof ToolInputError && error.message === 'Site plugin source authoring is unavailable: this site has no plugin directory.');
});

test('a non-boolean replaceAll is refused before the port is called', async () => {
  const f = fixture();
  await assert.rejects(f.tool('plugin_source_edit').handler(ctx({ id: 'rules', path: 'README.md', oldString: 'a', newString: 'b', replaceAll: 'yes' }), {}), error => error instanceof ToolInputError && error.message === 'replaceAll must be a boolean.');
  assert.deepEqual(f.calls, []);
});

test('an edit without replaceAll passes no replaceAll key to the port', async () => {
  const f = fixture();
  await f.tool('plugin_source_edit').handler(ctx({ id: 'rules', path: 'README.md', oldString: 'a', newString: 'b' }), {});
  assert.deepEqual(f.calls, [{ operation: 'edit', input: { id: 'rules', path: 'README.md', oldString: 'a', newString: 'b' }, options: {} }]);
});

test('an edit with replaceAll:true passes it through', async () => {
  const f = fixture();
  await f.tool('plugin_source_edit').handler(ctx({ id: 'rules', path: 'README.md', oldString: 'a', newString: 'b', replaceAll: true }), {});
  assert.deepEqual(f.calls, [{ operation: 'edit', input: { id: 'rules', path: 'README.md', oldString: 'a', newString: 'b', replaceAll: true }, options: {} }]);
});

test('a port failure that is not a source or install refusal propagates unchanged', async () => {
  const boom = new Error('disk unplugged');
  const f = fixture({ error: boom });
  await assert.rejects(f.tool('plugin_source_list').handler(ctx({ id: 'rules' }), {}), error => error === boom);
});

test('each tool asks for its catalog permission on a plugin entity', async () => {
  const asked: unknown[] = [];
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const registrations = buildPluginSourceRegistrations({ deps: { workspaceId: 'site', authorize: async (request) => { asked.push(request); return { allowed: false, reason: 'denied' }; } }, surfaces: { surfaceExchanges } });
  for (const name of ['plugin_source_read', 'plugin_source_write']) await assert.rejects(registrations.find(r => r.descriptor.id === name)!.handler(ctx({ id: 'rules' }), {}), ToolPermissionDeniedError);
  assert.deepEqual(asked, [
    { principalId: 'owner', permission: 'admin.plugins.read', workspaceId: 'site', entityType: 'plugin' },
    { principalId: 'owner', permission: 'admin.plugins.enable', workspaceId: 'site', entityType: 'plugin' },
  ]);
});

test('the contributor registers the plugin-source domain with its risk map', () => {
  const contributor = contributePluginSourceTools();
  assert.equal(contributor.domain, 'plugin-source');
  assert.equal(contributor.risk, pluginSourceDerivedRisk);
});

test('a missing field is refused by name', async () => {
  const f = fixture();
  await assert.rejects(f.tool('plugin_source_write').handler(ctx({ id: 'rules', path: 'README.md' }), {}), error => error instanceof ToolInputError && error.message === 'content must be a string.');
  assert.deepEqual(f.calls, []);
});

test('read passes the requested path to the port', async () => {
  const f = fixture();
  await f.tool('plugin_source_read').handler(ctx({ id: 'rules', path: 'server/index.mjs' }), {});
  assert.deepEqual(f.calls, [{ operation: 'read', input: { id: 'rules', path: 'server/index.mjs' }, options: {} }]);
});
