/** s5: exact argument shapes from owner chats, through the shared normalization boundary. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeToolInput, type ToolRegistration } from '@jini-ai/core';
import { getThemesAgentToolCatalog } from '../../features/theme/agent-tools.js';
import { mediaImportAgentToolCatalog } from '../../features/media-import/agent-tools.js';
import { mediaAgentToolCatalog } from '../../features/media/index.js';
import { postPreviewAgentToolCatalog } from '../../features/post/preview-tool.js';
import { buildSiteInspectionRegistrations, type SiteInspectionToolDeps } from '../../features/site-inspection/tool-registrations.js';
import { buildSiteGuideRegistrations } from '../../server/runtime/composition/site-guide-tools.js';
import type { TovuSiteGuideDeps } from '../../server/runtime/composition/site-guide.js';
import { SITE_GUIDE_POINTER } from '../site-guide-pointer.js';
import { deriveContentReadRegistrations } from '../content-read-tool.js';
import { executeRegisteredTool } from './fixtures/execute-registered-tool.js';

const definitions = [...getThemesAgentToolCatalog(), ...mediaImportAgentToolCatalog, ...mediaAgentToolCatalog, ...postPreviewAgentToolCatalog];
function registration({ id }: { id: string }, _options = {}) {
  const tool = definitions.find(tool => tool.name === id);
  assert.ok(tool);
  return { descriptor: { id, inputSchema: tool.inputSchema } };
}

test('Claude Edit spellings preserve exact replacement bytes and empty deletions', async () => {
  const result = await normalizeToolInput({ registration: registration({ id: 'theme_edit_file' }),
    input: { themeId: 'plain', path: 'styles.css', old_string: 'body { color: red; }', new_string: '' } });
  assert.deepEqual(result.input, { themeId: 'plain', path: 'styles.css', oldString: 'body { color: red; }', newString: '' });
});

test('media query remains the declared search filter rather than being dropped', async () => {
  const source: ToolRegistration = { ...registration({ id: 'media_list_assets' }), policy: { authorize: () => 'allow' }, handler: async ctx => ({ media: [], received: ctx.input }) };
  const card = deriveContentReadRegistrations([source]).find(tool => tool.descriptor.id === 'content_read.media_asset');
  assert.ok(card);
  const result = await executeRegisteredTool({ registration: card, input: { query: 'hero' } });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { media: [], received: { query: 'hero' } });
});

test('URL import title uses its declared filename field', async () => {
  assert.deepEqual((await normalizeToolInput({ registration: registration({ id: 'media_import_from_url' }),
    input: { url: 'https://example.com/hero.png', title: 'Hero image' } })).input,
  { url: 'https://example.com/hero.png', filename: 'Hero image' });
});

test('preview accepts agreeing find and kind while rejecting disagreements', async () => {
  const tool = registration({ id: 'content_post_preview' });
  assert.deepEqual((await normalizeToolInput({ registration: tool, input: { id: 'home', find: 'page', kind: 'page' } })).input, { id: 'home', find: 'page' });
  await assert.rejects(normalizeToolInput({ registration: tool, input: { id: 'home', find: 'page', kind: 'post' } }), /Conflicting inputs/);
});

test('published page context rejection tells the model exactly which supported selectors to use', async () => {
  const tool = buildSiteInspectionRegistrations({} as SiteInspectionToolDeps).find(tool => tool.descriptor.id === 'fetch_published_page')!;
  await assert.rejects(normalizeToolInput({ registration: tool, input: { path: '/', context: 3 } }), /context.*not supported.*find.*maxBytes/);
});

test('several guide topics get an actionable one-call-per-topic correction', async () => {
  const tool: ToolRegistration = buildSiteGuideRegistrations({ deps: {} as TovuSiteGuideDeps })[0]!;
  await assert.rejects(normalizeToolInput({ registration: tool, input: { operation: 'explain', topic: ['theme', 'media'] } }),
    /site_guide.*one topic.*separate.*operation.*explain.*topic/);
});

test('a one-element guide topic array keeps the existing scalar service contract', async () => {
  const tool = buildSiteGuideRegistrations({ deps: {} as TovuSiteGuideDeps })[0]!;
  assert.deepEqual((await normalizeToolInput({ registration: tool, input: { operation: 'explain', topic: ['theme'] } })).input,
    { operation: 'explain', topic: 'theme' });
});

test('the shared system pointer names tool alternatives to shell for routine site work', () => {
  for (const name of ['fs_list_files', 'theme_list_files', 'theme_read_file', 'media_import_local_file', 'media_import_from_url']) assert.ok(SITE_GUIDE_POINTER.includes(name), name);
  assert.match(SITE_GUIDE_POINTER, /Full CLI/);
  assert.match(SITE_GUIDE_POINTER, /shell|Bash/);
});
