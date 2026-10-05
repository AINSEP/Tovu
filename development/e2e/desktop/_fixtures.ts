// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { initSiteDir } from "../../../apps/desktop/src/site-dir-store.ts";
import { SITE_ORIGIN, sitesFilePath, trackSite } from "../../../apps/desktop/src/tracked-sites.ts";

/**
 * Shared harness for every `*.desktop.ts` journey (SCOPE.md §3.2, E2E-H2 minimal stand-in).
 *
 * Lifted by copy from `development/e2e/desktop-shell.spec.ts` (that spec is not edited): the explicit
 * Electron path, the scratch `TOVU_DESKTOP_USER_DATA_DIR` per launch and the guard that refuses to
 * run against the operator's real userData. Added here:
 *  - a SCRUBBED env built from an allowlist, not `...process.env`, so the operator's `.env` values
 *    (real root key, vendor keys, `TOVU_ADMIN_PASSWORD`, `NODE_OPTIONS`) never reach the app or the
 *    `tovu serve` children it spawns. The root key is a fixed fake (`"a".repeat(64)`, the
 *    `playwright.media-providers.config.ts` precedent). `TOVU_ADMIN_PASSWORD` is left UNSET on
 *    purpose: the desktop signs in with the per-launch boot token, and a set password changes how a
 *    site seeds its owner.
 *  - `TOVU_ADMIN_DEV_PORT=0`, which `src/admin-dev-proxy.ts` treats as "no candidates", so the guest
 *    admin comes from the site server's `apps/admin/dist` and never from someone's :5173 Vite.
 *  - blank-window guards installed in the MAIN process on every webContents (host window and
 *    `<webview>` guests): uncaught renderer errors, `render-process-gone`, and `did-fail-load`
 *    (except -3, an aborted navigation). Checked by {@link closeDesktop}.
 *  - a preload-bridge presence check (`window.tovuRunner`), which catches a stale preload build.
 *
 * NO single-instance lock is assumed anywhere (owner ruling 2026-09-20): every launch gets its own
 * userData and several may run at once (`multi-instance.desktop.ts`).
 *
 * The checkout's own `sites/tovu-dev` may appear as a seeded card (`seedDevFallbackSite` in
 * `main.ts`). Journeys address cards by their own fixture names only and never touch that card.
 */
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
export const DESKTOP_DIR = path.join(REPO_ROOT, "apps", "desktop");
const desktopRequire = createRequire(path.join(DESKTOP_DIR, "package.json"));
export const ELECTRON_BIN: string = desktopRequire("electron");

/** The one real userData directory no journey may touch. */
export const REAL_USER_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "tovu-desktop");

const FAKE_ROOT_KEY = "a".repeat(64);

