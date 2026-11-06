import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { RETIRED_READ_TOOL_TO_CARD } from '../../../../apps/website/src/assistant/content-read-tool.ts';
import { nativeToolMetadata } from '../../../../apps/website/src/contracts/core/tool-metadata/index.ts';

/**
 * @file Tovu's overlay for the portable `site-import` plugin (now `@jini-ai/agent-plugins/site-import`).
 * The plugin names jobs; this overlay names Tovu's tools for them, so the tool-name drift guard
 * that lived in `bundled-site-import-package.unit.test.ts` runs here, on the overlay text: a
 * renamed or removed tool would leave the guidance telling every agent to call something that does
 * not exist, and nothing else would notice (this is markdown, not code).
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const contentRoot = path.resolve(overlayRoot, '../../agent-plugins');

async function overlayTexts() {
  const texts = [{ name: 'GUIDANCE.md', text: await readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8') }];
  for (const name of (await readdir(path.join(overlayRoot, 'host'))).sort()) {
    texts.push({ name: `host/${name}`, text: await readFile(path.join(overlayRoot, 'host', name), 'utf8') });
  }
  return texts;
}

/** Snake_case identifiers (and `content_read.<resource>` cards) opening a backtick span, alone or
 *  as a `tool_name {` call, plus the same call shapes inside fenced examples. */
function citedToolIds(markdown) {
  const ids = new Set();
  const toolId = String.raw`[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\.[a-z0-9_]+)?`;
  for (const match of markdown.matchAll(new RegExp(String.raw`\`(${toolId})(?=\`| \{|\()`, 'g'))) ids.add(match[1]);
  for (const match of markdown.matchAll(new RegExp(String.raw`^\s*(${toolId}) \{`, 'gm'))) ids.add(match[1]);
  return ids;
}

test('supporting files follow the overlay naming rule the guidance reader enforces', async () => {
  const names = await readdir(path.join(overlayRoot, 'host'));
  assert.ok(names.length > 0);
  for (const name of names) assert.match(`host/${name}`, /^host\/[a-z0-9-]+\.md$/);
});

test('every tool the overlay cites is a served native tool or a per-plugin tool', async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const unknown = [];
  let cited = 0;
  for (const { name, text } of await overlayTexts()) {
    const ids = citedToolIds(text);
    cited += ids.size;
    for (const id of ids) {
      const replacement = RETIRED_READ_TOOL_TO_CARD.get(id);
      if (replacement) unknown.push(`${name}: ${id} (retired — use ${replacement})`);
      else if (!declared.has(id) && !/^agent_plugin_[a-z0-9_]+$/.test(id)) unknown.push(`${name}: ${id}`);
    }
  }
  assert.ok(cited >= 25, `expected the overlay to cite Tovu's tools by name, found ${cited}`);
  assert.deepEqual(unknown, [], 'the overlay tells agents to call tools that do not exist');
});

// Open bug (plan v2 §12): site-import read its references with `fs_read_file` root `repo`, which
// site agents are refused (site-file-request.ts:40). References ride the plugin payload now.
test('the overlay reads references through the plugin tool, never the refused repo root', async () => {
  for (const { name, text } of await overlayTexts()) {
    assert.doesNotMatch(text, /fs_read_file|root `repo`|content\/agent-plugins\//, name);
  }
  const guidance = (await overlayTexts())[0].text;
  assert.match(guidance, /`agent_plugin_site_import`[^]*?`file: "references\/<file>"`/);
  assert.match(guidance, /`file: "host\/content-mapping\.md"`/);
});

test('Tovu-only routing lives here: backups and share links go to site_import_backup', async () => {
  const guidance = (await overlayTexts())[0].text;
  assert.match(guidance, /`\.tovu\.zip`[^]*`\/_share\/…`[^]*`site_import_backup`/);
  assert.match(guidance, /Never crawl a ZIP or write its content\s+into the current site/);
});

test('the capability hand-off resolves to the Tovu plugins that provide it', async () => {
  const guidance = (await overlayTexts())[0].text;
  const theme = JSON.parse(await readFile(path.join(contentRoot, 'tovu-theme/plugin.json'), 'utf8'));
  assert.ok(theme.extensions.jini.provides.includes('theme-authoring'));
  assert.match(guidance, /provides\s+`theme-authoring` is Tovu Theme: call `agent_plugin_tovu_theme`/);
  assert.match(guidance, /provides `ui-design` is UI\/UX Design: call\s+`agent_plugin_ui_ux_design/);
});

test('the final / check names the published and live readers', async () => {
  const guidance = (await overlayTexts())[0].text;
  assert.match(guidance, /`fetch_published_page` for `\/` \(status 200\)/);
  assert.match(guidance, /`fetch_live_url` once published/);
});

test('the overlay is vendor-neutral: no model or vendor names', async () => {
  for (const { name, text } of await overlayTexts()) {
    assert.doesNotMatch(text, /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/, name);
  }
});
