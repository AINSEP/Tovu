import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderThemeFontLinks } from '../font-links.js';
import { loadTheme } from '../theme.js';

const resources = { scripts: [], styles: [], fonts: [], fontPreconnects: {
  'https://styles.example.test': [
    { url: 'https://styles.example.test' }, { url: 'https://files.example.test', crossorigin: true },
  ],
} };

test('declared links preserve order and escape attribute boundaries without changing URL bytes', () => {
  const manifest = { fontStylesheets: ['https://styles.example.test/font?a=1&b=2', 'https://styles.example.test/font?a=1&b=2', 'https://other.example.test/"<font>'] };
  assert.equal(renderThemeFontLinks({ manifest }, { resources }),
    '<link rel="preconnect" href="https://styles.example.test"/><link rel="preconnect" href="https://files.example.test" crossorigin/><link rel="stylesheet" href="https://styles.example.test/font?a=1&b=2"/><link rel="stylesheet" href="https://other.example.test/&quot;&lt;font&gt;"/>');
});

test('local and unrelated CDN stylesheets emit no Google preconnect with default resources', () => {
  for (const url of ['/fonts/site.css', 'https://cdn.example.test/fonts.css']) {
    assert.equal(renderThemeFontLinks({ manifest: { fontStylesheets: [url] } }), `<link rel="stylesheet" href="${url}"/>`);
  }
});

test('absent and explicitly disabled fonts emit no links, and explicit stylesheets override legacy families', () => {
  assert.equal(renderThemeFontLinks({ manifest: {} }), '');
  assert.equal(renderThemeFontLinks({ manifest: { fonts: [] } }), '');
  assert.equal(renderThemeFontLinks({ manifest: { fonts: ['Legacy'], fontStylesheets: [] } }), '');
  assert.equal(renderThemeFontLinks({ manifest: { fonts: ['Legacy'], fontStylesheets: ['/fonts/site.css'] } }), '<link rel="stylesheet" href="/fonts/site.css"/>');
  assert.equal(renderThemeFontLinks({ manifest: { fonts: ['Legacy'] } }, { resources }), '');
});

test('any legacy family list keeps the old query bytes, ordering and duplicates', () => {
  for (const fonts of [
    ['Fraunces:opsz,wght@9..144,400'],
    ['Space+Grotesk:wght@400;700', 'Fraunces:opsz,wght@9..144,400', 'Space+Grotesk:wght@400;700'],
    ['Unlisted$&Family:wght@400'],
  ]) {
    const families = fonts.map(font => `family=${font}`).join('&');
    assert.equal(renderThemeFontLinks({ manifest: { fonts } }),
      `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap"/>`);
  }
});

test('every migrated stock manifest retains the pre-extraction golden font bytes', () => {
  const root = path.resolve(import.meta.dirname, '../../../../../../content/themes');
  const goldens: Record<string, string> = JSON.parse(readFileSync(new URL('fixtures/font-links.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(goldens).length > 0);
  for (const [relative, expected] of Object.entries(goldens)) {
    const theme = loadTheme({ themeDir: path.join(root, relative), id: path.basename(relative), source: 'built-in' });
    assert.ok(theme.manifest.fontStylesheets?.length, relative);
    assert.equal(renderThemeFontLinks({ manifest: theme.manifest }), expected, relative);
  }
});
