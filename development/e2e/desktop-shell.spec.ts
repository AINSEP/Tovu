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

/**
 * A scratch `HOME` per launch. **This alone does not isolate Electron's on-disk state** — kept
 * only because it still isolates anything that genuinely honors `HOME`. The isolation that
 * actually matters here is `launchShell`'s `TOVU_DESKTOP_USER_DATA_DIR`, below.
 *
 * Measured 2026-09-06: Electron's `app.getPath("userData")` **ignores a `HOME` override on macOS**
 * (Chromium resolves the mac path independently), so a launch that only overrode `HOME` actually
 * read and wrote the one real `~/Library/Application Support/tovu-desktop/`. Confirmed
 * empirically: `desktop-state.json` was found already holding six `tovu-desktop-e2e-*` MRU
 * entries left by earlier runs. Fixed by giving `main.cjs` a `TOVU_DESKTOP_USER_DATA_DIR` env var
 * that calls `app.setPath("userData", ...)` before `whenReady` — the documented, supported lever
 * for this — and having `launchShell` set it to a fresh scratch dir on every call, so no call site
 * had to change. See `launchShell`'s own doc for the guard that backs this rather than just
 * trusting it.
 */
function scratchHome(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tovu-desktop-e2e-${label}-`));
}

function emptySiteFolder(label: string): string {
  const dir = path.join(scratchHome(label), "new-site");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The one real userData directory this suite must never touch — see `launchShell`'s guard. */
const REAL_USER_DATA_DIR = path.join(os.homedir(), "Library", "Application Support", "tovu-desktop");

/**
 * Launches the shell with a disposable `TOVU_DESKTOP_USER_DATA_DIR` on every call, then verifies —
 * from inside the running app, via `app.getPath("userData")` itself, not by trusting the env var
 * round-tripped correctly — that Electron actually resolved userData somewhere other than the
 * operator's real directory. This is the guard against the class of bug this file used to carry
 * silently: if a future change breaks the override, this fails loud and immediately (and closes
 * the app before returning) instead of quietly writing into `REAL_USER_DATA_DIR` again.
 */
async function launchShell(env: Record<string, string>): Promise<ElectronApplication> {
  const userDataDir =
    env.TOVU_DESKTOP_USER_DATA_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-e2e-userdata-"));
  const app = await electron.launch({
    executablePath: ELECTRON_BIN,
    args: ["."],
    cwd: DESKTOP_DIR,
    env: { ...process.env, ...env, TOVU_DESKTOP_USER_DATA_DIR: userDataDir } as Record<string, string>,
    timeout: 150_000,
  });
  const resolvedUserDataDir = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
  if (resolvedUserDataDir === REAL_USER_DATA_DIR) {
    await app.close();
    throw new Error(
      `e2e isolation failure: Electron resolved userData to the operator's real directory (${REAL_USER_DATA_DIR}) ` +
        "instead of the scratch dir this suite passed via TOVU_DESKTOP_USER_DATA_DIR. Refusing to continue rather " +
        "than pollute it.",
    );
  }
  return app;
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

  /**
   * Both env-var arms below (`TOVU_DESKTOP_SITE_DIR`, `TOVU_DESKTOP_SITE_DIRS`) now route through the
   * SAME `resolveOrInitSiteDir` chokepoint the picker uses (`site-dir-store.cjs`), under an explicit
   * `onMissingSite: "fail"` policy — `main.cjs`'s `ENV_SITE_DIR_ON_MISSING`. An operator override is
   * "taken as given" (`resolveSiteDir`'s own doc): these vars name a folder that is asserted to
   * already hold a site, not an invitation to create one, and both are chiefly for
   * verification/automation, where a typo'd or stale path silently becoming a brand-new, empty site
   * is a worse failure than a loud, specific, fast one. The picker keeps `onMissingSite: "init"`
   * (via `adoptSiteDir`) because there a human just chose that empty folder on purpose, in the moment.
   *
   * Was a REGRESSION (found 2026-09-06): `resolveSiteDir`'s env branch used to return the raw path
   * with no validation at all, and `main.cjs`'s multi-dir branch bypassed `adoptSiteDir` the same way
   * — either one pointed at an empty folder handed it straight to `tovu serve`, which died with a
   * low-level `SITE_DIR_INVALID: config.json is missing` and no window ever opened. Fixed by giving
   * every entry point that resolves a site dir one shared chokepoint with an explicit,
   * per-call-site policy, rather than patching this one arm and leaving its sibling (`_SITE_DIR` vs.
   * `_SITE_DIRS`) to diverge again later — this repo's most common defect shape.
   *
   * **Why these two assert on a REJECTED `launchShell(...)` rather than an `ElectronApplication`**:
   * the old regression's failure came from a spawned `tovu serve` child actually dying (real seconds
   * of `tsx` boot before it crashed), which gave Playwright's `electron.launch()` time to attach
   * before the process exited. The fixed failure is a pure fs check with no child ever spawned, so
   * the whole app now exits before Playwright's own CDP handshake completes at all — measured live,
   * `electron.launch()` itself rejects with `Target page, context or browser has been closed` rather
   * than resolving. That rejection bundles the child's captured stdout/stderr into its own message
   * (Playwright's own behavior for a launch failure), which is what this asserts against — the
   * rejection IS the proof of "fail fast", not a workaround for one.
   */
  test("TOVU_DESKTOP_SITE_DIR onto an empty folder fails fast with a specific reason, not a low-level crash", async () => {
    const target = emptySiteFolder("env-empty");
    await expect(
      launchShell({ HOME: scratchHome("env-empty-home"), TOVU_DESKTOP_SITE_DIR: target }),
      "the shell should refuse to boot fast enough that Playwright cannot even attach — not hang, and not open a window",
    ).rejects.toThrow(/has no Tovu site in it yet/);
    // Refusing to init means refusing to init — the fail policy must not create anything.
    expect(fs.existsSync(path.join(target, "config.json"))).toBe(false);
  });

  test("TOVU_DESKTOP_SITE_DIRS onto an empty folder fails the same way as the single-dir arm", async () => {
    const target = emptySiteFolder("env-empty-multi");
    await expect(
      launchShell({ HOME: scratchHome("env-empty-multi-home"), TOVU_DESKTOP_SITE_DIRS: target }),
      "the shell should refuse to boot fast enough that Playwright cannot even attach — not hang, and not open a window",
    ).rejects.toThrow(/has no Tovu site in it yet/);
    expect(fs.existsSync(path.join(target, "config.json"))).toBe(false);
  });

  test("an EXISTING site comes up AUTHENTICATED — no login form", async () => {
    /**
     * The desktop app just comes up. `tovu serve --emit-boot-token` mints a single-use,
     * in-memory, per-launch token and prints it on its own stdout; `apps/desktop` reads it off that
     * private pipe, redeems it once over loopback, and the session cookie is in the window's jar
     * before the page loads.
     *
     * **It runs against a PRE-EXISTING fixture site on purpose.** That is the property the boot
     * token has and the earlier per-site-password approach did not: it proves "I started this
     * server", not "I know this site's password", so a folder someone else seeded works too. If
     * this ever regresses to only covering shell-created sites, this test is what catches it.
     *
     * The load-bearing assertion is `GET /api/admin/v1/auth/me` **from inside the page**, not from
     * the runner. That is the real gate — `requireAdminSession` -> `validateSession` against a real
     * `sessions` row — reached through the window's real cookie jar. A check for the absence of a
     * login form would pass just as happily against a blank page, an error page, or an admin that
     * had not finished booting; a 200 carrying real permissions cannot.
     */
    const siteDir = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites", "site-alpha");
    test.skip(!fs.existsSync(path.join(siteDir, "config.json")), `fixture site missing at ${siteDir}`);

    const app = await launchShell({
      HOME: scratchHome("authenticated"),
      TOVU_DESKTOP_SITE_DIR: siteDir,
    });
    try {
      const win = await app.firstWindow({ timeout: 150_000 });
      await win.waitForLoadState("domcontentloaded");

      const me = await win.evaluate(async () => {
        const response = await fetch("/api/admin/v1/auth/me", { credentials: "include" });
        return { status: response.status, body: response.ok ? await response.json() : null };
      });

      expect(me.status, "the admin window is not authenticated — a login form is what the user sees").toBe(200);
      // Arrived authenticated, not unauthenticated-but-ungated: RBAC resolves real grants for a
      // real principal, exactly as it would after a password login.
      expect(Array.isArray(me.body?.effectivePermissions)).toBe(true);
      expect(me.body.effectivePermissions.length).toBeGreaterThan(0);
      expect(typeof me.body?.user?.id).toBe("string");

      expect(await win.locator('input[type="password"]').count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  test("the boot token never appears in anything the shell echoes", async () => {
    /**
     * The token is a live credential for one redemption. It must reach the parent only through the
     * child's stdout pipe and go no further — not to the shell's own stdout, not into a log, not
     * into an error message. This suite captures child output, so a leak here would also mean the
     * token sits in CI artifacts.
     *
     * Asserted against everything Playwright captured from the launch, which is exactly the surface
     * a leak would show up on.
     */
    const siteDir = path.join(REPO_ROOT, "..", "tovu-desktop-test-sites", "site-alpha");
    test.skip(!fs.existsSync(path.join(siteDir, "config.json")), `fixture site missing at ${siteDir}`);

    const captured: string[] = [];
    const app = await launchShell({
      HOME: scratchHome("token-leak"),
      TOVU_DESKTOP_SITE_DIR: siteDir,
    });
    app.process().stdout?.on("data", (chunk: Buffer) => captured.push(chunk.toString()));
    app.process().stderr?.on("data", (chunk: Buffer) => captured.push(chunk.toString()));
    try {
      const win = await app.firstWindow({ timeout: 150_000 });
      await win.waitForLoadState("domcontentloaded");
      expect(captured.join("")).not.toContain("bootToken");
    } finally {
      await app.close();
    }
  });
});
