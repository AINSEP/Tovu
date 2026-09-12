/**
 * @file Wiring guard for the project tab toolbar in `App.tsx`: back, forward and reload icons on
 * the left, the url on the right beside "Open in browser", and every action taken from
 * `useSiteWorkspace` rather than from state held in the component.
 *
 * Source text, because `App.tsx` has no runner in this package (see `rescan-wiring.test.ts`). The
 * behaviour behind each wire is covered for real in `use-site-workspace.hooks.test.ts`; this file
 * checks only that the component calls it, in the order the toolbar shows it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appTsx = fs.readFileSync(path.join(here, 'App.tsx'), 'utf8');
const workspaceHooks = fs.readFileSync(path.join(here, 'use-site-workspace.hooks.ts'), 'utf8');
const icons = fs.readFileSync(path.join(here, 'icons.tsx'), 'utf8');

/** `SiteWorkspace`'s body, up to the next top-level `function`. */
function workspaceBody(): string {
  const start = appTsx.indexOf('function SiteWorkspace(');
  assert.notEqual(start, -1, 'SiteWorkspace must still exist in App.tsx');
  const rest = appTsx.slice(start);
  const end = rest.indexOf('\nfunction ', 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

/** The index of `needle` in `haystack`, asserted to exist so an ordering check cannot pass on -1s. */
function at(haystack: string, needle: string): number {
  const index = haystack.indexOf(needle);
  assert.notEqual(index, -1, `expected ${needle} in SiteWorkspace`);
  return index;
}

test('back, forward and reload are icon-only buttons named for assistive tech', () => {
  const body = workspaceBody();
  for (const label of ['Back', 'Forward', 'Reload']) {
    assert.match(body, new RegExp(`aria-label="${label}"`), `${label} needs an accessible name`);
    assert.match(body, new RegExp(`title="${label}"`), `${label} needs a tooltip`);
  }
  assert.match(body, /<NavIcon kind="back" \/>/);
  assert.match(body, /<NavIcon kind="forward" \/>/);
  assert.match(body, /<NavIcon kind="reload" \/>/);
  assert.doesNotMatch(body, />\s*Reload\s*</, 'the text Reload button must be gone');
});

test('the three history buttons come first, before the status dot and the view toggle', () => {
  const body = workspaceBody();
  const back = at(body, 'aria-label="Back"');
  const forward = at(body, 'aria-label="Forward"');
  const reload = at(body, 'aria-label="Reload"');
  const dot = at(body, 'className="state"');
  const toggle = at(body, 'className="workspace__views"');
  assert.ok(back < forward && forward < reload, 'order must be back, forward, reload');
  assert.ok(reload < dot && dot < toggle, 'the history buttons must sit left of the status dot and toggle');
});

test('the url sits on the right, directly before Open in browser', () => {
  const body = workspaceBody();
  const spacer = at(body, 'className="workspace__spacer"');
  const url = at(body, 'className="workspace__url"');
  const openInBrowser = at(body, 'Open in browser');
  assert.ok(spacer < url, 'the url must be pushed right by the spacer');
  const between = body.slice(url, openInBrowser);
  assert.equal((between.match(/<button/g) ?? []).length, 1, 'nothing but the Open in browser button may sit between them');
});

test('the buttons are wired to the hook, and back/forward disable from live history', () => {
  const body = workspaceBody();
  assert.match(body, /onClick=\{workspace\.goBack\}/);
  assert.match(body, /onClick=\{workspace\.goForward\}/);
  assert.match(body, /onClick=\{workspace\.reload\}/);
  assert.match(body, /disabled=\{!workspace\.history\.canGoBack\}/);
  assert.match(body, /disabled=\{!workspace\.history\.canGoForward\}/);
  assert.match(body, /useSiteWorkspace\(project, hidden\)/);
});

test('SiteWorkspace holds no state or effects of its own', () => {
  const body = workspaceBody();
  assert.doesNotMatch(body, /\buse(State|Effect|Reducer|Ref)\b/);
  assert.doesNotMatch(body, /setReloadNonce/);
});

test('the remount survives only as recovery: key on the guest, and both recovery panels retry through it', () => {
  const body = workspaceBody();
  // `ref={guestRef}` by that bare name: `webview-failure-wiring.test.ts` pins the D-03 callback ref.
  assert.match(body, /<webview\s+ref=\{guestRef\}\s+key=\{workspace\.reloadNonce\}/);
  assert.match(body, /const \{ guestRef \} = workspace;/);
  assert.equal((body.match(/onStarted=\{workspace\.recover\}/g) ?? []).length, 2);
  assert.match(
    workspaceHooks,
    /useWebviewLoadFailure\(loadResetKey\(state\)\)/,
    'the load-failure hook must reset on soft loads and remounts alike',
  );
});

test('the icons are drawn inline in icons.tsx, with no icon package', () => {
  assert.match(icons, /export function NavIcon\(/);
  assert.doesNotMatch(appTsx, /lucide/);
  assert.doesNotMatch(icons, /lucide/);
});
