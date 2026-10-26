/** F9 (Stryker L15 sites-mcp-tools 81.8 %): the published tool contract pinned inline (AP5: schemas,
 * required, additionalProperties:false, readOnly annotations), the string-argument guard per hostile
 * value, the tracked-only reveal guard (AP7) and the list rendering. Fake ports; temp projects file. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeSitesMcpTools, runSitesMcpTool } from './sites-mcp-tools.ts';

const SITE_DIR_PROPERTY = { type: 'string', description: "Absolute path to the Tovu site's folder — the `siteDir` value returned by `list_sites`. A site folder is the one containing `config.json` and `.site-meta.json`." };

test('the published tool contract: names, input schemas and annotations exactly', () => {
  assert.deepEqual(describeSitesMcpTools().map(({ name, inputSchema, annotations }) => ({ name, inputSchema, annotations })), [
    { name: 'list_sites', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { title: 'List Tovu websites', readOnlyHint: true } },
    { name: 'add_site_pointer', inputSchema: { type: 'object', properties: { siteDir: { type: 'string', description: "Absolute path to the existing site's folder — the one containing `config.json` and `.site-meta.json`." } }, required: ['siteDir'], additionalProperties: false },
      annotations: { title: 'Add an existing Tovu website', readOnlyHint: false } },
    { name: 'reveal_site_folder', inputSchema: { type: 'object', properties: { siteDir: SITE_DIR_PROPERTY }, required: ['siteDir'], additionalProperties: false },
      annotations: { title: "Reveal a website's folder", readOnlyHint: false } },
  ]);
  for (const tool of describeSitesMcpTools()) assert.ok(typeof tool.description === 'string' && tool.description.length > 40, tool.name);
});

function context(t: { after: (fn: () => void) => void }, rows: { siteDir: string; createdAt: string; origin?: string }[], present = new Set<string>()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-mcp-tools-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const projectsPath = path.join(dir, 'projects.json');
  fs.writeFileSync(projectsPath, JSON.stringify({ projects: rows, dismissed: [] }));
  const revealed: string[] = [];
  return { revealed, ctx: { projectsPath, revealPath: async (target: string) => { revealed.push(target); }, classifySiteDir: (dir: string) => (present.has(dir) ? 'site' : 'empty') as never } };
}
const errorText = (result: Awaited<ReturnType<typeof runSitesMcpTool>>) => { assert.equal(result.isError, true); return result.content[0]?.text; };

test("reveal_site_folder: a missing, non-string or blank siteDir is a tool error naming the parameter; nothing is revealed", async t => {
  const { ctx, revealed } = context(t, [{ siteDir: '/sites/a', createdAt: 'c' }]);
  for (const args of [{}, { siteDir: 5 }, { siteDir: '' }, { siteDir: '   ' }, { siteDir: null }, null]) {
    const result = await runSitesMcpTool('reveal_site_folder', args as never, ctx);
    assert.equal(errorText(result), "'siteDir' is required and must be a non-empty string.", JSON.stringify(args));
    assert.deepEqual(result.structuredContent, { error: "'siteDir' is required and must be a non-empty string." });
  }
  assert.deepEqual(revealed, []);
});

test('reveal_site_folder opens only a TRACKED folder, compared after resolving the requested path', async t => {
  const { ctx, revealed } = context(t, [{ siteDir: '/sites/a', createdAt: 'c' }]);
  for (const siteDir of ['/sites/b', '/sites', '/sites/a/sub', 'sites/b']) {
    const text = errorText(await runSitesMcpTool('reveal_site_folder', { siteDir }, ctx));
    assert.match(text!, /is not one of this app's websites, so it will not be opened/);
  }
  assert.deepEqual(revealed, []);
  for (const siteDir of ['/sites/a', '/sites/x/../a', 'sites/a']) {
    const ok = await runSitesMcpTool('reveal_site_folder', { siteDir }, ctx);
    assert.equal(ok.isError, undefined);
    assert.deepEqual(ok.structuredContent, { siteDir: '/sites/a', revealed: true });
  }
  assert.deepEqual(revealed, ['/sites/a', '/sites/a', '/sites/a']);
});

test('list_sites: the empty sentence, and a missing folder is marked per row', async t => {
  const empty = context(t, []);
  const none = await runSitesMcpTool('list_sites', {}, empty.ctx);
  assert.deepEqual([none.content[0]?.text, none.structuredContent], ['This Tovu desktop app is not tracking any websites yet.', { sites: [], count: 0 }]);
  const two = context(t, [{ siteDir: '/sites/a', createdAt: 'c1', origin: 'created' }, { siteDir: '/sites/b', createdAt: 'c2' }], new Set(['/sites/a']));
  const listed = await runSitesMcpTool('list_sites', {}, two.ctx);
  assert.equal(listed.content[0]?.text, 'a — /sites/a\nb — /sites/b (folder missing)');
  assert.deepEqual(listed.structuredContent, { count: 2, sites: [
    { siteDir: '/sites/a', name: 'a', origin: 'created', addedAt: 'c1', present: true },
    { siteDir: '/sites/b', name: 'b', origin: 'adopted', addedAt: 'c2', present: false },
  ] });
});

test('an unknown tool lists the available ones; an internal fault names the tool', async t => {
  const { ctx } = context(t, []);
  assert.equal(errorText(await runSitesMcpTool('delete_site', {}, ctx)), "Unknown tool 'delete_site'. Available: list_sites, add_site_pointer, reveal_site_folder.");
  const tracked = context(t, [{ siteDir: '/sites/a', createdAt: 'c' }]);
  const failing = await runSitesMcpTool('reveal_site_folder', { siteDir: '/sites/a' }, { ...tracked.ctx, revealPath: async () => { throw new Error('shell unavailable'); } });
  assert.equal(errorText(failing), "The Tovu desktop app could not complete 'reveal_site_folder': shell unavailable");
});
