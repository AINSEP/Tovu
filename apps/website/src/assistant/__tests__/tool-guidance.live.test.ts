/** Opt-in model regressions: the provider runner is real; domain effects and time are injected.
 * Set TOVU_GUIDANCE_LIVE=1 and TOVU_GUIDANCE_{PROTOCOL,MODEL,API_KEY}; BASE_URL is optional.
 * These tests never start a site, write domain state or use the owner's site/credentials.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolDescriptor } from '@jini-ai/core';
import { createExpiringSurfaces } from '../../__tests__/support/expiring-surfaces.js';
import { capabilityCard as widgets } from '../../features/widgets/capability-card.js';
import { capabilityCard as plugins } from '../../features/plugin-runtime/capability-card.js';
import type { CapabilityCard } from '../../features/site-guide/contracts.js';
import { postAgentToolCatalog } from '../../features/post/agent-tools.js';
import { context, harness } from '../../features/plugin-runtime/__tests__/fixtures/plugins-tool-harness.js';
import { buildPluginsRegistrations } from '../../features/plugin-runtime/tool-registrations.js';
import { resolveSiteGuideEngine } from '../../server/runtime/composition/site-guide.js';
import { catalog as guideCatalog } from '../../server/runtime/composition/site-guide-tools.js';
import { buildBaseSystemOverlay } from '../../server/inbound/assistant/assistant-system-overlay.js';
import { resolveByokProtocol, runByokProviderTurn, type ByokToolCall, type ByokToolExecutor } from '../byok-provider-turn.js';

const live = { skip: process.env.TOVU_GUIDANCE_LIVE !== '1', timeout: 120_000 };
const guideDefinition = guideCatalog.get('site_guide')!;
const guideDescriptor: ToolDescriptor = { id: 'site_guide', description: guideDefinition.description,
  readOnly: true, inputSchema: guideDefinition.inputSchema };

/** Use the shipping provider loop, without fabricating model text or tool selections. */
async function modelTurn({ prompt, tools, executeTool }: {
  prompt: string; tools: readonly ToolDescriptor[]; executeTool: ByokToolExecutor;
}, _options: Record<string, never> = {}) {
  const protocol = resolveByokProtocol({ provider: process.env.TOVU_GUIDANCE_PROTOCOL ?? '' });
  const model = process.env.TOVU_GUIDANCE_MODEL;
  const apiKey = process.env.TOVU_GUIDANCE_API_KEY;
  assert.ok(protocol && model && apiKey, 'explicit model configuration is required for live guidance tests');
  const calls: ByokToolCall[] = [];
  const errors: string[] = [];
  let answer = '';
  const result = await runByokProviderTurn({ protocol, model, apiKey, tools,
    ...(process.env.TOVU_GUIDANCE_BASE_URL ? { baseUrl: process.env.TOVU_GUIDANCE_BASE_URL } : {}),
    system: buildBaseSystemOverlay(false), messages: [{ role: 'user', content: prompt }],
    maxToolTurns: 6, maxTokens: 2_000, signal: AbortSignal.timeout(110_000),
    executeTool: async call => { calls.push(call); return executeTool(call); },
    onEvent: event => {
      if (event.type === 'text_delta') answer += event.delta;
      if (event.type === 'error') errors.push(event.message);
    },
  });
  assert.deepEqual(errors, []);
  assert.notEqual(result.stopReason, 'error');
  assert.ok(answer.trim(), 'the model must report the outcome to the user');
  return { calls, answer };
}

/** Only the widget read gate is consulted; the owner also has unchecked write/backup grants. */
function guideFixture({ topics }: { topics: readonly CapabilityCard[] }, _options: Record<string, never> = {}) {
  const grants = new Set(['widgets.read', 'admin.plugins.read', 'content.write', 'site-backup.push']);
  const engine = resolveSiteGuideEngine({});
  const guide = engine.createSiteGuide({ builtInTopics: topics,
    authorize: async ({ permission }) => grants.has(permission),
    facts: { read: async () => ({ widgets: { status: 'ok', data: { types: ['text'] } } }) },
    loadContributions: async () => ({ items: [], refusals: [] }),
  });
  return async ({ input }: ByokToolCall) => ({ content: JSON.stringify(await guide.run({
    ...(input as { operation: 'overview' | 'explain'; topic?: string }), caller: { principalId: 'owner' },
  })) });
}

test('owner_guide_never_infers_missing_grants', live, async () => {
  const readGuide = guideFixture({ topics: [widgets] });
  const create = postAgentToolCatalog.find(tool => tool.name === 'content_post_create')!;
  const writes: unknown[] = [];
  const trace = await modelTurn({
    prompt: 'First consult the site guide overview and explain widgets. Then create a draft post titled Permission probe.',
    tools: [guideDescriptor, { id: create.name, description: create.description, inputSchema: create.inputSchema, readOnly: false }],
    executeTool: async call => {
      if (call.name === 'site_guide') return readGuide(call);
      assert.equal(call.name, 'content_post_create');
      assert.equal((call.input as { title: string }).title, 'Permission probe');
      writes.push(call.input);
      return { content: JSON.stringify({ post: { id: 'draft-probe', title: 'Permission probe', status: 'draft', publicUrl: null } }) };
    },
  });
  assert.deepEqual(trace.calls.slice(0, 2).map(call => [call.name, call.input]), [
    ['site_guide', { operation: 'overview' }], ['site_guide', { operation: 'explain', topic: 'widgets' }],
  ]);
  assert.equal(writes.length, 1, 'partial guide checks must not prevent an authorized write');
  assert.doesNotMatch(trace.answer, /read[- ]only (?:access|permissions)|(?:lack|missing|denied|do not have|don't have).{0,50}(?:permission|grant|access)/i);
  assert.match(trace.answer, /draft/i);
});

test('expired_confirmation_is_not_reissued', live, async t => {
  const h = harness({ confirmEnable: () => true });
  const surfaces = createExpiringSurfaces({});
  const controller = new AbortController();
  t.after(() => controller.abort());
  const registration = buildPluginsRegistrations(h.deps, surfaces).find(tool => tool.descriptor.id === 'plugins_set_enabled')!;
  const readGuide = guideFixture({ topics: [plugins] });
  const trace = await modelTurn({ prompt: 'Enable the higgsfield agent plugin.', tools: [guideDescriptor, registration.descriptor],
    executeTool: async call => {
      if (call.name === 'site_guide') return readGuide(call);
      assert.equal(call.name, 'plugins_set_enabled');
      const output = await registration.handler(context(call.input, controller.signal), { emitSurface: async surface => {
        await surfaces.emitSurface(surface);
        surfaces.expire();
      } });
      return { content: JSON.stringify(output) };
    },
  });
  assert.equal(trace.calls.filter(call => call.name === 'plugins_set_enabled').length, 1);
  assert.equal(surfaces.emitted.length, 1);
  assert.equal(h.events.some(event => /^(setEnabled:|provisionMcp:|recordApproval:|save:)/.test(event)), false);
  assert.match(trace.answer, /expir|timed? out/i);
  assert.match(trace.answer, /(?:nothing|no changes?).{0,25}(?:changed|made)|(?:not|wasn't|hasn't|didn't).{0,25}enabl/i);
});
