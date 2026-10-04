import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
test('all three typefaces are bundled variable fonts with their OFL licenses', () => {
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/);
  for (const name of ['dm-sans', 'space-grotesk', 'jetbrains-mono']) {
    assert.match(css, new RegExp(`vendor/fonts/${name}-variable\\.ttf`));
    const font = fs.readFileSync(new URL(`./public/vendor/fonts/${name}-variable.ttf`, import.meta.url));
    assert.equal(font.readUInt32BE(0), 0x00010000, 'real TrueType asset, not an error page');
    assert.ok(font.length > 10000);
    const license = fs.readFileSync(new URL(`./public/vendor/fonts/${name}-OFL.txt`, import.meta.url), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    const notices = fs.readFileSync(new URL('./public/THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
    assert.ok(notices.includes(`${name}-OFL.txt`));
  }
});
test('renderer CSP permits only local font and stylesheet origins', () => {
  assert.match(html, /style-src 'self';/);
  assert.match(html, /font-src 'self';/);
  assert.match(html, /script-src 'self';/);
});
