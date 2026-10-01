/**
 * @file Static-analysis tests for `../main.ts`'s wiring of three of the four native quick wins:
 * window-bounds memory, and the right-click spellcheck menu on both the sites home window's own
 * page and every project tab's guest. (Zoom's own wiring is covered by `zoom-menu.test.ts`; "Open
 * in default browser" predates this batch — see `project-ipc.test.ts`'s `handleOpenExternal`
 * coverage.)
 *
 * Source text, not behaviour, for the reason `main-project-wiring.test.ts` documents at length:
 * `main.ts` requires `"electron"` at module scope, which resolves to a path string rather than the
 * real API outside a real Electron process, so `require`-ing it under plain `node --test` crashes
 * before proving anything. The pieces it wires together are behaviourally covered where they live
 * (`window-bounds-store.test.ts`, `spellcheck-menu.test.ts`); what only this file can check is that
 * `main.ts` actually calls them, and in the one order where the call is correct.
 */
import test from "node:test";
import ts from "typescript";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_PATH = path.join(__dirname, "..", "main.ts");
const source = fs.readFileSync(MAIN_PATH, "utf8");

const sf = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
function homeRegistrations(event: string) {
  const home = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "openSitesHomeWindow");
  assert.ok(home);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "on" && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === event) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(home);
  return calls;
}

test("main.ts imports the window-bounds store and the spellcheck menu from their own modules", () => {
  assert.match(source, /from ["']\.\/src\/window-bounds-store\.ts["']/);
  assert.match(source, /from ["']\.\/src\/spellcheck-menu\.ts["']/);
  assert.match(source, /\bwindowBoundsFilePath\b/);
  assert.match(source, /\breadWindowBounds\b/);
  assert.match(source, /\bwriteWindowBounds\b/);
  assert.match(source, /\bresolveWindowBounds\b/);
  assert.match(source, /\bregisterSpellCheckContextMenu\b/);
});

test("resolveWindowBounds runs BEFORE the sites-home BrowserWindow is constructed", () => {
  const resolveCall = source.indexOf("resolveWindowBounds(");
  const constructorCall = source.indexOf("new BrowserWindow({\n    ...resolvedBounds,");
  assert.notEqual(resolveCall, -1, "expected a resolveWindowBounds(...) call in main.ts");
  assert.notEqual(constructorCall, -1, "expected the sites-home BrowserWindow to spread ...resolvedBounds");
  assert.ok(resolveCall < constructorCall, "bounds must be resolved before they are handed to the constructor");
});

test("the resolved bounds are spread into the constructor, not passed as a separate width/height", () => {
  assert.match(source, /new BrowserWindow\(\{\s*\n\s*\.\.\.resolvedBounds,/);
});

test("bounds are written on close, guarded against a destroyed or full-screen window", () => {
  const closeHandler = source.match(/window\.on\("close", \(\) => \{[\s\S]{0,200}?\}\);/);
  assert.ok(closeHandler, "expected a window.on(\"close\", ...) handler near the sites-home window");
  assert.match(closeHandler![0], /isDestroyed\(\)/);
  assert.match(closeHandler![0], /isFullScreen\(\)/);
  assert.match(closeHandler![0], /writeWindowBounds\(boundsPath, window\.getBounds\(\)\)/);
  const registrations = homeRegistrations("close");
  assert.equal(registrations.length, 1);
  const callback = ts.transpile(`const handler = ${registrations[0].arguments[1].getText(sf)};`, { target: ts.ScriptTarget.ES2022 });
  for (const state of ["normal", "fullscreen", "destroyed"]) {
    const writes: unknown[][] = [];
    const bounds = { x: 40, y: 60, width: 800, height: 700 };
    const window = {
      isDestroyed: () => state === "destroyed",
      isFullScreen: () => { assert.notEqual(state, "destroyed"); return state === "fullscreen"; },
      getBounds: () => { assert.equal(state, "normal"); return bounds; },
    };
    const handler = new Function("window", "boundsPath", "writeWindowBounds", `${callback}; return handler;`)(window, "/bounds.json", (...args: unknown[]) => writes.push(args));
    handler();
    assert.deepEqual(writes, state === "normal" ? [["/bounds.json", bounds]] : [], state);
  }
});

test("registerSpellCheckContextMenu is wired for BOTH the top-level window and every attached guest", () => {
  assert.match(source, /registerSpellCheckContextMenu\(window\.webContents, Menu\)/, "top-level Projects screen");
  const didAttach = source.match(/window\.webContents\.on\("did-attach-webview", \(_event, contents\) => \{[\s\S]{0,200}?\}\);/);
  assert.ok(didAttach, 'expected a did-attach-webview handler wiring the guest\'s own context menu');
  assert.match(didAttach![0], /registerSpellCheckContextMenu\(contents, Menu\)/, "project tab guest");
});

test("did-attach-webview is registered on the SAME window as will-attach-webview, not a different one", () => {
  const willAttachIndex = source.indexOf('window.webContents.on("will-attach-webview"');
  const didAttachIndex = source.indexOf('window.webContents.on("did-attach-webview"');
  assert.notEqual(willAttachIndex, -1);
  assert.notEqual(didAttachIndex, -1);
  const will = homeRegistrations("will-attach-webview");
  const did = homeRegistrations("did-attach-webview");
  assert.equal(will.length, 1);
  assert.equal(did.length, 1);
  assert.equal(will[0].expression.getText(sf), "window.webContents.on");
  assert.equal(did[0].expression.getText(sf), "window.webContents.on");
  // Both use the single constructor-bound local window in this function.
  const home = will[0].getSourceFile().statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "openSitesHomeWindow")!;
  assert.equal((home.getText(sf).match(/const window = new BrowserWindow\(/g) ?? []).length, 1);
});
