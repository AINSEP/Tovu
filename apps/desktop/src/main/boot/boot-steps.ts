/**
 * @file The decision-bearing steps of `main.ts`'s launch — its import-time `userData`/toolchain
 * setup and the `whenReady` body — extracted so each runs against fakes. Electron's `app`, the
 * filesystem, `process.env` and the tracked-sites / owner-store modules arrive as ports; the pure
 * env reads in `startup-env.ts` are imported directly.
 */
import path from "node:path";
import { sitesUiRequested, type StartupEnv } from "../../startup-env.ts";

/** `TOVU_DESKTOP_USER_DATA_DIR`, trimmed, or `undefined` when unset or blank. */
function userDataOverride(env: StartupEnv): string | undefined {
  return env.TOVU_DESKTOP_USER_DATA_DIR?.trim() || undefined;
}

/**
 * Point Electron's `userData` at this launch's profile and share it with CLI children.
 *
 * This launch's `userData`: the dev app's `tovu-desktop`, or a packaged build's own `Tovu` (see
 * `packaged-paths.ts`). Set explicitly because Electron's default is `package.json`'s name, which is
 * `tovu-desktop` in a packaged build too — the first release dmg listed the developer's live site
 * through it and ran a second server on its databases.
 *
 * Must run before `app.whenReady()`: Chromium locks `userData` at ready, and every consumer in
 * `main.ts` (crash registry, MRU state, tracked projects) calls `app.getPath("userData")` lazily from
 * inside the `whenReady` handler, so this only has to win the race against that, not against `require`.
 *
 * `TOVU_DESKTOP_USER_DATA_DIR` is E2E-only and wins over both. It exists because scoping the E2E
 * harness's own `HOME` env var does NOT isolate this app's on-disk state: `app.getPath("userData")`
 * resolves the macOS path independently of `HOME` (Chromium computes it directly), so every launch
 * that only overrode `HOME` was actually reading and writing the operator's real
 * `~/Library/Application Support/tovu-desktop/` — see `development/e2e/desktop-shell.spec.ts`'s own
 * header for how that was found (six stale `tovu-desktop-e2e-*` MRU entries in the real
 * `desktop-state.json`). Unset in every real launch.
 *
 * @param required.env the live `process.env`; rewritten in place when overridden.
 * @param required.resolvePath `path.resolve` (reads the launcher's cwd).
 * @returns `{ overridden }` — whether this launch runs on an E2E/scratch profile.
 * @complexity O(1).
 */
export function applyUserDataDir({ env, defaultUserDataDir, resolvePath, setUserDataDir, getUserDataDir }: {
  env: Record<string, string | undefined>;
  defaultUserDataDir: string;
  resolvePath: (dir: string) => string;
  setUserDataDir: (dir: string) => void;
  getUserDataDir: () => string;
}, _optional = {}): { overridden: boolean } {
  const override = userDataOverride(env);
  setUserDataDir(override ? resolvePath(override) : defaultUserDataDir);
  // Share the resolved profile with CLI children too; a relative override otherwise changes meaning
  // when a child runs from another cwd. Normal launches retain the shared Web/CLI app-data owner.
  if (override) env.TOVU_DESKTOP_USER_DATA_DIR = getUserDataDir();
  else delete env.TOVU_DESKTOP_USER_DATA_DIR;
  return { overridden: override !== undefined };
}

/**
 * The bundled node/npm/npx shims' env contract (`TOVU_NODE_TOOLCHAIN_DIR`, `TOVU_BUNDLED_NPM_ROOT`),
 * or `undefined` if writing them failed — see `node-toolchain.ts` and
 * `plan-desktop-bundled-npx-2026-09-24.md` §2, §6 S4. Written once, after `userData` is set
 * (the shims live under it) and before any site is served, then handed to every
 * `startTovuServer` call so a stdio MCP server naming `npx`/`npm`/`node` can be found
 * without a system Node install.
 *
 * Best-effort like every other `userData` write in `main.ts`: a failure here (a read-only volume, a
 * full disk) must degrade to the old identity behaviour — no bundled toolchain, same as before this
 * slice existed — never crash the app over a feature that is itself an upgrade.
 *
 * @param required.writeNodeToolchain `node-toolchain.ts`'s writer; `null` from a disk image. May throw.
 * @complexity O(1) beyond the writer's own I/O.
 */
