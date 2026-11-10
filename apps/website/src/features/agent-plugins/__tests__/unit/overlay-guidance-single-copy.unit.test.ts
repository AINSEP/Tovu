import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const overlayRoot = path.resolve(import.meta.dirname, '../../../../../../../content/agent-plugin-overlays');

/** `## ` headings outside fences, whole fenced blocks, and embed-marker lines anywhere. */
function sections(text: string): { headings: string[]; blocks: string[] } {
  const headings: string[] = [];
  const blocks: string[] = [];
  let fence: string[] | undefined;
  for (const line of text.split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      if (fence === undefined) fence = [line];
      else { fence.push(line); blocks.push(fence.join('\n')); fence = undefined; }
      continue;
    }
    if (fence !== undefined) fence.push(line);
    else if (line.startsWith('## ')) headings.push(line);
    if (line.includes('data-embed-config=')) blocks.push(line.trim());
  }
  return { headings, blocks };
}

const repeats = (items: string[]) => items.filter((item, index) => items.indexOf(item) !== index);

// The one deliberate repeat: github's actions host operations list the latest-run request once
// before the dispatch and once to poll after it, as the combine skill's references/actions.md did
// ("One more comparison, already paid for" / "Follow the run").
const intendedRepeat = (pluginId: string, block: string) => pluginId === 'github' && block.includes('/runs?per_page=1"');

// A merge once left google-login's overlay with its member steps, troubleshooting and embed
// block twice; the assistant read both copies ahead of the plugin's own skill.
test('no overlay GUIDANCE.md repeats a ## heading or a fenced/embed block', () => {
  const plugins = readdirSync(overlayRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.ok(plugins.length > 0);
  const failures = plugins.flatMap(pluginId => {
    let text: string;
    try { text = readFileSync(path.join(overlayRoot, pluginId, 'GUIDANCE.md'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const { headings, blocks } = sections(text);
    const repeatedBlocks = repeats(blocks).filter(block => !intendedRepeat(pluginId, block));
    return [...repeats(headings), ...repeatedBlocks].map(item => `${pluginId}: ${item.split('\n')[0]}`);
  });
  assert.deepEqual(failures, []);
});
