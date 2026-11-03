import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverAllBuiltInThemes } from '../theme.js';
import { buildThemesRegistrations } from '../tool-registrations.js';
import { MAX_THEME_FILE_BYTES, listThemeFiles } from '../theme-files.js';

for (const refusal of ['oversized content', 'oversized destination'] as const) {
  test(`theme_write_file refuses ${refusal} before asking to replace an existing file`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-write-preflight-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const themeDir = path.join(root, 'copy');
    fs.mkdirSync(themeDir);
    fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify({ id: 'copy', name: 'Copy', version: '1.0.0', tier: 'static', engine: 1 }));
    const oversized = 'x'.repeat(MAX_THEME_FILE_BYTES + 1);
    const before = refusal === 'oversized destination' ? oversized : 'old';
    fs.writeFileSync(path.join(themeDir, 'style.css'), before);
    const registrations = buildThemesRegistrations({
      workspaceId: 'ws', themesDir: root, themes: discoverAllBuiltInThemes({ dir: root, source: 'built-in' }),
      resolveActiveThemeId: async () => 'copy', authorize: async () => ({ allowed: true, reason: 'matched' }),
    });
    const handler = registrations.find(item => item.descriptor.id === 'theme_write_file')!.handler;
    let cards = 0;
    await assert.rejects(handler({ executionId: 'exec', run: { id: 'run' }, principal: { id: 'owner' },
      signal: new AbortController().signal,
      input: { themeId: 'copy', path: 'style.css', content: refusal === 'oversized content' ? oversized : 'new' },
    }, { emitSurface: async () => { cards++; assert.fail('invalid write reached confirmation'); } }), /content exceeds|requires overwriteOversized/);
    assert.equal(cards, 0, 'an impossible write must not request user approval');
    assert.equal(fs.readFileSync(path.join(themeDir, 'style.css'), 'utf8'), before);
    assert.equal(listThemeFiles({ themeDir, themesRoot: root }).some(file => file.startsWith('.trash/')), false);
  });
}
