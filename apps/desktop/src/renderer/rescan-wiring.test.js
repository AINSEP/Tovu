/**
 * @file Wiring guard for the operator-triggered "Rescan" control, across the three files a single
 * IPC verb has to appear in before a click reaches main: the preload bridge, the renderer's typed
 * view of it, and the button itself.
 *
 * Source text, because there is nowhere else to put it: `apps/desktop`'s test script is
 * `node --test "src/**\/*.test.cjs"`, so the renderer's `.ts`/`.tsx` has no runner in this package
 * at all. A missing link in this chain does not fail `npm run typecheck` either — an optional
 * bridge method that nothing declares is simply absent at runtime, and the button silently does
 * nothing. The behaviour behind the verb is covered where it lives, in `project-ipc.test.js`'s
 * `rescanSites` tests; this file only checks that the click can get there.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
const preload = read("..", "preload", "preload.mts");
const runnerApi = read("runner-api.ts");
const appHooks = read("App.hooks.ts");
const appTsx = read("App.tsx");

test("the preload bridges rescanSites onto the contract's own rescan channel", () => {
  assert.match(preload, /rescanSites: \(\) => ipcRenderer\.invoke\(RUNNER_PROJECT_CHANNELS\.rescan\)/);
});

test("runner-api declares rescanSites, or the renderer cannot see the bridge method", () => {
  assert.match(runnerApi, /rescanSites: \(\) => Promise<readonly ProjectRecord\[\]>/);
});

test("a hook owns the rescan call, not the component — this repo keeps logic out of .tsx", () => {
  assert.match(appHooks, /export function useProjectRescan\(/);
  assert.match(appHooks, /rescanSites\(\)/);
});

test("the rescan result replaces the project list rather than waiting for the next poll", () => {
  // Discarding it would leave the operator staring at the old grid for up to 4s after a rescan
  // that had already found their site — indistinguishable, to them, from the button not working.
  const hook = appHooks.slice(appHooks.indexOf("export function useProjectRescan("));
  assert.match(hook.slice(0, hook.indexOf("\nexport ")), /setProjects\(/);
});

test("the Projects header renders a Rescan control wired to that hook", () => {
  assert.match(appTsx, /onRescan/);
  assert.match(appTsx, /Rescan/);
});

test("a rescan failure is reported ALONGSIDE the grid, never in place of it", () => {
  // Found by driving the real app, not by this file's first draft: `ProjectsBody` early-returns an
  // empty state whenever `loadError` is set, so routing the rescan error through that prop blanked
  // every project the operator already had — strictly worse than the failure being reported, and
  // indistinguishable from "all my sites vanished". The projects already listed stay real and
  // openable whatever a scan did.
  assert.doesNotMatch(appTsx, /loadError=\{loadError \?\? rescanError\}/);
  const body = appTsx.slice(appTsx.indexOf('function ProjectsBody('));
  const ownBody = body.slice(0, body.indexOf('\nfunction '));
  assert.ok(ownBody.includes('if (loadError)'), 'loadError still owns the replace-the-grid path');
  // The INVARIANT is that `rescanError` renders additively, in the same branch that still draws the
  // websites — never through an early return that replaces them. Asserted structurally rather than
  // by "the line immediately after it is `<SiteGrid`": that earlier pattern also passed only
  // while `rescanError` happened to be the last thing before the grid, so adding a SECOND additive
  // message (`addError`, same reasoning) broke the test without touching the property it protects.
  const rescanRender = ownBody.indexOf('{rescanError &&');
  assert.ok(rescanRender !== -1, 'rescanError is not rendered at all');
  const tail = ownBody.slice(rescanRender);
  // No early return between the message and the grid — that is what "in place of it" would look like.
  assert.doesNotMatch(tail.slice(0, tail.indexOf('<SiteGrid')), /\breturn\b/);
  assert.ok(tail.includes('<SiteGrid'), 'the grid is not rendered after the rescan message');
});
