import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

/*
 * Electron's <webview> gives its own host `display: flex` through an inline `<style>` in its shadow
 * root, and its inner iframe gets its height only from `flex: 1 1 auto`. The renderer CSP's
 * `style-src 'self'` blocks that inline style, so without an app rule the iframe falls back to the
 * default 150px and the site's admin is cut off a few lines under the workspace bar.
 */
test("the app stylesheet gives <webview> the display:flex its blocked shadow-root style can't", () => {
  assert.match(html, /style-src 'self'[^;]*;/, 'precondition: the CSP still limits inline styles');
  assert.doesNotMatch(html, /style-src[^;]*'unsafe-inline'/);
  assert.ok(
    /(^|\n)webview\s*\{[^}]*\bdisplay:\s*flex\s*;/.test(css),
    'app.css has no `webview { display: flex; }` rule, so the guest iframe collapses to 150px',
  );
});

/*
 * That blocked `<style>` also logs a CSP violation in the console on every window with a site
 * open. The CSP admits exactly Electron's text by hash (verified in Electron 43's bundled
 * `web-view-impl`: `style.textContent = ":host { display: flex; }"`), so the error goes away and
 * every other inline style stays blocked. If Electron changes the text, this hash just stops matching.
 */
test("the CSP admits Electron's exact <webview> shadow-root style by hash, and no other inline style", () => {
  const hash = createHash('sha256').update(':host { display: flex; }').digest('base64');
  const styleSrc = /style-src ([^;]*);/.exec(html)?.[1] ?? '';
  assert.deepEqual(styleSrc.split(/\s+/), ["'self'", `'sha256-${hash}'`]);
});
