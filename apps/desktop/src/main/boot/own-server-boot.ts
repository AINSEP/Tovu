/**
 * @file Boot mode 2 — own server — and the crash-orphan reap that runs above every mode, extracted
 * from `main.ts`: which site dirs a launch opens and which one honours a pinned port, the order the
 * startup sites open in, and what a Dock click restores. Electron, the site-dir store, the
 * crash-safety registry and the serializer arrive as ports; `startup-env.ts`'s pure env reads are
 * imported directly.
 */
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";
import { explicitStartupSiteDirs, type CliMode, type RejectedDefault, type StartupEnv } from "../../startup-env.ts";

/** The per-launch inputs a site open reads — `main.ts`'s `SiteOpenCtx`. */
export interface OwnServerCtx {
  cliMode: CliMode;
  statePath: string;
  registryPath: string;
  /** Own-server mode only: the pinned `TOVU_DESKTOP_PORT`, set by {@link resolveStartupSiteDirs}. */
  firstSitePort?: number;
}

/**
 * The policy BOTH env-var arms below declare for a folder they name that turns out to be empty.
 *
 * `"fail"`, not `"init"`: `resolveSiteDir`'s own doc calls an env override "taken as given" — the
 * operator is asserting a site already lives there, not asking Tovu to invent one. These vars are
 * also named as chiefly for verification/automation (see `main.ts`'s header), where a typo'd or
 * stale path silently becoming a brand-new, empty site is a worse failure than a loud, specific error:
 * it would hide the mistake behind a window that opens showing nothing, rather than naming the exact
 * folder and reason immediately. The interactive picker is the one place `"init"` is right, because a
 * human just chose that empty folder on purpose, in the moment (see `adoptSiteDir`'s own doc).
 */
export const ENV_SITE_DIR_ON_MISSING = "fail";

/** `site-dir-store.ts`'s resolvers, with the shared-sites workspace already bound. */
export interface StartupSiteDirPorts {
  env: StartupEnv;
  repoRoot: string;
  devFallbackDir: string | null;
  resolveOrInitSiteDir: (input: { dir: string; onMissingSite: typeof ENV_SITE_DIR_ON_MISSING; repoRoot: string; cliMode: CliMode }) => Promise<string>;
  resolveSiteDir: (input: {
    envDir: string | undefined; onMissingSite: typeof ENV_SITE_DIR_ON_MISSING; statePath: string; devFallbackDir: string | null;
    repoRoot: string; cliMode: CliMode; pickDir: (rejectedDefault: RejectedDefault | null) => Promise<string | null>;
  }) => Promise<string>;
  /** `main.ts`'s `promptForSiteDir`. */
  pickDir: (rejectedDefault: RejectedDefault | null) => Promise<string | null>;
}

/** Resolves the site dir(s) to open at launch: `TOVU_DESKTOP_SITE_DIRS` (plural) wins outright when
 *  set — chiefly for verification/automation — otherwise the existing single-site precedence chain
 *  (`resolveSiteDir`) picks exactly one. Both env-var arms route through the same
 *  `resolveOrInitSiteDir`/`resolveSiteDir` chokepoint the picker uses, under the explicit policy
 *  {@link ENV_SITE_DIR_ON_MISSING} declares — see that constant's own doc for why.
 *
 *  Sets `ctx.firstSitePort` in the single-site case only (the plural arm leaves it untouched).
 *  @complexity O(n) in the explicit-dirs count, plus `resolveSiteDir`'s own cost in the single-site case. */
