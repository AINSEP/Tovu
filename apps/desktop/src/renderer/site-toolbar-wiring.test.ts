/**
 * @file Source-text guards for the project tab toolbar in `app/SiteWorkspace.tsx` that no render can
 * observe: where its state lives, and where its icons come from. What the bar renders and what each
 * button does is tested for real in `app/SiteWorkspace.render.test.ts`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspaceTsx = fs.readFileSync(new URL('./app/SiteWorkspace.tsx', import.meta.url), 'utf8');
const icons = fs.readFileSync(new URL('./icons.tsx', import.meta.url), 'utf8');

/** `SiteWorkspace`'s body, up to the next top-level `function`. */
function workspaceBody(): string {
  const start = workspaceTsx.indexOf('function SiteWorkspace(');
  assert.notEqual(start, -1, 'SiteWorkspace must still exist in app/SiteWorkspace.tsx');
  const rest = workspaceTsx.slice(start);
  const end = rest.indexOf('\nfunction ', 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

test('SiteWorkspace holds no state or effects of its own', () => {
  // Everything a tab remembers lives in `useSiteWorkspace`, per tab, so the component stays markup.
  const body = workspaceBody();
  assert.doesNotMatch(body, /\buse(State|Effect|Reducer|Ref)\b/);
  assert.doesNotMatch(body, /setReloadNonce/);
});

test('the icons are drawn inline in icons.tsx, with no icon package', () => {
  assert.match(icons, /export function NavIcon\(/);
  assert.doesNotMatch(workspaceTsx, /lucide/);
  assert.doesNotMatch(icons, /lucide/);
});
