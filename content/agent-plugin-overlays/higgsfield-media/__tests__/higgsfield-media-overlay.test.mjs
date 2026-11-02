import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { nativeToolMetadata } from '../../../../apps/website/src/contracts/core/tool-metadata/index.ts';

/**
 * @file Tovu's overlay for the portable `higgsfield-media` plugin (now
 * `@jini-ai/plugin-higgsfield-media`). The plugin says what to do; this overlay holds the Tovu
 * screens, refusal strings, limits and restart rule (plan v2 §5.1). Run-start injection prepends
 * GUIDANCE.md, so the claims the injection test requires must live in GUIDANCE.md itself, not in a
 * `host/` file the agent has to ask for.
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const readGuidance = () => readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8');

async function overlayTexts() {
  const texts = [{ name: 'GUIDANCE.md', text: await readGuidance() }];
  for (const name of (await readdir(path.join(overlayRoot, 'host'))).sort()) {
    texts.push({ name: `host/${name}`, text: await readFile(path.join(overlayRoot, 'host', name), 'utf8') });
  }
  return texts;
}

/** Snake_case identifiers opening a backtick span, alone or as a `tool_name {` call. */
function citedToolIds(markdown) {
  const toolId = String.raw`[a-z][a-z0-9]*(?:_[a-z0-9]+)+`;
  return new Set([...markdown.matchAll(new RegExp(String.raw`\`(${toolId})(?=\`| \{|\()`, 'g'))].map(match => match[1]));
}

test('supporting files follow the overlay naming rule and the guidance names how to read them', async () => {
  const names = await readdir(path.join(overlayRoot, 'host'));
  assert.ok(names.length > 0);
  const guidance = await readGuidance();
  for (const name of names) {
    assert.match(`host/${name}`, /^host\/[a-z0-9-]+\.md$/);
    assert.ok(guidance.includes(`file: "host/${name}"`), name);
  }
});

test('the Tovu-only claims an agent cannot infer reach the run through GUIDANCE.md', async () => {
  const guidance = await readGuidance();
  for (const claim of [
    'remote-declares-not-read-only', 'not-in-operator-allowlist', 'Restart the assistant', 'daemon start',
    'may write', 'TOVU_PUBLIC_URL', 'Settings → External MCP', '15,000 ms', 'daemon 500',
  ]) assert.ok(guidance.includes(claim), claim);
});

test('every snake_case tool the overlay cites is a served native tool or a per-plugin tool', async () => {
  const declared = new Set(Object.keys(nativeToolMetadata.byId));
  const unknown = [];
  for (const { name, text } of await overlayTexts()) {
    for (const id of citedToolIds(text)) {
      if (!declared.has(id) && !/^agent_plugin_[a-z0-9_]+$/.test(id)) unknown.push(`${name}: ${id}`);
    }
  }
  assert.deepEqual(unknown, [], 'the overlay tells agents to call tools that do not exist');
});

test('the overlay is vendor-neutral: no model or vendor names', async () => {
  for (const { name, text } of await overlayTexts()) {
    assert.doesNotMatch(text, /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/, name);
  }
});
