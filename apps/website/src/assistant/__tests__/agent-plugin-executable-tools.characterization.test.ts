/**
 * @file Characterization pins for executable Agent Plugin tools wired into the
 * approval owner (feature lot G7), updated for the approved r9/r9b structured input layout:
 * the confirmation card's exact input rows, the existing extension approval families, and
 * the MCP-UI callback refusing a fresh execution of a plugin tool id.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type ToolRegistration } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { applyToolApprovalPolicy } from '../tool-approval-policy.js';
import { isMcpUiToolCallPermitted } from '../mcp-ui-tool-calls.js';
import { EXTENSION_TOOL_APPROVAL_POLICY } from '../../contracts/headless/index.js';
import { withExtensionApprovalPolicy } from '../assistant-tool-approval-policy.js';

const surfaces = () => ({ surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) });
const registrationFor = (id: string): ToolRegistration => ({ descriptor: { id, description: id, inputSchema: { type: 'object' } }, policy: { authorize: () => 'allow' }, handler: async () => ({ ok: true }) });

test('a policy confirmation card shows exactly the structured ID row (r9/r9b)', async () => {
  const bound = surfaces();
  const registry = createToolRegistry({});
  registry.register(applyToolApprovalPolicy({ registration: registrationFor('publish_content_publish'), surfaces: bound }));
  let html = '';
  const pending = createToolExecutor({ registry }).execute({ toolId: 'publish_content_publish', principal: { id: 'owner' }, run: { id: 'run' }, input: { id: 'post-1' } }, {
    emitSurface: async (emission) => { html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text; },
  });
  while (html === '') await new Promise((resolve) => setImmediate(resolve));
  const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]!;
  bound.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'publish_content_publish' });
  await pending;
  const labels = [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['ID']);
  const rows = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(rows, [['ID', 'post-1']]);
});

test('existing extension approval families keep their classes (pinned before G7)', () => {
  assert.deepEqual(EXTENSION_TOOL_APPROVAL_POLICY['installed-guidance'], { class: 'read', confirmation: 'direct' });
  assert.deepEqual(EXTENSION_TOOL_APPROVAL_POLICY['plugin-capability-result'], { class: 'read', confirmation: 'direct' });
  assert.deepEqual(EXTENSION_TOOL_APPROVAL_POLICY['plugin-memory-read'], { class: 'read', confirmation: 'direct' });
  assert.deepEqual(EXTENSION_TOOL_APPROVAL_POLICY['plugin-memory-write'], { class: 'edit', confirmation: 'direct' });
  assert.throws(() => withExtensionApprovalPolicy({ registration: registrationFor('x'), family: 'not-a-family' as 'installed-guidance' }), { message: 'x has no approval classification' });
});

test('the MCP-UI callback never starts a fresh execution of a plugin tool (pinned before G7)', () => {
  assert.equal(isMcpUiToolCallPermitted('p_acme_office__append_rows', false), false);
});
