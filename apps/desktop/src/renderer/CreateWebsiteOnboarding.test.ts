/**
 * @file The one `CreateWebsiteOnboarding` fact only a stylesheet can hold: the "Soon" tag's look.
 * Everything the component renders is tested from its real module in
 * `CreateWebsiteOnboarding.render.test.ts`; jsdom computes no cascade from `app.css`, so this rule
 * is read as text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the "Soon" tag reuses the admin sidebar badge look (uppercase, bordered, faint)', () => {
  const css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');
  const start = css.indexOf('.database-option__soon {');
  assert.notEqual(start, -1, 'the tag needs its own rule');
  const rule = css.slice(start, css.indexOf('}', start));
  assert.match(rule, /text-transform:\s*uppercase/);
  assert.match(rule, /border:\s*1px solid var\(--border\)/);
  assert.match(rule, /color:\s*var\(--faint\)/);
});
