/** 2026-11-13, tovu-dev public chat (Gemini 3.8 Flash): "go to the contact page" → "I am unable to
 * navigate". search_published_entries gives the model slugs, but visitor page.navigate (since
 * dfea76018) only resolved post ids, so the slug it passed was refused. Before that commit the
 * visitor navigate tool took a slug. These tests pin the restored slug path end to end through the
 * registry, and keep the server-side guarantee: a slug resolves only against PUBLISHED targets. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_CAPABILITIES } from '@jini-ai/agentic';
import type { ToolRegistration } from '@jini-ai/core';
import { listPublishedPosts } from '#src/features/post/index';
import { publishVisitorPage, readVisitorPagePublication } from '#src/features/theme/visitor-publication';
import { anonymousMemberAccess } from './member-access.fixture.js';
import { createSiteCapabilityRegistry } from '../capability-registry.js';
import { resolveVisitorPageTarget } from '../visitor-page-tools.js';
import { parseVisitorToolPolicy } from '../../../contracts/site-assistant/visitor-tools.js';
import type { VisitorExecutionPorts } from '../visitor-executor.js';

function fixture() {
  const rows = [
    { id: 'p-contact', slug: 'contact', status: 'published', kind: 'page', deletedAt: null },
    { id: 'p-draft', slug: 'draft-page', status: 'draft', kind: 'page', deletedAt: null },
    { id: 'p-trash', slug: 'old', status: 'published', kind: 'page', deletedAt: '2026-11-01' },
  ].map(row => ({ ...row, workspaceId: 'w', title: row.slug, bodyJson: {}, updatedAt: '2026-11-13', version: 1 }));
  const deps = { workspaceId: 'w', postRepo: { list: async () => rows } as never, listPublishedPosts, memberAccess: anonymousMemberAccess() };
  return { deps };
}

test('a slug from search_published_entries resolves to that published page; unpublished or unknown slugs are refused', async () => {
  const { deps } = fixture();
  assert.equal((await resolveVisitorPageTarget({ deps, input: { slug: 'contact' } })).path, '/contact');
  // Static-theme standalone pages share the slug → path shape; they come through the server list.
  const pages = [{ id: 'theme:pricing', label: 'pricing', path: '/pricing' }];
  assert.equal((await resolveVisitorPageTarget({ deps, input: { slug: 'pricing' } }, { pages })).id, 'theme:pricing');
  for (const input of [{ slug: 'draft-page' }, { slug: 'old' }, { slug: 'nope' }, { slug: '/admin' }, { slug: '../admin' },
    { slug: 'contact', query: { redirect: '/admin' } }]) {
    await assert.rejects(resolveVisitorPageTarget({ deps, input }), `must refuse ${JSON.stringify(input)}`);
  }
});

function registryWithPage() {
  const { deps } = fixture();
  const html = publishVisitorPage({ html: '<html><body><div id="tovu-site-assistant-root"></div></body></html>', path: '/contact', workspaceId: 'w' });
  const revision = /data-agent-publication="([^"]+)"/.exec(html)![1]!;
  const publication = readVisitorPagePublication({ revision, workspaceId: 'w' })!;
  const wires: Record<string, unknown>[] = [];
  const registrations = PAGE_CAPABILITIES.map(capability => ({ descriptor: { id: capability.id, readOnly: false },
    handler: async ({ input }: { input: unknown }) => { wires.push(input as Record<string, unknown>); return { ok: true }; } })) as unknown as ToolRegistration[];
  const policy = parseVisitorToolPolicy({ value: { version: 1, tools: { navigate_to_entry: { mode: 'auto' } } } });
  const ports: VisitorExecutionPorts = { initialPolicy: policy, readPolicy: async () => policy, budgets: { charge: async () => true },
    ip: 'ip', workspaceId: 'w', runId: 'turn', clock: { nowMs: () => 0, nowIso: () => '1970-01-01T00:00:00.000Z' },
    ids: { newId: () => 'id' }, sink: { append: async () => {} }, reportError: () => {} };
  const registry = createSiteCapabilityRegistry(deps, { visitorExecution: ports, page: { publication, registrations } });
  return { registry, wires };
}

test('the visitor navigate tool is offered by slug, in visitor wording, and navigates the tab to the published page', async () => {
  const { registry, wires } = registryWithPage();
  const schema = registry.schemas.find(entry => entry.name === 'page.navigate');
  assert.ok(schema, 'page.navigate must be offered when navigate_to_entry is Auto');
  assert.ok((schema.parameters as { properties: Record<string, unknown> }).properties.slug, 'the visitor navigate schema must take a slug');
  // Admin wording points at page.find_elements (Off for visitors), plugins and skills.
  assert.doesNotMatch(schema.description, /find_elements|plugin|skill|data-agent-page/i);
  const outcome = await registry.invoke({ name: 'page.navigate', input: { slug: 'contact' }, caller: 'anonymous-visitor' });
  assert.equal(outcome.kind, 'ok', JSON.stringify(outcome));
  const wire = wires.at(-1)!;
  assert.equal(wire.page, 'p-contact');
  assert.equal((wire.__visitorPage as { path: string }).path, '/contact');
  assert.equal(Object.hasOwn(wire, 'slug'), false, 'the browser handler gets the resolved id, never the model slug');
  for (const slug of ['draft-page', 'nope', '/admin']) {
    const refused = await registry.invoke({ name: 'page.navigate', input: { slug }, caller: 'anonymous-visitor' });
    assert.notEqual(refused.kind, 'ok', `slug ${slug} must not navigate`);
  }
});
