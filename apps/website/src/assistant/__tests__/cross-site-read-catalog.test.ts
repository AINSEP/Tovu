import '../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isReadOnlyTool, type ToolRegistration } from '@jini-ai/core';
import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { RETIRED_READ_TOOL_TO_CARD, deriveContentReadRegistrations } from '../content-read-tool.js';
import { demoChoicesDerivedRisk } from '../demo-choices-tool.js';
import { demoA2uiDerivedRisk } from '../demo-a2ui-tool.js';
import { demoImageDerivedRisk } from '../demo-image-tool.js';
import { renderUiDerivedRisk } from '../render-ui-tool.js';
import { componentCatalogDerivedRisk } from '../component-catalog-tool.js';
import { askChoiceDerivedRisk } from '../ask-choice-tool.js';
import { externalMcpReauthDerivedRisk } from '../external-mcp-reauth-tool.js';
import { adminScreenLinkDerivedRisk } from '../admin-screen-link-tool.js';
import { toolGapsDerivedRisk } from '../tool-gaps-tool.js';
import { CROSS_SITE_READ_DOMAINS, CROSS_SITE_EXCLUDED, CROSS_SITE_EXCLUDED_TOOLS, CrossSiteUnavailable } from '#src/server/runtime/composition/peer-site-reads';
import { peerFixture } from '#src/server/runtime/composition/__tests__/peer-site-reads.fixture';
import { sitesReadAgentToolCatalog } from '#src/features/sites/agent-tools';

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; enum?: unknown[]; const?: unknown;
  minimum?: number; minLength?: number; minItems?: number; items?: Schema; format?: string; anyOf?: Schema[]; oneOf?: Schema[] };
const properties = (tool: ToolRegistration) => (tool.descriptor.inputSchema as Schema)?.properties ?? {};

/** Required fields only, using each schema's vocabulary; explicit inputs below cover runtime XOR selectors. */
function minimal(schema: Schema): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  const branch = schema.oneOf?.[0] ?? schema.anyOf?.[0];
  if (branch) return minimal(branch);
  if (schema.type === 'object' || schema.properties) return Object.fromEntries((schema.required ?? []).map(key => [key, minimal(schema.properties?.[key] ?? { type: 'string' })]));
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, () => minimal(schema.items ?? { type: 'string' }));
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return false;
  if (schema.format === 'date-time') return '2026-10-16T00:00:00.000Z';
  return 'fixture'.padEnd(schema.minLength ?? 1, 'x');
}

