/**
 * @file Coverage for `site-history-menu.ts`, plus the wiring that only source text can show: that
 * `main.ts` installs the menu in sites-home mode, that the preload subscribes to the same channel,
 * and that the inlined channel literal still matches `contracts/project.ts`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { SITE_HISTORY_CHANNEL, sendSiteHistoryCommand, siteHistoryMenu, sitesHomeMenuTemplate } from "./site-history-menu.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");

/** A BrowserWindow stand-in that records what was sent to its renderer. */
function fakeWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const sent: [string, string][] = [];
  return {
    sent,
    isDestroyed: () => destroyed,
    webContents: { send: (channel: string, payload: string) => sent.push([channel, payload]) },
  };
}

test("History has Back on CmdOrCtrl+[ and Forward on CmdOrCtrl+]", () => {
  const menu = siteHistoryMenu({});
  assert.equal(menu.label, "History");
  assert.deepEqual(
    menu.submenu.map(({ label, accelerator }) => [label, accelerator]),
    [
      ["Back", "CmdOrCtrl+["],
      ["Forward", "CmdOrCtrl+]"],
    ],
  );
});

test("clicking Back and Forward sends the command to the focused window's renderer", () => {
  const [back, forward] = siteHistoryMenu({}).submenu;
  const window = fakeWindow();
  back.click(undefined, window);
  forward.click(undefined, window);
  assert.deepEqual(window.sent, [
    [SITE_HISTORY_CHANNEL, "back"],
    [SITE_HISTORY_CHANNEL, "forward"],
  ]);
});

test("with no focused window, a destroyed one, or one without webContents, nothing is sent", () => {
  assert.equal(sendSiteHistoryCommand({ window: undefined, command: "back" }), false);
  const destroyed = fakeWindow({ destroyed: true });
  assert.equal(sendSiteHistoryCommand({ window: destroyed, command: "back" }), false);
  assert.deepEqual(destroyed.sent, []);
  assert.equal(sendSiteHistoryCommand({ window: { isDestroyed: () => false }, command: "forward" }), false);
  assert.equal(sendSiteHistoryCommand({ window: fakeWindow(), command: "forward" }), true);
});

test("the sites-home menu keeps Electron's default menus and adds History and Find before Window", () => {
  const roles = (template: { role?: string; label?: string }[]) => template.map((entry) => entry.role ?? entry.label);
  assert.deepEqual(roles(sitesHomeMenuTemplate({ platform: "darwin" })), ["appMenu", "fileMenu", "editMenu", "View", "History", "Find", "windowMenu", "help"]);
  assert.deepEqual(roles(sitesHomeMenuTemplate({ platform: "linux" })), ["fileMenu", "editMenu", "View", "History", "Find", "windowMenu", "help"]);
});

test("the inlined channel literal matches contracts/project.ts", () => {
  const match = read("contracts", "project.ts").match(/export const SITE_HISTORY_CHANNEL\s*=\s*'([^']+)'/);
  assert.ok(match, "contracts/project.ts must declare SITE_HISTORY_CHANNEL");
  assert.equal(match[1], SITE_HISTORY_CHANNEL);
});

test("the preload subscribes to that channel", () => {
  assert.match(read("preload", "preload.mts"), /onSiteHistory:[^\n]*\n?\s*subscribe\(SITE_HISTORY_CHANNEL, listener\)/);
});

test("main.ts installs the sites-home menu in the sites-home branch, before the window opens", () => {
  const main = read("..", "main.ts");
  const branch = main.indexOf("if (sitesUiRequested()) {");
  const install = main.indexOf("Menu.setApplicationMenu(Menu.buildFromTemplate(sitesHomeMenuTemplate({ platform: process.platform })));");
  const open = main.indexOf("openSitesHomeWindow();");
  assert.notEqual(branch, -1, "expected the sites-home branch in main.ts");
  assert.notEqual(install, -1, "expected main.ts to install sitesHomeMenuTemplate");
  assert.ok(branch < install && install < open, "the menu must be installed inside the sites-home branch, before the window opens");
  assert.match(main, /import \{ sitesHomeMenuTemplate \} from "\.\/src\/site-history-menu\.ts";/);
});

test("menu installation and opening execute directly inside the sites-home branch in that order", () => {
  const main = ts.createSourceFile("main.ts", read("..", "main.ts"), ts.ScriptTarget.Latest, true);
  const branches: ts.IfStatement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && node.expression.getText(main) === "sitesUiRequested()") branches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(main);
  assert.equal(branches.length, 1);
  const branch = branches[0]!;
  assert.ok(ts.isBlock(branch.thenStatement));
  // Execute these actual statements while omitting unrelated registry/server boot setup.
  const statements = branch.thenStatement.statements.filter((statement) =>
    ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
    ["Menu.setApplicationMenu", "openSitesHomeWindow"].includes(statement.expression.expression.getText(main)),
  );
  assert.equal(statements.length, 2, "both operations must be direct statements of the sites-home branch");
  const body = `if (${branch.expression.getText(main)}) { ${statements.map((statement) => statement.getText(main)).join("\n")} }`;
  const boot = new Function("Menu", "sitesUiRequested", "openSitesHomeWindow", "sitesHomeMenuTemplate", "process", body);
  for (const requested of [true, false]) {
    const calls: string[] = [];
    const template = {};
    const menu = {};
    boot({
      buildFromTemplate(value: unknown) { assert.equal(value, template); calls.push("build"); return menu; },
      setApplicationMenu(value: unknown) { assert.equal(value, menu); calls.push("install"); },
    }, () => requested, () => calls.push("open"), (options: unknown) => {
      assert.deepEqual(options, { platform: "darwin" }); return template;
    }, { platform: "darwin" });
    assert.deepEqual(calls, requested ? ["build", "install", "open"] : []);
  }
});
