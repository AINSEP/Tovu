/**
 * @file The preload half of the operator-triggered "Rescan" control: the bridge method must invoke
 * the exact contract channel with no renderer payload. KEPT as transpiled source because preload
 * code imports Electron, which the renderer's test runner cannot load; the method expression is cut
 * out and run with an injected IPC port instead. Registered main handlers are tested separately.
 *
 * The renderer halves are rendered from their real modules: the hook in
 * `use-sites-inventory.hooks.render.test.ts` (`useSiteRescan`), the header button in
 * `app/MainHeader.render.test.ts`, the error-beside-the-grid rule in `app/MainContent.render.test.ts`,
 * and the whole click → `window.tovuRunner.rescanSites` path in `App.render.test.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from 'typescript';
import { SITE_IPC_CHANNELS } from '../contracts/project.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const preload = fs.readFileSync(path.join(__dirname, "..", "preload", "preload.mts"), "utf8");

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