test('complete production catalog classifies every reader and exercises every scoped read on B', async t => {
  const f = await peerFixture(t);
  const byTool = new Map<string, string>();
  const assistantDomains = [
    ['demo-choices', demoChoicesDerivedRisk], ['demo-a2ui', demoA2uiDerivedRisk], ['demo-image', demoImageDerivedRisk],
    ['render-ui', renderUiDerivedRisk], ['component-catalog', componentCatalogDerivedRisk], ['ask-choice', askChoiceDerivedRisk],
    ['external-mcp-reauth', externalMcpReauthDerivedRisk], ['admin-screen-link', adminScreenLinkDerivedRisk],
    ['tool-gaps', toolGapsDerivedRisk],
  ] as const;
  for (const [domain, risk] of assistantDomains) for (const id of risk.keys()) byTool.set(id, domain);
  for (const slice of [...f.contributions.contributors.list({}), ...f.contributions.derivedContributors.list({})]) {
    for (const id of slice.risk.keys()) byTool.set(id, slice.domain);
  }
  const raw = buildAssistantToolRegistrations(f.deps, undefined, { contributions: f.contributions, targetScope: 'off', includeContentReadCollapse: false });
  const scoped = f.build(), scopedById = new Map(scoped.map(tool => [tool.descriptor.id, tool]));
  const reads = raw.filter(tool => isReadOnlyTool({ descriptor: tool.descriptor }));
  const toolExcluded = (tool: ToolRegistration) => Object.hasOwn(CROSS_SITE_EXCLUDED_TOOLS, tool.descriptor.id);
  const crossSite = reads.filter(tool => CROSS_SITE_READ_DOMAINS.has(byTool.get(tool.descriptor.id) ?? '') && !toolExcluded(tool));
  const excluded = reads.filter(tool => Object.hasOwn(CROSS_SITE_EXCLUDED, byTool.get(tool.descriptor.id) ?? '') || toolExcluded(tool));
  const counts = `${crossSite.length} cross-site tools, ${excluded.length} EXCLUDED tools`;
  t.diagnostic(counts);
  const unclassified = reads.filter(tool => {
    const domain = byTool.get(tool.descriptor.id) ?? '<unknown>';
    return Number(CROSS_SITE_READ_DOMAINS.has(domain)) + Number(Object.hasOwn(CROSS_SITE_EXCLUDED, domain)) !== 1;
  }).map(tool => `${byTool.get(tool.descriptor.id) ?? '<unknown>'}: ${tool.descriptor.id}`);
  assert.deepEqual(unclassified, [], `${counts}; unclassified/overlapping domains: ${unclassified.join(', ')}`);
  assert.ok(crossSite.length > 0 && excluded.length > 0, counts);
  for (const domain of CROSS_SITE_READ_DOMAINS) assert.ok(!Object.hasOwn(CROSS_SITE_EXCLUDED, domain), `${counts}; overlapping ${domain}`);
  // A per-tool exclusion carves one read out of an otherwise cross-site domain; anywhere else it is dead config.
  for (const id of Object.keys(CROSS_SITE_EXCLUDED_TOOLS)) {
    const tool = reads.find(read => read.descriptor.id === id);
    assert.ok(tool && CROSS_SITE_READ_DOMAINS.has(byTool.get(id) ?? ''), `${counts}; ${id} must be a read in a cross-site domain`);
    await assert.rejects(f.call(id, { site: 'B' }), { message: `${id} can't read another site yet.` });
  }

  const inputs: Record<string, Record<string, unknown>> = {
    content_post_list: { kind: 'post' }, content_post_get: { kind: 'post', id: 'post' }, content_post_search: { kind: 'post', query: 'B' },
    content_stats: { includeWordCounts: false }, media_view_image: { mediaId: 'media' },
    forms_list_submissions: { formId: 'form' }, forms_get_submission: { formId: 'form', submissionId: 'missing' },
    assistant_chats_list: {}, assistant_chat_read: { chatId: 'owner-chat' },
    pages_read_html: { id: 'page' }, workspace_get: { workspaceId: f.b.workspaceId },
  };
  const poison: string[] = [];
  for (const tool of crossSite) {
    const id = tool.descriptor.id, registration = scopedById.get(id)!;
    assert.ok(properties(registration).site, `${counts}; ${id} must advertise site`);
    assert.ok(!((registration.descriptor.inputSchema as Schema).required ?? []).includes('site'), `${counts}; ${id} site is optional`);
    const input = inputs[id] ?? minimal(tool.descriptor.inputSchema as Schema) as Record<string, unknown>;
    const auditBefore = f.audits.length;
    try { await f.call(id, { ...input, site: 'B' }); }
    catch (error) {
      if (error instanceof CrossSiteUnavailable || (error instanceof Error && (error.name === 'CrossSiteUnavailable' || error.message.includes("which isn't available for another site")))) {
        poison.push(`${byTool.get(id)} / ${id}: ${(error as Error).message}`);
      }
      // Missing records and domain validation errors are allowed: only missing peer ports fail this gate.
    }
    assert.equal(f.audits.length, auditBefore + 1, `${counts}; ${id} reached the resolved peer rather than silently staying on A`);
  }
  assert.deepEqual(poison, [], `${counts}; unavailable peer dependencies: ${poison.join('\n')}`);
  for (const tool of raw) {
    if (crossSite.includes(tool)) continue;
    const registration = scopedById.get(tool.descriptor.id)!;
    // Guarded tools must declare site too: normalization must retain the target for refusal.
    assert.ok(properties(registration).site, `${counts}; excluded/write ${tool.descriptor.id} advertises its target guard`);
    assert.ok(!((registration.descriptor.inputSchema as Schema).required ?? []).includes('site'), `${tool.descriptor.id} site is optional`);
    if (!Object.hasOwn(properties(tool), 'site')) {
      await assert.rejects(f.call(tool.descriptor.id, { site: 'B' }), {
        message: isReadOnlyTool({ descriptor: tool.descriptor }) ? `${tool.descriptor.id} can't read another site yet.`
          : 'Writes run only on the active site. Switch with sites_switch_site first.',
      });
    }
  }

  const collapsed = f.build(true), collapsedById = new Map(collapsed.map(tool => [tool.descriptor.id, tool]));
  for (const cardId of new Set(RETIRED_READ_TOOL_TO_CARD.values())) {
    const members = [...RETIRED_READ_TOOL_TO_CARD].filter(([, id]) => id === cardId).map(([member]) => member);
    const result = collapsedById.get(cardId);
    if (!result) continue;
    assert.equal(Object.hasOwn(properties(result), 'site'), members.every(id => Object.hasOwn(properties(scopedById.get(id)!), 'site')),
      `${counts}; ${result.descriptor.id} scopes only when all members do`);
  }
});

test('mixed-scope card does not advertise a site supported by only one dispatch branch', () => {
  const registration = (id: string, site: boolean): ToolRegistration => ({
    descriptor: { id, readOnly: true, inputSchema: { type: 'object', properties: site ? { site: { type: 'string' } } : {} } },
    policy: { authorize: () => 'allow' }, handler: async () => ({}),
  });
  const card = deriveContentReadRegistrations([registration('redirects_get', true), registration('redirects_list', false)]).find(tool => tool.descriptor.id === 'content_read.redirect');
  assert.ok(card); assert.equal(Object.hasOwn(properties(card), 'site'), false);
});

test('reviewed baseline pins registry guidance and scoped schema; hermetic roots have no generic site input', async t => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/tool-metadata.baseline.json', import.meta.url), 'utf8')).crossSiteReads;
  assert.equal(sitesReadAgentToolCatalog.find(tool => tool.name === 'sites_list')!.description, baseline.sitesListDescription);
  const f = await peerFixture(t);
  const scoped = f.build().find(tool => tool.descriptor.id === 'content_post_list')!;
  assert.deepEqual(properties(scoped).site, baseline.siteInput);
  const hermetic = buildAssistantToolRegistrations({ ...f.deps, peerSiteReads: undefined }, undefined, { contributions: f.contributions, includeContentReadCollapse: false });
  const originalById = new Map(buildAssistantToolRegistrations(f.deps, undefined, { contributions: f.contributions, targetScope: 'off', includeContentReadCollapse: false }).map(tool => [tool.descriptor.id, tool]));
  for (const tool of hermetic) {
    const original = originalById.get(tool.descriptor.id)!;
    assert.deepEqual(tool.descriptor.inputSchema, original.descriptor.inputSchema, tool.descriptor.id);
  }
});
