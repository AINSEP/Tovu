import test from 'node:test';
import { agentHandleSegment } from '@jini-ai/agentic';
import assert from 'node:assert/strict';
import { parseVisitorToolPolicy, resolveVisitorToolChoice, visitorToolBudgetId } from '#src/contracts/site-assistant/visitor-tools';
import { publishVisitorPage, readVisitorPagePublication } from '#src/features/theme/visitor-publication';

test('page grants migrate Off/Ask and limits; quotas keep their original identity', () => {
  for (const mode of ['off', 'ask', 'auto'] as const) {
    const policy = parseVisitorToolPolicy({ value: { version: 1, tools: { navigate_to_entry: { mode, limits: { perIpPerHour: 2, perSitePerDay: 3 } } } } });
    assert.deepEqual(resolveVisitorToolChoice({ policy, toolId: 'page.navigate' }), { mode, limits: { perIpPerHour: 2, perSitePerDay: 3 } });
    assert.equal(visitorToolBudgetId({ toolId: 'page.navigate' }), 'navigate_to_entry');
  }
  const policy = parseVisitorToolPolicy({ value: { version: 1, tools: { 'page.fill': { mode: 'ask' } } } });
  assert.equal(resolveVisitorToolChoice({ policy, toolId: 'page.fill' }).mode, 'ask');
  assert.equal(resolveVisitorToolChoice({ policy, toolId: 'page.click' }).mode, 'off');
});
test('only server-reviewed annotations publish handles; collisions and private nodes grant nothing', () => {
  const html = publishVisitorPage({ html: '<html><body><main data-visitor-scope><button type="button" data-toolname="menu_open" data-tooldescription="Open" data-tool-action="menu">Open</button><p data-toolname="dup" data-tooldescription="One" data-tool-action="read">One</p><p data-toolname="dup" data-tooldescription="Two" data-tool-action="read">Two</p><aside data-agent-private><button data-toolname="private" data-tooldescription="Private" data-tool-action="menu">Secret</button></aside><button data-agent-element="admin-save">Save</button></main><div id="tovu-site-assistant-root"></div></body></html>' });
  const json = html.match(/<script type="application\/json" id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!;
  const manifest = JSON.parse(json);
  assert.deepEqual(manifest.elements.map((element: { handle: string }) => element.handle), [`visitor-${agentHandleSegment({ value: 'menu_open' })}`]);
  assert.ok(readVisitorPagePublication({ revision: manifest.revision }));
  assert.equal(readVisitorPagePublication({ revision: 'forged' }), null);
});
test('mixed-version migration retains the stricter mode and both smaller allowances', () => {
  const policy = parseVisitorToolPolicy({ value: { version: 1, tools: {
    navigate_to_entry: { mode: 'off', limits: { perIpPerHour: 2, perSitePerDay: 50 } },
    'page.navigate': { mode: 'auto', limits: { perIpPerHour: 30, perSitePerDay: 10 } },
  } } });
  assert.deepEqual(policy.tools['page.navigate'], { mode: 'off', limits: { perIpPerHour: 2, perSitePerDay: 10 } });
  assert.equal(Object.hasOwn(policy.tools, 'navigate_to_entry'), false);
});
test('a publication from another workspace cannot grant this site handles', () => {
  const html = publishVisitorPage({ workspaceId: 'site-a', html: '<html><body><div id="tovu-site-assistant-root"></div></body></html>' });
  const revision = JSON.parse(html.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!).revision;
  assert.ok(readVisitorPagePublication({ revision, workspaceId: 'site-a' }));
  assert.equal(readVisitorPagePublication({ revision, workspaceId: 'site-b' }), null);
  assert.ok(readVisitorPagePublication({ revision, workspaceId: 'site-a' }));
});

test('concurrent documents at the same path retain independent publications inside the document body', () => {
  const first = publishVisitorPage({ workspaceId: 'concurrent', path: '/about', html: '<html><body><main data-visitor-scope data-toolname="content" data-tooldescription="Content" data-tool-action="read">Public</main><div id="tovu-site-assistant-root"></div></body></html>' });
  const second = publishVisitorPage({ workspaceId: 'concurrent', path: '/about', html: '<html><body><div id="tovu-site-assistant-root"></div></body></html>' });
  const revisionOf = (html: string) => JSON.parse(html.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!).revision;
  assert.notEqual(revisionOf(first), revisionOf(second));
  assert.equal(readVisitorPagePublication({ revision: revisionOf(first), workspaceId: 'concurrent' })?.elements.length, 1);
  assert.equal(readVisitorPagePublication({ revision: revisionOf(second), workspaceId: 'concurrent' })?.elements.length, 0);
  assert.match(first, /<\/script><\/body><\/html>$/);
});

test('derived mobile handles cannot collide with authored handles', () => {
  const html = publishVisitorPage({ html: '<html><body><nav class="main-nav" data-visitor-scope><a href="/public" data-toolname="docs" data-tooldescription="Docs" data-tool-action="navigate">Docs</a><a href="/public" data-toolname="docs-mobile" data-tooldescription="Other" data-tool-action="navigate">Other</a></nav><div id="tovu-site-assistant-root"></div></body></html>' });
  const manifest = JSON.parse(html.match(/id="tovu-visitor-publication">(.*?)<\/script>/s)![1]!);
  assert.equal(manifest.elements.some((entry: { handle: string }) => entry.handle === 'visitor-docs-mobile'), false);
  const handles = manifest.elements.map((entry: { handle: string }) => entry.handle);
  assert.equal(new Set(handles).size, handles.length);
});
