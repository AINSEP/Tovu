import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runThemeToggle, themeToggleScriptPath } from './theme-toggle-vm-harness.fixture.js';

const THEME_ID = 'tovu-theme';
const ORIGINAL_KEY = 'tovu-theme:relay';
const shipped = themeToggleScriptPath({ tree: 'static', themeId: THEME_ID });
const run = ({ scriptSrc, seeded = {} }: { scriptSrc: string | undefined; seeded?: Record<string, string> }) =>
  runThemeToggle({ scriptPath: shipped, scriptSrc, seeded });

test("a duplicated tovu-theme remembers its own mode without changing the original's selection", () => {
  const seeded = { [ORIGINAL_KEY]: 'light' };
  const copy = run({ scriptSrc: 'https://site.example/theme-assets/my-copy/scripts/theme-toggle.js', seeded });
  assert.ok(!copy.reads.includes(ORIGINAL_KEY), 'the copy must not read the original theme\'s key');
  assert.deepEqual(copy.writes.map(([key]) => key), ['my-copy:relay']);
  assert.equal(copy.store.get(ORIGINAL_KEY), 'light', 'the original\'s saved choice is untouched');
  assert.ok(copy.reads.includes('my-copy:relay'));
});

test('tovu-theme keeps its historical key for stock, preview-prefixed, static-export and empty script URLs', () => {
  const stock = run({ scriptSrc: 'https://site.example/theme-assets/tovu-theme/scripts/theme-toggle.js', seeded: { [ORIGINAL_KEY]: 'light' } });
  assert.deepEqual(stock.reads.includes(ORIGINAL_KEY), true, 'existing visitors keep their saved preference');
  assert.deepEqual(stock.writes.map(([key]) => key), [ORIGINAL_KEY]);
  const preview = run({ scriptSrc: '/preview/theme-assets/other-copy/scripts/theme-toggle.js' });
  assert.deepEqual(preview.writes.map(([key]) => key), ['other-copy:relay']);
  for (const scriptSrc of ['/scripts/theme-toggle.js', '', undefined]) {
    assert.deepEqual(run({ scriptSrc }).writes.map(([key]) => key), [ORIGINAL_KEY], `fallback for ${JSON.stringify(scriptSrc)}`);
  }
});

test('tovu-theme shipped script and its __original-themes__ copy are byte-identical', () => {
  const original = themeToggleScriptPath({ tree: '__original-themes__/static', themeId: THEME_ID });
  assert.ok(readFileSync(shipped).equals(readFileSync(original)));
});