export async function resolveStartupSiteDirs({ ctx, ports }: { ctx: OwnServerCtx; ports: StartupSiteDirPorts }, _optional = {}): Promise<string[]> {
  const explicit = explicitStartupSiteDirs({ env: ports.env });
  if (explicit) {
    return await Promise.all(
      explicit.map((dir) => ports.resolveOrInitSiteDir({ dir, onMissingSite: ENV_SITE_DIR_ON_MISSING, repoRoot: ports.repoRoot, cliMode: ctx.cliMode })),
    );
  }

  const pinnedPort = ports.env.TOVU_DESKTOP_PORT?.trim();
  const siteDir = await ports.resolveSiteDir({
    envDir: ports.env.TOVU_DESKTOP_SITE_DIR,
    onMissingSite: ENV_SITE_DIR_ON_MISSING,
    statePath: ctx.statePath,
    // Correct for a developer, absent in a packaged app — one tier of a precedence chain rather
    // than a hardcoded default.
    devFallbackDir: ports.devFallbackDir,
    repoRoot: ports.repoRoot,
    cliMode: ctx.cliMode,
    // No `name`: `initSite` defaults it to the chosen folder's basename (BR-03).
    pickDir: ports.pickDir,
  });
  // Only the FIRST/only site honors a pinned port; every other open site still self-allocates so two
  // sites opened in the same launch never collide.
  ctx.firstSitePort = pinnedPort ? Number(pinnedPort) : undefined;
  return [siteDir];
}

/**
 * Reap every `tovu serve` a PREVIOUS launch left running, and say so. Called once per launch, ABOVE
 * the boot-mode split, before any window exists.
 *
 * It used to live inside {@link bootOwnServerMode}, which meant the sites home UI — the DEFAULT since
 * a53c80df — never reconciled anything at all. That is the mode where it matters most: opening a
 * project card calls `openSiteWindow`, which writes a crash-safety row, so the sites-home path has always
 * PRODUCED rows and never consumed them. A hard kill of Electron therefore stranded every open
 * site's child, the next launch reaped none of them, and clicking the same card allocated a fresh
 * port and started a SECOND `tovu serve` over the same `content.db`. Two writers on one sqlite file
 * is the part that mattered; the leaked port and memory were the visible symptom.
 *
 * Safe above the split for all three modes. Every mode resolves the same `registryPath` from the
 * same `userData`, so there is one registry to reconcile whichever way this launch goes, and attach
 * mode — which spawns nothing and records nothing — can only ever find rows a previous own-server or
 * sites-home launch left behind, exactly the rows that should be reaped. It cannot touch a CONCURRENT
 * instance's children: `reconcileOrphans` proves a row's process has actually been reparented to
 * launchd before terminating it (see `site-process-registry.ts`'s `isOrphanedProcess`), and never
 * rewrites a live sibling's registry file — each instance writes only its own.
 *
 * @complexity O(n) in persisted row count; each row's own cost is `terminateOrphan`'s bounded poll,
 *   so a launch can be delayed by up to that grace window per genuine orphan.
 */
export async function reconcileOrphansOnBoot({ registryPath, reconcileOrphans, log }: {
  registryPath: string;
  reconcileOrphans: (registryPath: string) => Promise<readonly { siteDir: string }[]>;
  log: (message: string) => void;
}, _optional = {}): Promise<void> {
  const reconciled = await reconcileOrphans(registryPath);
  if (reconciled.length === 0) return;
  log(
    `tovu desktop: reconciled ${reconciled.length} orphaned site process(es) left running by a previous crash: ${reconciled.map((row) => row.siteDir).join(", ")}`,
  );
}

/**
 * Whether a Dock click (`app` `activate`) should reopen something: only when no window is left and
 * no quit is draining. Shared by all three boot modes' `activate` handlers.
 * @complexity O(1).
 */
export function shouldReopenOnActivate({ windowCount, quitPhase }: { windowCount: number; quitPhase: QuitPhase }, _optional = {}): boolean {
  return windowCount === 0 && quitPhase === "idle";
}

