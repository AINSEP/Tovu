import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadTheme, resolveThemeScripts } from '../theme.js';
import { validateManifestV2 } from '../validation/manifest-v2.js';

const base = { id: 'declared', name: 'Declared', version: '1.0.0', apiVersion: 2, tier: 'declarative' };

test('theme declarations resolve theme-relative assets and preserve explicit site/external URLs', () => {
  const scripts = [{ src: './scripts/menu.js' }, { src: '../scripts/stats.js', consent: ['analytics'] as const },
    { src: '/scripts/site.js' }, { src: 'https://example.com/pixel.js', consent: ['analytics', 'marketing'] as const }];
  assert.deepEqual(resolveThemeScripts({ manifest: { id: 'declared', scripts } }), [
    { src: '/theme-assets/declared/scripts/menu.js' }, { src: '/theme-assets/declared/scripts/stats.js', consent: ['analytics'] },
    { src: '/scripts/site.js' }, { src: 'https://example.com/pixel.js', consent: ['analytics', 'marketing'] },
  ]);
});

test('loader retains validated declarations and rejects unknown purposes without touching page source', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'theme-declarations-'));
  try {
    writeFileSync(path.join(directory, 'tokens.json'), '{}');
    writeFileSync(path.join(directory, 'theme.json'), JSON.stringify({ ...base, scripts: [{ src: './scripts/menu.js' }] }));
    const loaded = loadTheme({ themeDir: directory, id: 'declared', source: 'site' });
    assert.deepEqual(loaded.manifest.scripts, [{ src: '/theme-assets/declared/scripts/menu.js' }]);
    writeFileSync(path.join(directory, 'theme.json'), JSON.stringify({ ...base, scripts: [{ src: './scripts/stats.js', consent: ['unknown'] }] }));
    const invalid = loadTheme({ themeDir: directory, id: 'declared', source: 'site' });
    assert.equal(invalid.status, 'invalid');
    assert.ok(invalid.errors.some(error => error.includes('scripts[0]')));
    assert.deepEqual(invalid.manifest.scripts, []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('v2 validates declarations without warning about external unconditional scripts', () => {
  assert.deepEqual(validateManifestV2({ raw: { ...base, scripts: [{ src: 'https://example.com/pixel.js' }] } }), []);
  const problems = validateManifestV2({ raw: { ...base, scripts: [{ src: '/stats.js', consent: ['unknown'] }] } });
  assert.ok(problems.some(problem => problem.ruleId === 'v2-scripts'));
  assert.ok(problems.every(problem => problem.ruleId !== 'v2-scripts-unimplemented'));
});
