import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * @file `apps/desktop` Electron shell E2E — the first suite that runs that app as an application
 * rather than as unit-tested modules.
 *
 * Why this needs its own config, rather than a project in `playwright.config.ts`:
 *
 * 1. **There is no `webServer` and there must not be one.** Every sibling config boots a Tovu
 *    server and points a browser at it. This suite's subject is the shell that spawns `tovu serve`
 *    ITSELF, one child per open site, on ports it self-allocates. A `webServer` here would prove
 *    nothing about the thing under test and would collide with the children the shell starts.
 * 2. **The driver is `_electron`, not `chromium`.** No `projects`/`devices` entry applies — the
 *    specs launch the Electron binary directly and receive its real `BrowserWindow`s. That also
 *    means the macOS Screen Recording permission is irrelevant here: window contents come back
 *    over the automation channel, not through `screencapture` (which returns bare wallpaper on this
 *    machine, and whose `-l<windowid>` form fails outright, because Terminal has not been granted
 *    that permission).
 * 3. **Electron lives in `apps/desktop/node_modules`, not the repo root.** Playwright's default
 *    resolution looks for a root-level `electron` and reports "executablePath not found"; the specs
 *    pass an explicit path. Do not "fix" that by installing electron at the root — see the no-installs
 *    rule below.
 *
 * `fullyParallel` is OFF and `workers` is 1 deliberately. Each spec launches a real Electron app
 * that spawns real `tovu serve` children and writes a shared crash-recovery registry
 * (`site-registry.cjs`). Two concurrent launches would reconcile each other's live children as
 * orphans and kill them mid-test — the reconcile is working as designed; running it against itself
 * is the mistake.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /desktop-shell\.spec\.ts/,
  /**
   * 180s. An own-server launch is not a page load: it spawns Tovu's CLI under `tsx`, which
   * typechecks nothing but does load the whole server graph from TypeScript source, boots the site
   * dir, runs migrations, and starts the agent daemon before it prints its ready line. Measured
   * cold on this machine at well over a minute for the first site of a run.
   */
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  /**
   * 0, not CI's usual 2. These tests create sites on disk and leave a persistent MRU + registry
   * behind; a silent retry would run the second attempt against state the first one already
   * mutated, turning a real failure into a confusing pass or vice versa.
   */
  retries: 0,
  reporter: [["list"]],
  metadata: { repoRoot: REPO_ROOT },
});
