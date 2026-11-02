/**
 * @file The Settings menu, the post-dialog checkbox refresh and the own-server application menu, as
 * plain templates: no Electron. One test runs the default preference ports against a real file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MenuItemConstructorOptions } from "electron";
import { desktopCopy } from "../../desktop-i18n.ts";
import type { ProductTelemetryPreference } from "../../product-telemetry-preference.ts";
import {
  desktopPreferencesPath,
  desktopSettingsMenu,
  ownServerMenuTemplate,
  refreshProductMenu,
  SHARING_SAVE_ERROR,
} from "./settings-menu.ts";

const OFF: ProductTelemetryPreference = { crashes: false, usage: false, installationId: null, decidedAt: null };
type Clickable = MenuItemConstructorOptions & { click(item: { checked: boolean }): void };

function menuHarness({ launch = {}, automatic = true, preference = OFF, failSharing = false }: {
  launch?: unknown; automatic?: boolean; preference?: ProductTelemetryPreference; failSharing?: boolean;
} = {}) {
  const calls: string[] = [];
  const errors: [string, string][] = [];
  const menu = desktopSettingsMenu({
    locale: "en-US",
    preferencePath: "/ud/desktop-preferences.json",
    product: { launch, consentChanged: (saved) => calls.push(`changed:${saved.crashes}/${saved.usage}`) },
    setAutomaticUpdates: ({ enabled }) => calls.push(`automatic:${enabled}`),
    showErrorBox: (title, content) => errors.push([title, content]),
  }, {
    readAutomatic: ({ preferencePath }) => { calls.push(`readAutomatic:${preferencePath}`); return automatic; },
    readSharing: () => preference,
    writeSharing: ({ patch }) => {
      if (failSharing) throw new Error("DESKTOP_PREFERENCES_UNREADABLE");
      return { ...preference, ...patch, decidedAt: "now" };
    },
  });
  return { menu, calls, errors };
}

test("the preferences file lives in Electron's userData", () => {
  assert.equal(desktopPreferencesPath({ userData: "/Users/x/Library/Application Support/Tovu" }),
    path.join("/Users/x/Library/Application Support/Tovu", "desktop-preferences.json"));
});

test("Settings carries Automatic updates, checked from the persisted choice", () => {
  for (const automatic of [true, false]) {
    const { menu, calls } = menuHarness({ launch: undefined, automatic });
    const copy = desktopCopy({ locale: "en-US" });
    assert.equal(menu.label, copy.settings);
    assert.deepEqual(menu.submenu.map(item => [item.label, item.checked]), [[copy.automaticUpdates, automatic]]);
    assert.deepEqual(calls, ["readAutomatic:/ud/desktop-preferences.json"]);
  }
});

test("the Automatic updates checkbox hands the new state to the updater", () => {
  const { menu, calls } = menuHarness({ launch: undefined, automatic: true });
  (menu.submenu[0] as Clickable).click({ checked: false });
  assert.deepEqual(calls.slice(1), ["automatic:false"]);
});

test("a failed update-preference save shows the localized error with the failure's text", () => {
  for (const [thrown, detail] of [[new Error("disk full"), "disk full"], ["plain", "plain"]] as const) {
    const errors: [string, string][] = [];
    const menu = desktopSettingsMenu({
      locale: "en-US", preferencePath: "/p", product: { launch: undefined, consentChanged() {} },
      setAutomaticUpdates: () => { throw thrown; },
      showErrorBox: (title, content) => errors.push([title, content]),
    }, { readAutomatic: () => true });
    const item = { checked: false };
    (menu.submenu[0] as Clickable).click(item);
    assert.deepEqual(errors, [[desktopCopy({ locale: "en-US" }).saveUpdateError, detail]]);
    assert.equal(item.checked, true, "the checkbox returns to the actual state");
  }
});

test("with no product launch config the sharing checkboxes are absent", () => {
  assert.equal(menuHarness({ launch: undefined }).menu.submenu.length, 1);
});

test("a booted product adds both sharing checkboxes, checked from the stored consent", () => {
  const { menu } = menuHarness({ preference: { ...OFF, crashes: true } });
  assert.deepEqual(menu.submenu.slice(1).map(item => [item.label, item.checked]), [
    ["Send crash reports to Tovu", true],
    ["Send usage statistics to Tovu", false],
  ]);
});

test("a sharing checkbox persists, then tells the product the saved consent", () => {
  const { menu, calls } = menuHarness();
  (menu.submenu[2] as Clickable).click({ checked: true });
  assert.deepEqual(calls.slice(1), ["changed:false/true"]);
});

test("a failed sharing save shows the sharing error and changes no consent", () => {
  const { menu, calls, errors } = menuHarness({ failSharing: true });
  (menu.submenu[1] as Clickable).click({ checked: true });
  assert.deepEqual(errors, [["Tovu", SHARING_SAVE_ERROR]]);
  assert.deepEqual(calls.slice(1), []);
});

test("the default ports read and write the real preferences file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-menu-"));
  try {
    const preferencePath = desktopPreferencesPath({ userData: dir });
    fs.writeFileSync(preferencePath, JSON.stringify({ automaticUpdates: false }));
    const changed: ProductTelemetryPreference[] = [];
    const menu = desktopSettingsMenu({ locale: "en-US", preferencePath,
      product: { launch: {}, consentChanged: (saved) => changed.push(saved) },
      setAutomaticUpdates() {}, showErrorBox: () => assert.fail("no error expected") });
    assert.equal(menu.submenu[0]!.checked, false);
    (menu.submenu[1] as Clickable).click({ checked: true });
    assert.equal(changed[0]!.crashes, true);
    const stored = JSON.parse(fs.readFileSync(preferencePath, "utf8"));
    assert.equal(stored.automaticUpdates, false, "sibling preferences survive");
    assert.equal(stored.productTelemetry.crashes, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function installedMenu() {
  const sharing = [{ label: "Send crash reports to Tovu", checked: false }, { label: "Send usage statistics to Tovu", checked: false }];
  const other = { label: "Automatic updates", checked: true };
  return { sharing, other, port: { getApplicationMenu: () => ({ items: [{ submenu: null }, {}, { submenu: { items: [other, ...sharing] } }] }) } };
}

test("after the first-run dialog the installed sharing checkboxes follow the stored consent in place", () => {
  const { sharing, other, port } = installedMenu();
  refreshProductMenu({ menu: port, preferencePath: "/p" }, { readSharing: () => ({ ...OFF, crashes: true, usage: true }) });
  assert.deepEqual(sharing.map(item => item.checked), [true, true]);
  assert.equal(other.checked, true, "unrelated checkboxes are untouched");
  refreshProductMenu({ menu: port, preferencePath: "/p" }, { readSharing: () => ({ ...OFF, crashes: true }) });
  assert.deepEqual(sharing.map(item => item.checked), [true, false]);
});

test("with no installed menu the refresh does nothing", () => {
  refreshProductMenu({ menu: { getApplicationMenu: () => null }, preferencePath: "/p" }, { readSharing: () => OFF });
});

test("the refresh reads the real file by default: a missing file is OFF", () => {
  const { sharing, port } = installedMenu();
  sharing[0]!.checked = true;
  refreshProductMenu({ menu: port, preferencePath: path.join(os.tmpdir(), "missing-dir-x", "p.json") });
  assert.deepEqual(sharing.map(item => item.checked), [false, false]);
});

function ownServer({ platform = "darwin" as NodeJS.Platform, recents = [] as string[] } = {}) {
  const opened: string[] = [];
  const settings = { label: "Settings" };
  const template = ownServerMenuTemplate({ platform, recents, settings,
    openNewSite: () => opened.push("new"), openRecent: ({ dir }) => opened.push(dir) });
  return { template, opened, settings };
}

test("own-server menu: macOS gets the app menu first; other platforms start at File", () => {
  assert.deepEqual(ownServer().template.map(item => item.role ?? item.label), ["appMenu", "File", "editMenu", "Settings", "windowMenu"]);
  for (const platform of ["win32", "linux"] as const) {
    assert.deepEqual(ownServer({ platform }).template.map(item => item.role ?? item.label), ["File", "editMenu", "Settings", "windowMenu"]);
  }
});

test("own-server menu carries the given Settings menu unchanged", () => {
  const { template, settings } = ownServer();
  assert.equal(template[3], settings);
});

function fileMenu(template: MenuItemConstructorOptions[]) {
  const file = template.find(item => item.label === "File");
  assert.ok(file && Array.isArray(file.submenu));
  return file.submenu;
}

test("File › Open Site… is Cmd/Ctrl+O and opens a new site", () => {
  const { template, opened } = ownServer();
  const [openSite, , separator, close] = fileMenu(template);
  assert.equal(openSite!.label, "Open Site…");
  assert.equal(openSite!.accelerator, "CmdOrCtrl+O");
  (openSite as Clickable).click({ checked: false });
  assert.deepEqual(opened, ["new"]);
  assert.equal(separator!.type, "separator");
  assert.equal(close!.role, "close");
});

test("Open Recent lists each recent site and opens the one clicked", () => {
  const { template, opened } = ownServer({ recents: ["/sites/a", "/sites/b"] });
  const recent = fileMenu(template)[1]!;
  assert.ok(Array.isArray(recent.submenu));
  assert.deepEqual(recent.submenu.map(item => item.label), ["/sites/a", "/sites/b"]);
  (recent.submenu[1] as Clickable).click({ checked: false });
  assert.deepEqual(opened, ["/sites/b"]);
});

test("Open Recent with no recent sites shows one disabled placeholder", () => {
  const recent = fileMenu(ownServer({ recents: [] }).template)[1]!;
  assert.deepEqual(recent.submenu, [{ label: "No recent sites", enabled: false }]);
});
