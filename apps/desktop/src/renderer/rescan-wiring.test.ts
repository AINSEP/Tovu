/**
 * @file Wiring guard for the operator-triggered "Rescan" control, across the three files a single
 * IPC verb has to appear in before a click reaches main: the preload bridge, the renderer's typed
 * view of it, and the button itself.
 *
 * Execute actual preload method expressions, hooks and returned elements with injected ports.
 * No module mocks or text-pattern assertions; registered main handlers are tested separately.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { elements, hookHarness, sourceFunction } from './source-test-harness.js';
import ts from 'typescript';
import { SITE_IPC_CHANNELS } from '../contracts/project.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
const preload = read("..", "preload", "preload.mts");
const runnerApi = read("runner-api.ts");
const appHooks = read("App.hooks.ts");
const appTsx = read("App.tsx");

test("the preload rescan method invokes the exact contract channel with no renderer payload", async () => {
  // Evaluate the actual preload method with an injected IPC port, without importing Electron.
  const file = ts.createSourceFile('preload.mts', preload, ts.ScriptTarget.Latest, true);
  let method: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'rescanSites') method = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(method, 'the preload must expose rescanSites');
  const code = ts.transpileModule(`const invoke = ${method.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: unknown[][] = [], records = [{ id: '/found' }];
  const invoke = new Function('ipcRenderer', 'SITE_IPC_CHANNELS', `${code}\nreturn invoke;`)({
    invoke: async (...args: unknown[]) => { calls.push(args); return records; },
  }, SITE_IPC_CHANNELS);
  assert.equal(await invoke(), records); assert.deepEqual(calls, [[SITE_IPC_CHANNELS.rescan]]);
});

test("runner-api declares rescanSites, or the renderer cannot see the bridge method", () => {
  const bridge = { rescanSites: async () => [] };
  const getBridge = sourceFunction(runnerApi, 'runnerInventoryBridge', { window: { tovuRunner: bridge } });
  assert.equal(getBridge().rescanSites, bridge.rescanSites);
});

test("the rescan result replaces the project list rather than waiting for the next poll", async () => {
  // Discarding it would leave the operator staring at the old grid for up to 4s after a rescan
  // that had already found their site — indistinguishable, to them, from the button not working.
  const harness = hookHarness();
  let resolve!: (records: unknown[]) => void;
  let projects: unknown[] = [{ id: 'stale' }];
  const result = [{ id: '/discovered/a', port: 4321 }, { id: '/discovered/b', port: 4322 }];
  const useRescan = sourceFunction(appHooks, 'useSiteRescan', {
    ...harness.bindings,
    runnerInventoryBridge: () => ({ rescanSites: () => new Promise((done) => { resolve = done; }) }),
  });
  const setProjects = (next: unknown[]) => { projects = next; };
  const scanning = harness.render(() => useRescan(setProjects)).rescan();
  assert.equal(harness.render(() => useRescan(setProjects)).rescanning, true);
  assert.deepEqual(projects, [{ id: 'stale' }]);
  resolve(result);
  await scanning;
  assert.deepEqual(projects, result);
  assert.equal(harness.render(() => useRescan(setProjects)).rescanning, false);
});

test("a refused broad-root scan shows the exact remedy and keeps the existing projects", async () => {
  const harness = hookHarness(), projects = [{ id: '/existing' }];
  const message = 'Sites folder is too broad: /. Choose a specific folder containing your Tovu websites.';
  const useRescan = sourceFunction(appHooks, 'useSiteRescan', { ...harness.bindings,
    runnerInventoryBridge: () => ({ rescanSites: async () => { throw new Error(message); } }),
  });
  const setProjects = () => assert.fail('failure must not replace the existing projects');
  await harness.render(() => useRescan(setProjects)).rescan();
  const state = harness.render(() => useRescan(setProjects));
  assert.equal(state.rescanError, message); assert.equal(state.rescanning, false);
  assert.deepEqual(projects, [{ id: '/existing' }]); harness.cleanup();
});

test("the Projects header renders a Rescan control wired to that hook", () => {
  let calls = 0;
  const header = sourceFunction(appTsx, 'MainHeader', { SitesFolders: () => null, SharedKeysLauncher: () => null });
  const button = elements(header({ activeId: 'projects', isCreating: false, activeLabel: 'Projects',
    onRescan: async () => { calls++; }, rescanning: false })).find((element) => element.type === 'button' && element.props.children === 'Rescan');
  assert.ok(button, 'the Rescan button must render');
  button.props.onClick();
  assert.equal(calls, 1, 'the button itself must invoke onRescan');
  const area = sourceFunction(appTsx, 'MainArea', { MainHeader: header, MainContent: () => null });
  const areaButton = elements(area({ appearanceOpen: false, showSitesHome: true, activeId: 'projects',
    isCreating: false, onRescan: async () => { calls++; }, rescanning: false,
  })).find((element) => element.type === 'button' && element.props.children === 'Rescan');
  assert.ok(areaButton); areaButton.props.onClick(); assert.equal(calls, 2);
});

test("a rescan failure is reported ALONGSIDE the grid, never in place of it", () => {
  // Found by driving the real app, not by this file's first draft: `ProjectsBody` early-returns an
  // empty state whenever `loadError` is set, so routing the rescan error through that prop blanked
  // every project the operator already had — strictly worse than the failure being reported, and
  // indistinguishable from "all my sites vanished". The projects already listed stay real and
  // openable whatever a scan did.
  // The INVARIANT is that `rescanError` renders additively, in the same branch that still draws the
  // websites — never through an early return that replaces them. Execute the returned elements
  // so another additive message can be introduced without depending on source layout.
  const projects = [{ id: '/sites/a' }, { id: '/sites/b' }];
  let gridProps: any;
  const bodyComponent = sourceFunction(appTsx, 'ProjectsBody', {
    SiteGrid: (props: any) => { gridProps = props; return null; },
    NoWebsitesYet: () => assert.fail('populated projects must not become an empty state'),
  });
  const onOpen = () => {};
  const rendered = elements(bodyComponent({ projectsLoading: false, loadError: null,
    rescanError: 'scan failed', addError: null, projects, onOpen }));
  assert.ok(rendered.some((element) => element.props.children === 'scan failed'));
  assert.deepEqual(gridProps?.projects, projects, 'a rescan error must preserve every existing card');
  assert.equal(gridProps.onOpen, onOpen, 'the preserved grid must remain usable');
});