export function prepareNodeToolchainEnv({ userDataDir, electronPath, npmRoot, writeNodeToolchain, buildNodeToolchainEnv, warn }: {
  userDataDir: string;
  electronPath: string;
  npmRoot: string;
  writeNodeToolchain: (input: { userDataDir: string; electronPath: string; npmRoot: string }) => { toolchainDir: string } | null;
  buildNodeToolchainEnv: (input: { toolchainDir: string; npmRoot: string }) => Record<string, string>;
  warn: (message: string) => void;
}, _optional = {}): Record<string, string> | undefined {
  try {
    const toolchain = writeNodeToolchain({ userDataDir, electronPath, npmRoot });
    if (toolchain) return buildNodeToolchainEnv({ toolchainDir: toolchain.toolchainDir, npmRoot });
    warn("tovu desktop: running from a disk image — the bundled node toolchain is off for this launch; move Tovu to Applications to use it.");
  } catch (error) {
    warn(`tovu desktop: could not write the bundled node toolchain — stdio MCP servers naming npx/npm/node will fall back to a system install: ${(error as Error).message}`);
  }
  return undefined;
}

/** Which of `main.ts`'s three boot modes this launch opens. */
export type BootMode = { kind: "sites-home" } | { kind: "attach"; url: string } | { kind: "own-server" };

/**
 * Choose the boot mode. Sites home is checked before every other mode: it supersedes both attach
 * and own-server, and it spawns no `tovu serve` of its own at boot — only when a project tab is
 * first opened, through `openSiteServer`'s own `serializer`-guarded spawn-or-reuse (the sites-home
 * counterpart of the `openSiteWindow` own-server mode uses). Attach mode is always exactly one window.
 * @complexity O(1).
 */
export function chooseBootMode({ env }: { env: StartupEnv }, _optional = {}): BootMode {
  if (sitesUiRequested({ env })) return { kind: "sites-home" };
  const url = env.TOVU_DESKTOP_URL?.trim();
  return url ? { kind: "attach", url } : { kind: "own-server" };
}

/**
 * Bring the dev-fallback site's tracked-sites row up to date before the Projects screen first reads it.
 *
 * Once, before the seed reads the file: a registry written before removals were RECORDED
 * cannot say whether the dev fallback below is absent because it was never seeded or because
 * the operator deleted its card, and the seed is about to ask exactly that. See
 * `migrateLegacyDismissals`' own doc for why this is the narrow, one-directory conversion it
 * is, and `main-project-wiring.test.ts` for the test that pins this call ahead of the seed.
 * Both dev-fallback calls are skipped outright when there is no dev fallback (a packaged
 * app). `migrateLegacyDismissals` in particular takes a DIRECTORY and would otherwise record
 * a literal `null` into the `dismissed` array — a corrupt row, not a no-op.
 *
 * A brand-new `userData` tracks nothing, so the Projects screen would otherwise show only
 * the "Add project" card forever until the operator ran "+ Create website" once. Seeding the
 * same dev-fallback site `resolveStartupSiteDirs` already falls back to (`sites/tovu-
 * com` in a checkout, absent in a packaged app) gives a real card on first launch instead —
 * mirroring that existing precedent rather than fabricating one. The guard is per-DIRECTORY
 * now, not the old "has this file ever been written": that one also blocked every legitimate
 * case, so nothing could ever be seeded or discovered again after the first write. A project
 * the operator removed still stays removed, from the recorded dismissal rather than from the
 * file's mere existence — see `seedDevFallbackSite`'s own doc.
 *
 * `classifySiteDirSafely`, not `classifySiteDir`: this step and `rescanSites` both
 * run inside the `whenReady()` chain, whose only handler is `reportBootFailure`, and both
 * run BEFORE `openSitesHomeWindow()`. The throwing form is for the folder PICKER, where the
 * dialog shows the operator the error; here one unreadable candidate quit the app before any
 * window existed, leaving no renderer for the Rescan button to live in (D-01).
 *
 * @returns whether any dev-fallback work ran (`false` in a packaged app).
 * @complexity O(1) beyond the three tracked-sites calls.
 */
