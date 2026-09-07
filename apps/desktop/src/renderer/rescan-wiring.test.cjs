/**
 * @file Wiring guard for the operator-triggered "Rescan" control, across the three files a single
 * IPC verb has to appear in before a click reaches main: the preload bridge, the renderer's typed
 * view of it, and the button itself.
 *
 * Source text, because there is nowhere else to put it: `apps/desktop`'s test script is
 * `node --test "src/**\/*.test.cjs"`, so the renderer's `.ts`/`.tsx` has no runner in this package
 * at all. A missing link in this chain does not fail `npm run typecheck` either — an optional
 * bridge method that nothing declares is simply absent at runtime, and the button silently does
 * nothing. The behaviour behind the verb is covered where it lives, in `project-ipc.test.cjs`'s
 * `rescanProjects` tests; this file only checks that the click can get there.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
const preload = read("..", "preload", "preload.mts");
const runnerApi = read("runner-api.ts");
const appHooks = read("App.hooks.ts");
const appTsx = read("App.tsx");

test("the preload bridges rescanProjects onto the contract's own rescan channel", () => {
  assert.match(preload, /rescanProjects: \(\) => ipcRenderer\.invoke\(RUNNER_PROJECT_CHANNELS\.rescan\)/);
});

test("runner-api declares rescanProjects, or the renderer cannot see the bridge method", () => {
  assert.match(runnerApi, /rescanProjects: \(\) => Promise<readonly ProjectRecord\[\]>/);
});

test("a hook owns the rescan call, not the component — this repo keeps logic out of .tsx", () => {
  assert.match(appHooks, /export function useProjectRescan\(/);
  assert.match(appHooks, /rescanProjects\(\)/);
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
