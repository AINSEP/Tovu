import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * @file End-to-end coverage for `apps/desktop`, driven through Playwright's Electron driver.
 *
 * Until this file existed, `apps/desktop` had never been launched — every commit in it was
 * verified by unit test or by reading. These specs run the real application: the real
 * `BrowserWindow`s, the real `tovu serve` children, the real site-dir store and crash registry.
 *
 * **The native folder picker is stubbed, and that is the point.** `main.cjs`'s "Open Site…" calls
 * `dialog.showOpenDialog`, which no automation can drive. `app.evaluate()` runs inside Electron's
 * main process, so the stub replaces that one method with a function returning the folder this test
 * chose — every other step (classification, `tovu init`, MRU write, spawn, window load) is the
 * shipping code path, unmocked. Stubbing the dialog is what makes the rest reachable; stubbing
 * anything past it would make the test worthless.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DESKTOP_DIR = path.join(REPO_ROOT, "apps", "desktop");
const ELECTRON_BIN = path.join(DESKTOP_DIR, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");

/** Each launch gets its own `TOVU_DESKTOP_STATE_DIR`-style scratch home so one spec's MRU and crash
 *  registry can never decide another spec's precedence. `resolveSiteDir` step 2 reads the MRU before
 *  the dev fallback, so a leaked entry would silently reroute a later test to the wrong site. */
function scratchHome(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tovu-desktop-e2e-${label}-`));
}

function emptySiteFolder(label: string): string {
  const dir = path.join(scratchHome(label), "new-site");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchShell(env: Record<string, string>): Promise<ElectronApplication> {
  return await electron.launch({
    executablePath: ELECTRON_BIN,
    args: ["."],
    cwd: DESKTOP_DIR,
    env: { ...process.env, ...env } as Record<string, string>,
    timeout: 150_000,
  });
}

test.describe("apps/desktop shell", () => {
  test("opens an already-initialized site and loads its own admin", async () => {
    const siteDir = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites", "site-alpha");
    test.skip(!fs.existsSync(path.join(siteDir, "config.json")), `fixture site missing at ${siteDir}`);

    const app = await launchShell({
      HOME: scratchHome("open-existing"),
      TOVU_DESKTOP_SITE_DIR: siteDir,
    });
    try {
      const win = await app.firstWindow({ timeout: 150_000 });
      await win.waitForLoadState("domcontentloaded");
      // The shell must load the port its OWN child reported, never a hardcoded or dev-server port.
      expect(win.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\/$/);
      expect(await win.title()).toBe("Tovu Admin");
    } finally {
      await app.close();
    }
  });

  test("'Open Site…' onto an EMPTY folder creates a real site and serves it", async () => {
    /**
     * Drives the actual user flow, and the ordering here is the whole trick. The stub CANNOT be
     * installed before launch — `app.evaluate` only runs once Electron is up, by which time a
     * shell with no site would already have shown the startup picker. So this launches against a
     * site that exists (no picker at startup), THEN stubs the dialog, THEN fires the real
     * File > "Open Site…" menu item, and asserts a SECOND window appears on a newly created site.
     * Everything past `dialog.showOpenDialog` — classification, `tovu init`, the MRU write, the
     * keyed serializer, the spawn, the window — is the shipping path.
     */
    const existing = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites", "site-alpha");
    test.skip(!fs.existsSync(path.join(existing, "config.json")), `fixture site missing at ${existing}`);
    const target = emptySiteFolder("open-empty");

    const app = await launchShell({
      HOME: scratchHome("open-empty-home"),
      TOVU_DESKTOP_SITE_DIR: existing,
    });
    try {
      const first = await app.firstWindow({ timeout: 150_000 });
      await first.waitForLoadState("domcontentloaded");

      await app.evaluate(async ({ dialog, Menu }, chosen) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
        const item = Menu.getApplicationMenu()
          ?.items.find((i) => i.label === "File")
          ?.submenu?.items.find((i) => i.label === "Open Site…");
        if (!item) throw new Error("File > 'Open Site…' not found in the application menu");
        item.click();
      }, target);

      await expect.poll(() => app.windows().length, { timeout: 150_000 }).toBe(2);

      // `tovu init` must have written the site's own marker files into the chosen folder.
      expect(fs.existsSync(path.join(target, "config.json"))).toBe(true);
      expect(fs.existsSync(path.join(target, "content.db"))).toBe(true);

      const opened = app.windows().find((w) => w !== first);
      if (!opened) throw new Error("no second window");
      await opened.waitForLoadState("domcontentloaded");
      expect(opened.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\/$/);
    } finally {
      await app.close();
    }
  });

  test("two sites open as two windows on two distinct ports", async () => {
    const root = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites");
    const alpha = path.join(root, "site-alpha");
    const beta = path.join(root, "site-beta");
    test.skip(
      !fs.existsSync(path.join(alpha, "config.json")) || !fs.existsSync(path.join(beta, "config.json")),
      "both fixture sites are required",
    );

    const app = await launchShell({
      HOME: scratchHome("two-sites"),
      TOVU_DESKTOP_SITE_DIRS: `${alpha},${beta}`,
    });
    try {
      await app.firstWindow({ timeout: 150_000 });
      await expect.poll(() => app.windows().length, { timeout: 150_000 }).toBe(2);

      const urls = await Promise.all(
        app.windows().map(async (w) => {
          await w.waitForLoadState("domcontentloaded");
          return w.url();
        }),
      );
      const ports = urls.map((u) => new URL(u).port);
      // Two sites sharing a port would mean one child silently lost its bind.
      expect(new Set(ports).size).toBe(2);
      for (const u of urls) expect(u).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/admin\/$/);
    } finally {
      await app.close();
    }
  });

  test("TOVU_DESKTOP_SITE_DIR onto an empty folder initializes it, like the picker does", async () => {
    /**
     * REGRESSION (found 2026-09-06, currently RED).
     *
     * The picker arm is FINE — the test above proves "Open Site…" onto an empty folder really does
     * run `tovu init` and serve the result. The defect is in the two env-var arms only:
     * `resolveSiteDir`'s first branch is `if (envDir) return envDir`, so the path is returned raw and
     * never reaches `adoptSiteDir`; `main.cjs`'s `TOVU_DESKTOP_SITE_DIRS` bypasses `adoptSiteDir` the
     * same way. Either one pointed at an empty folder hands it straight to `tovu serve`, which dies
     * `SITE_DIR_INVALID: config.json is missing`, and no window ever opens.
     *
     * This repo's most common defect shape is a fix landing in one arm of a conditional and not its
     * siblings — the `TOVU_SITE_DIR` crash fix went into `serve`, then `init` (`9f0b5913`), and these
     * are the arms it still has not reached. The env arm's own doc says an operator override is
     * "taken as given", so initializing may not be the right fix; failing with a message that names
     * the real problem would also close it. What is not defensible is the current behavior, where a
     * folder the picker would happily turn into a site is rejected with a low-level error purely
     * because of which entry point named it.
     *
     * Short timeout on purpose: the failure mode is the app dying before it ever opens a window, so
     * this must fail in seconds rather than sitting out the suite-level 180s.
     */
    const target = emptySiteFolder("env-empty");
    const app = await launchShell({
      HOME: scratchHome("env-empty-home"),
      TOVU_DESKTOP_SITE_DIR: target,
    });
    // The app exits on this path, so race the window against the process to avoid a hang.
    const exited = new Promise<"exited">((resolve) => app.process().once("exit", () => resolve("exited")));
    try {
      const outcome = await Promise.race([
        app.firstWindow({ timeout: 60_000 }).then(() => "window" as const),
        exited,
      ]);
      expect(outcome, "the shell exited instead of opening a window on the new site").toBe("window");
      expect(fs.existsSync(path.join(target, "config.json"))).toBe(true);
    } finally {
      await app.close().catch(() => {});
    }
  });

  test("a site created through the shell comes up AUTHENTICATED — no login form", async () => {
    /**
     * The desktop app must just come up. `apps/desktop/src/desktop-auth.cjs` seeds the site it
     * spawns with its own generated owner password and logs in over loopback before the window
     * loads, so the session cookie is already in that window's own jar by the time the admin's
     * first request goes out.
     *
     * **This creates a NEW site rather than reusing a fixture, and that is the honest test.** The
     * mechanism covers sites the shell SEEDS. A site folder already seeded by someone else keeps
     * its existing owner password — `seedIdentity` returns early on that — so it still shows the
     * login form by design, and asserting otherwise against a shared fixture would either fail
     * forever or quietly depend on which test had run first.
     *
     * The load-bearing assertion is `GET /api/admin/v1/auth/me` **from inside the page**, not from
     * the test runner. That is the real gate — `requireAdminSession` -> `validateSession` against a
     * real `sessions` row — reached through the window's real cookie jar. A check for the absence
     * of a login form would pass just as happily against a blank page, an error page, or an admin
     * that had not finished booting; a 200 naming the principal cannot.
     */
    const existing = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites", "site-alpha");
    test.skip(!fs.existsSync(path.join(existing, "config.json")), `fixture site missing at ${existing}`);
    const target = emptySiteFolder("authenticated");

    const app = await launchShell({
      HOME: scratchHome("authenticated-home"),
      TOVU_DESKTOP_SITE_DIR: existing,
      // An exported owner password is honored as-is by `ensureSiteCredential`, which would make
      // this assert against the developer's shell rather than the shell's own generated secret.
      TOVU_ADMIN_PASSWORD: "",
    });
    try {
      const first = await app.firstWindow({ timeout: 150_000 });
      await first.waitForLoadState("domcontentloaded");

      await app.evaluate(async ({ dialog, Menu }, chosen) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
        const item = Menu.getApplicationMenu()
          ?.items.find((i: { label: string }) => i.label === "File")
          ?.submenu?.items.find((i: { label: string }) => i.label === "Open Site…");
        if (!item) throw new Error("File > 'Open Site…' not found in the application menu");
        item.click();
      }, target);

      await expect.poll(() => app.windows().length, { timeout: 150_000 }).toBe(2);
      const opened = app.windows().find((w) => w !== first);
      if (!opened) throw new Error("no second window");
      await opened.waitForLoadState("domcontentloaded");

      // The shell recorded a credential beside the site's own database, not under userData — so a
      // cleared profile cannot orphan the owner it just seeded.
      expect(fs.existsSync(path.join(target, ".tovu-desktop-auth.json"))).toBe(true);

      const me = await opened.evaluate(async () => {
        const response = await fetch("/api/admin/v1/auth/me", { credentials: "include" });
        return { status: response.status, body: response.ok ? await response.json() : null };
      });

      expect(me.status, "the admin window is not authenticated — a login form is what the user sees").toBe(200);
      expect(me.body?.user?.username).toBe("admin");
      // Arrived authenticated, not unauthenticated-but-ungated: RBAC still resolves real grants.
      expect(Array.isArray(me.body?.effectivePermissions)).toBe(true);
      expect(me.body.effectivePermissions.length).toBeGreaterThan(0);

      expect(await opened.locator('input[type="password"]').count()).toBe(0);
    } finally {
      await app.close();
    }
  });
});