export function settleDevFallbackRows<ClassifySiteDir>({ projectsPath, devFallbackDir, classifySiteDir, migrateLegacyDismissals, seedDevFallbackSite, retireDevFallbackSite }: {
  projectsPath: string;
  devFallbackDir: string | null;
  /** `site-dir-store.ts`'s `classifySiteDirSafely`, passed through to the seeders untouched. */
  classifySiteDir: ClassifySiteDir;
  migrateLegacyDismissals: (projectsPath: string, devFallbackDir: string) => unknown;
  seedDevFallbackSite: (projectsPath: string, devFallbackDir: string, classifySiteDir: ClassifySiteDir) => unknown;
  retireDevFallbackSite: (projectsPath: string, devFallbackDir: string, classifySiteDir: ClassifySiteDir) => unknown;
}, _optional = {}): boolean {
  if (!devFallbackDir) return false;
  migrateLegacyDismissals(projectsPath, devFallbackDir);
  seedDevFallbackSite(projectsPath, devFallbackDir, classifySiteDir);
  // And its inverse: once the dev site moved into the single home, the seeded checkout row is a dead card.
  retireDevFallbackSite(projectsPath, devFallbackDir, classifySiteDir);
  return true;
}

/**
 * The sites-home `discoverSites` dependency with its two independent cancellation lanes, plus the
 * `before-quit` abort of both. A new scan supersedes the previous scan of the SAME lane only.
 * @param required.discover `site-discovery.ts`'s `discoverDesktopSites`, bound to this launch's paths.
 * @complexity O(1) per call beyond the scan.
 */
export function createSiteDiscoveryLanes<T>({ discover }: {
  discover: (required: { scanRoots: string[] | undefined; signal: AbortSignal }) => Promise<T>;
}, _optional = {}) {
  let siteDiscoveryAbort: AbortController | undefined;
  let siteValidationAbort: AbortController | undefined;
  return {
    // `async`, as the inline original was: a synchronous throw from `discover` still rejects.
    async discoverSites({ scanRoots }: { scanRoots?: string[] }, _options = {}): Promise<T> {
      // Picker validation must not cancel a live rescan, or be cancelled by one.
      if (scanRoots) siteValidationAbort?.abort();
      else siteDiscoveryAbort?.abort();
      const current = new AbortController();
      if (scanRoots) siteValidationAbort = current;
      else siteDiscoveryAbort = current;
      return discover({ scanRoots, signal: current.signal });
    },
    /** `before-quit`: stop whatever scan of either lane is still running. */
    abortAll(_required = {}, _options = {}): void {
      siteDiscoveryAbort?.abort();
      siteValidationAbort?.abort();
    },
  };
}

/** The four files a legacy owner store consists of — the only files an empty one may lose. */
export const LEGACY_OWNER_STORE_FILES = ["owner.db", "owner.db-wal", "owner.db-shm", "owner.key"] as const;

/**
 * Desktop start: an empty legacy owner store (and its key, -wal, -shm) is deleted; one holding
 * keys is kept and the existing native notice says an import is available.
 *
 * @param required.settle `owner-store-ipc.ts`'s `settleLegacyOwnerStore` with its CLI `run` bound.
 * @param required.removeFile `fs.rmSync(file, { force: true })`.
 * @returns the settle promise; the caller does not await it.
 * @complexity O(1).
 */
export function settleLegacyOwnerStoreOnStart({ userDataDir, settle, removeFile, showNotice, warn }: {
  userDataDir: string;
  settle: (required: { removeFiles: () => void; notify: () => void; log: (message: string) => void }) => Promise<unknown>;
  removeFile: (filePath: string) => void;
  showNotice: (required: { type: "info"; message: string; detail: string }) => void;
  warn: (message: string) => void;
}, _optional = {}): Promise<unknown> {
  return settle({
    removeFiles: () => {
      for (const file of LEGACY_OWNER_STORE_FILES) removeFile(path.join(userDataDir, file));
    },
    notify: () => showNotice({ type: "info", message: "Shared keys from an older version can be imported",
      detail: "Open Shared keys and choose Import from this computer. You see what imports before anything changes." }),
    log: (message) => warn(message),
  });
}