/** Env keys copied from the runner; everything else is dropped. */
const ENV_ALLOWLIST = ["PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "TERM"];

/** A fresh scratch directory under the OS temp dir. */
export function scratchDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tovu-desktop-journey-${label}-`));
}

/** An empty folder, for the "create" and "refuse" paths. */
export function emptyFolder(label: string): string {
  const dir = path.join(scratchDir(label), "folder");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A real initialized site (`tovu init` through the shipping store), named `name`. Slow (the CLI
 * boots under tsx), so call it from `beforeAll`.
 */
export async function makeSite(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  await initSiteDir({ repoRoot: REPO_ROOT, dir, name, cliMode: "source", baseEnv: { ...scrubbedEnv(), TOVU_SITE_DIR: dir } });
  expect(fs.existsSync(path.join(dir, "config.json")), `${name}: config.json`).toBe(true);
  expect(fs.existsSync(path.join(dir, "content.db")), `${name}: content.db`).toBe(true);
  return dir;
}

function scrubbedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export interface DesktopLaunch {
  app: ElectronApplication;
  win: Page;
  userDataDir: string;
}

export interface LaunchOptions {
  /** Reuse a userData dir (relaunch journeys). Default: a fresh scratch dir. */
  userDataDir?: string;
  /** Site dirs written to the projects file before launch, as adopted cards. */
  trackedSites?: readonly string[];
  /** Extra env, applied last. */
  env?: Record<string, string>;
}

/** Launches the sites-home UI with a scrubbed env, the userData guard and the blank-window guards. */
export async function launchDesktop(options: LaunchOptions = {}): Promise<DesktopLaunch> {
  const userDataDir = options.userDataDir ?? scratchDir("userdata");
  for (const siteDir of options.trackedSites ?? []) trackSite(sitesFilePath(userDataDir), siteDir, SITE_ORIGIN.adopted);
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: ["."],
    cwd: DESKTOP_DIR,
    env: {
      ...scrubbedEnv(),
      HOME: scratchDir("home"),
      TOVU_DESKTOP_USER_DATA_DIR: userDataDir,
      TOVU_DESKTOP_UI: "runner",
      TOVU_DESKTOP_SITE_DIR: "",
      TOVU_DESKTOP_SITE_DIRS: "",
      TOVU_DESKTOP_URL: "",
      TOVU_DESKTOP_DISABLE_UPDATER: "1",
      TOVU_INTEGRATIONS_ROOT_KEY: FAKE_ROOT_KEY,
      TOVU_DISABLE_DEV_TLS: "1",
      TOVU_ADMIN_DEV_PORT: "0",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      GOOGLE_API_KEY: "",
      ...options.env,
    },
    timeout: 150_000,
  });
  const resolved = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
  if (resolved === REAL_USER_DATA_DIR) {
    await app.close();
    throw new Error(`e2e isolation failure: Electron resolved userData to the real ${REAL_USER_DATA_DIR}. Refusing to continue.`);
  }
  await installBlankWindowGuards(app);
  const win = await app.firstWindow({ timeout: 150_000 });
  await win.waitForLoadState("domcontentloaded");
  await expect(win.locator(".app")).toBeVisible();
  await expectPreloadBridge(win);
  return { app, win, userDataDir };
}

type Problems = string[];

/** Main-process hooks on every current and future webContents; findings land in `globalThis.__journeyProblems`. */
async function installBlankWindowGuards(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, webContents }) => {
    const state = globalThis as typeof globalThis & { __journeyProblems?: string[] };
    state.__journeyProblems = [];
    const watch = (contents: {
      getType(): string;
      getURL(): string;
      on(event: string, listener: (...args: never[]) => void): void;
    }) => {
      const label = () => `${contents.getType()} ${contents.getURL()}`;
      contents.on("render-process-gone", ((_event: unknown, details: { reason: string }) => {
        state.__journeyProblems!.push(`render-process-gone (${details.reason}) in ${label()}`);
      }) as never);
      contents.on("did-fail-load", ((_event: unknown, code: number, description: string, url: string, isMainFrame: boolean) => {
        if (code !== -3 && isMainFrame) state.__journeyProblems!.push(`did-fail-load ${code} ${description} ${url}`);
      }) as never);
      contents.on("console-message", ((details: { level?: string; message?: string }) => {
        if (details?.level === "error" && /^Uncaught\b/.test(details.message ?? "")) {
          state.__journeyProblems!.push(`uncaught in ${label()}: ${details.message}`);
        }
      }) as never);
    };
    for (const contents of webContents.getAllWebContents()) watch(contents);
    electronApp.on("web-contents-created", (_event: unknown, contents: Parameters<typeof watch>[0]) => watch(contents));
  });
}

/** Catches a stale preload: the bridge object is missing or a known method is undefined. */
export async function expectPreloadBridge(win: Page): Promise<void> {
  const bridge = await win.evaluate(() => {
    const runner = (window as unknown as { tovuRunner?: Record<string, unknown> }).tovuRunner;
    return runner ? { listSites: typeof runner.listSites } : null;
  });
  expect(bridge, "window.tovuRunner is missing: stale or broken preload").not.toBeNull();
  expect(bridge!.listSites).toBe("function");
}

/** Reads and clears the blank-window findings. */
export async function takeProblems(app: ElectronApplication): Promise<Problems> {
  return app.evaluate(() => {
    const state = globalThis as typeof globalThis & { __journeyProblems?: string[] };
    const found = [...(state.__journeyProblems ?? [])];
    state.__journeyProblems = [];
    return found;
  });
}

/** Asserts the window is still drawn and nothing blanked it, then closes the app. */
export async function closeDesktop(launch: DesktopLaunch): Promise<void> {
  try {
    if (!launch.win.isClosed()) await expect(launch.win.locator(".app"), "blank window: .app is gone").toBeVisible();
    expect(await takeProblems(launch.app), "renderer crashes, failed loads or uncaught errors").toEqual([]);
  } finally {
    await launch.app.close();
  }
}

/** One card on the sites home grid, by its exact display name. */
export function siteCard(win: Page, name: string): Locator {
  const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return win.locator(".card").filter({ has: win.locator(".card__name", { hasText: exact }) });
}

/** Presses the card's Start and waits for Running (a cold `tovu serve` under tsx is over a minute). */
export async function startSite(win: Page, name: string): Promise<void> {
  const card = siteCard(win, name);
  await card.getByRole("button", { name: `Start ${name}`, exact: true }).click();
  await expect(card.locator(".state")).toHaveText("Running", { timeout: 150_000 });
}

/** Opens the site's tab and waits for its admin guest to load. */
export async function openSiteTab(app: ElectronApplication, win: Page, name: string): Promise<void> {
  await siteCard(win, name).locator(".card__name").click();
  await expect(win.locator("webview")).toBeVisible();
  await expect.poll(() => guestUrl(app), { timeout: 60_000 }).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\//);
}

/** The first `<webview>` guest's URL, or null. Journeys open one site tab at a time. */
export async function guestUrl(app: ElectronApplication): Promise<string | null> {
  return app.evaluate(({ webContents }) => {
    const guest = webContents.getAllWebContents().find((c: { getType(): string }) => c.getType() === "webview");
    return guest ? (guest as { getURL(): string }).getURL() : null;
  });
}

/** Runs `code` in the first `<webview>` guest (the site's own page) and returns its result. */
export async function guestEval<T>(app: ElectronApplication, code: string): Promise<T> {
  return app.evaluate(async ({ webContents }, source) => {
    const guest = webContents.getAllWebContents().find((c: { getType(): string }) => c.getType() === "webview");
    if (!guest) throw new Error("no <webview> guest");
    return (guest as { executeJavaScript(code: string): Promise<unknown> }).executeJavaScript(source);
  }, code) as Promise<T>;
}

/** Types into whatever has focus inside the guest, through Chromium's real input path. */
export async function guestInsertText(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(async ({ webContents }, value) => {
    const guest = webContents.getAllWebContents().find((c: { getType(): string }) => c.getType() === "webview");
    if (!guest) throw new Error("no <webview> guest");
    (guest as { focus(): void }).focus();
    await (guest as { insertText(text: string): Promise<void> }).insertText(value);
  }, text);
}

/** `fetch` from inside the guest (its own origin and cookie jar), returning status and JSON body. */
export async function guestFetch(app: ElectronApplication, url: string): Promise<{ status: number; body: any }> {
  return guestEval(app, `(async () => {
    const r = await fetch(${JSON.stringify(url)}, { credentials: "include" });
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, body };
  })()`);
}

/**
 * Replaces Electron's native folder picker for the next calls. `null` = the operator cancelled.
 * Every step after the picker (classification, init, the projects file, spawn) is the shipping path.
 */
export async function stubFolderPicker(app: ElectronApplication, dir: string | null): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => (chosen === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [chosen] });
  }, dir);
}

/** Clicks an application-menu item by label (searched recursively), passing the first window as the focused window. */
export async function clickAppMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu, BrowserWindow }, wanted) => {
    type Item = { label: string; submenu?: { items: Item[] }; click: (event?: unknown, window?: unknown, contents?: unknown) => void };
    const find = (items: Item[] | undefined): Item | undefined => {
      for (const item of items ?? []) {
        if (item.label === wanted) return item;
        const nested = find(item.submenu?.items);
        if (nested) return nested;
      }
      return undefined;
    };
    const item = find(Menu.getApplicationMenu()?.items as Item[] | undefined);
    if (!item) throw new Error(`application menu item "${wanted}" not found`);
    const window = BrowserWindow.getAllWindows()[0];
    item.click(undefined, window, window?.webContents);
  }, label);
}

/** The sites list exactly as the renderer gets it from main (status, port, origin). */
export async function listSites(win: Page): Promise<Array<{ id: string; displayName: string; status: string; port: number; installDir: string; deleteErasesFiles: boolean }>> {
  return win.evaluate(() => (window as unknown as { tovuRunner: { listSites(): Promise<unknown> } }).tovuRunner.listSites()) as never;
}

/** True when something answers HTTP on `port` on loopback. */
export async function portAnswers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3_000) });
    return true;
  } catch {
    return false;
  }
}
