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

function sitesHomeBootStatements() {
  // The real entry point remains ../main.ts. Inspect its AST so extending the menu (Settings)
  // or formatting the call cannot invalidate the guard, and comments cannot satisfy it.
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
  const statements = branch.thenStatement.statements.filter((statement): statement is ts.ExpressionStatement =>
    ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
    ["Menu.setApplicationMenu", "openSitesHomeWindow"].includes(statement.expression.expression.getText(main)),
  );
  assert.equal(statements.length, 2, "both operations must be direct statements of the sites-home branch");
  return { main, branch, statements };
}

test("main.ts installs the sites-home menu in the sites-home branch, before the window opens", () => {
  const { main, statements } = sitesHomeBootStatements();
  assert.deepEqual(statements.map((statement) => {
    assert.ok(ts.isCallExpression(statement.expression));
    return statement.expression.expression.getText(main);
  }), ["Menu.setApplicationMenu", "openSitesHomeWindow"]);
  const templates: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(main) === "sitesHomeMenuTemplate") templates.push(node);
    ts.forEachChild(node, visit);
  };
  visit(statements[0]!);
  assert.equal(templates.length, 1, "the installed menu must include sitesHomeMenuTemplate exactly once");
  assert.match(main.text, /import \{ sitesHomeMenuTemplate \} from "\.\/src\/site-history-menu\.ts";/);
});

test("menu installation and opening execute directly inside the sites-home branch in that order", () => {
  const { main, branch, statements } = sitesHomeBootStatements();
  // Execute these actual statements while omitting unrelated registry/server boot setup.
  const body = `if (${branch.expression.getText(main)}) { ${statements.map((statement) => statement.getText(main)).join("\n")} }`;
  const boot = new Function("Menu", "sitesUiRequested", "openSitesHomeWindow", "sitesHomeMenuTemplate", "desktopUpdateSettingsMenu", "process", body);
  for (const platform of ["darwin", "linux", "win32"]) {
    for (const requested of [true, false]) {
      const calls: string[] = [];
      const template = [{ label: "History" }, { label: "Find" }];
      const settings = { label: "Settings" };
      const menu = {};
      boot({
        buildFromTemplate(value: unknown) {
          assert.deepEqual(value, [...template, settings], "the installed template must preserve the home menus and append Settings");
          calls.push("build"); return menu;
        },
        setApplicationMenu(value: unknown) { assert.equal(value, menu); calls.push("install"); },
      }, () => requested, () => calls.push("open"), (options: unknown) => {
        assert.deepEqual(options, { platform }); calls.push("template"); return template;
      }, () => { calls.push("settings"); return settings; }, { platform });
      assert.deepEqual(calls, requested ? ["template", "settings", "build", "install", "open"] : []);
    }
  }
});
