import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * @file Tovu's overlay for the shared `ui-ux-design` plugin (`@jini-ai/agent-plugins/ui-ux-design`).
 * The shared skills are host-neutral; Tovu's chat rules (no shell or installers from chat, tool
 * discovery, an honest note when shadcn MCP is missing) were deliberate (46a03a47d) and now ride
 * this overlay. These are the source-text pins that `content/agent-plugins/ui-ux-design/__tests__`
 * held. The delivered-output pins (overlay prepended on both seams, "Bash" stripped from the
 * shadcn frontmatter the model receives) belong to the host guidance formatter's tests.
 */

const overlayRoot = path.resolve(import.meta.dirname, '..');
const readGuidance = () => readFile(path.join(overlayRoot, 'GUIDANCE.md'), 'utf8');

// Owner-approved wording (w1, 2026-11-02), whitespace-normalized so line wrapping may change.
const APPROVED = '## Tovu chat rules Load design guidance and references with `agent_plugin_ui_ux_design`, passing `skill` and optional `file`. Discover available theme, page, media and screenshot tools with `search_tools` and `describe_tool`. Use theme/page tools for actual site edits. Never use Bash, curl, npx or package installers from chat. CLI and React examples apply only to an authorized coding-agent checkout, not an authored HTML Tovu theme. If shadcn MCP or another capability is unavailable, explain the limitation; do not invent tools or install dependencies to work around it. Project specs and design notes are optional context. Tovu chat requires neither an AI Dev Shop checkout nor `<ADS_MEMORY_ROOT>`. Return the design in chat unless the user asks to save it through an available tool.';

test('the overlay retains exactly the approved Tovu chat rules before the theme QA rules', async () => {
  const [chatRules] = (await readGuidance()).split('\n## Theme screenshot QA');
  assert.equal(chatRules.replace(/\s+/g, ' ').trim(), APPROVED);
});

test('theme QA fails clipped headlines, horizontal overflow and large dead gaps', async () => {
  const guidance = (await readGuidance()).replace(/\s+/g, ' ');
  assert.match(guidance, /FAIL[^.]*clipped text[^.]*horizontal overflow/);
  assert.match(guidance, /FAIL[^.]*large dead gaps[^.]*160px/);
  assert.match(guidance, /360, 390, 768, 1024, 1280 and 1440px/);
  assert.match(guidance, /every hero and section headline/);
  assert.match(guidance, /fix[^.]*repeat[^.]*same widths/i);
});

test('theme guidance scales display type to its container and refuses overflow masking', async () => {
  const guidance = (await readGuidance()).replace(/\s+/g, ' ');
  assert.match(guidance, /clamp\(\)/);
  assert.match(guidance, /container-type: inline-size/);
  assert.match(guidance, /font-size: clamp\(2rem, 8cqi, 7rem\)/);
  assert.match(guidance, /Never[^.]*overflow: hidden[^.]*clip[^.]*ellipsis/);
  assert.match(guidance, /unverified[^.]*PASS/);
});

test('the overlay keeps the safety rules the in-skill copy carried', async () => {
  const guidance = await readGuidance();
  assert.match(guidance, /`agent_plugin_ui_ux_design`/);
  assert.match(guidance, /Never use Bash, curl, npx or package\s+installers from chat/);
  assert.match(guidance, /If shadcn MCP or another capability is unavailable, explain the\s+limitation/);
});

test('the overlay ships guidance only: no supporting files, nothing else to stage', async () => {
  assert.deepEqual((await readdir(overlayRoot)).filter(name => name !== '__tests__').sort(), ['GUIDANCE.md']);
});

test('the overlay is vendor-neutral: no model or vendor names', async () => {
  assert.doesNotMatch(await readGuidance(), /\b(Claude|Anthropic|Codex|OpenAI|GPT|Gemini|Copilot)\b/);
});