/** The Electron, serializer and `openSites` effects own-server mode drives. */
export interface OwnServerBootPorts {
  /** `sharedSites.config({}).warning`. */
  sitesConfigWarning: () => { message: string; localHome: string } | undefined;
  warn: (message: string) => void;
  refreshAppMenu: (ctx: OwnServerCtx) => void;
  /** {@link resolveStartupSiteDirs} with its ports bound. */
  resolveStartupSiteDirs: (ctx: OwnServerCtx) => Promise<string[]>;
  selftest: boolean;
  /** Build the self-test tracker for `expectedCount` windows and install it for `createWindow`. */
  installSelftestTracker: (required: { expectedCount: number }) => void;
  /** `serializer.run(siteDir, work)`. */
  runSerialized: <T>(siteDir: string, work: () => Promise<T>) => Promise<T>;
  /** `main.ts`'s `openSiteWindow(siteDir, ctx, { port })`. */
  openSiteWindow: (required: { siteDir: string; ctx: OwnServerCtx }, optional: { port?: number }) => Promise<unknown>;
  /** `app.on("activate", listener)`. */
  onActivate: (listener: () => void) => void;
  windowCount: () => number;
  quitPhase: () => QuitPhase;
  /** The site dir of every `openSites` entry. */
  openSiteDirs: () => string[];
  promptAndOpenNewSite: (ctx: OwnServerCtx) => Promise<void>;
  reportBootFailure: (error: Error) => Promise<void>;
}

/**
 * The own-server `activate` handler: with no window left, reopen every site this process still
 * supervises (a macOS close keeps the server), or ask for one when none is open.
 * @complexity O(n) in open sites.
 */
export function createOwnServerActivate({ ctx, ports }: { ctx: OwnServerCtx; ports: OwnServerBootPorts }, _optional = {}): () => void {
  return () => {
    if (!shouldReopenOnActivate({ windowCount: ports.windowCount(), quitPhase: ports.quitPhase() })) return;
    const siteDirs = ports.openSiteDirs();
    if (siteDirs.length === 0) {
      void ports.promptAndOpenNewSite(ctx);
      return;
    }
    for (const siteDir of siteDirs) {
      if (siteDir) void ports.runSerialized(siteDir, () => ports.openSiteWindow({ siteDir, ctx }, {})).catch(ports.reportBootFailure);
    }
  };
}

/**
 * Boot mode 2 — own server. Build the menu, then open every startup site.
 *
 * Extracted from the `whenReady` handler rather than left inline: with a third boot mode added,
 * that one arrow carried every branch of all three and measured cyclomatic complexity 10 against
 * this repo's ceiling of 9. Splitting on the mode boundary is the natural cut — the three modes are
 * now three symmetric named things — and it is a pure move: no statement, order, or condition
 * below differs from what was inline.
 *
 * @param required.ctx built by the caller from this launch's `userData` and CLI mode.
 * @complexity O(n) in the number of startup site dirs, beyond each site's own boot cost.
 */
export async function bootOwnServerMode({ ctx, ports }: { ctx: OwnServerCtx; ports: OwnServerBootPorts }, _optional = {}): Promise<void> {
  const warning = ports.sitesConfigWarning();
  if (warning) ports.warn(`[tovu-desktop] ${warning.message} Choose appData in Sites settings or use ${warning.localHome}.`);

  ports.refreshAppMenu(ctx);

  const siteDirs = await ports.resolveStartupSiteDirs(ctx);
  // Seeded with the FULL count before any window opens — see `selftest-tracker.ts`'s own header,
  // hazard 2, for why an incrementally-built count would settle early on a multi-site launch.
  if (ports.selftest) ports.installSelftestTracker({ expectedCount: siteDirs.length });
  for (const [index, siteDir] of siteDirs.entries()) {
    // Only the FIRST site in this launch's list ever honors a pinned port — see
    // `resolveStartupSiteDirs` and `openSiteWindow`'s own doc on why.
    const port = index === 0 ? ctx.firstSitePort : undefined;
    await ports.runSerialized(siteDir, () => ports.openSiteWindow({ siteDir, ctx }, { port }));
  }
  ports.refreshAppMenu(ctx);

  ports.onActivate(createOwnServerActivate({ ctx, ports }));
}
