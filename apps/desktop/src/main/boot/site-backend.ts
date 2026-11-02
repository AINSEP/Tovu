/**
 * @file Spawn-or-reuse one site's `tovu serve` and seed its admin session — the site-open half that
 * `main.ts`'s own-server windows ({@link SiteBackend.startSiteBackend}) and sites-home tabs
 * ({@link SiteBackend.openSiteServer}) share. Extracted from `main.ts` so every decision here runs
 * against fakes: Electron (`net`, `session`, `BrowserWindow`), the child spawn, the crash-safety
 * registry, the shared-sites lease and the clock all arrive as ports. This module does no I/O itself.
 */
import type { CliMode } from "../../startup-env.ts";

/** The `startTovuServer` / `attachRunningSite` handle fields a site open reads. */
export interface SiteBackendServer {
  adminUrl: string;
  port: number;
  workspaceId: string;
  pid: number;
  bootToken: string | null;
  ownerSignInCapability?: string;
  onExit(listener: () => void): void;
}

/** The per-launch inputs a site open reads (`main.ts`'s `SiteOpenCtx`). */
export interface SiteBackendCtx {
  cliMode: CliMode;
  registryPath: string;
}

/** What `startTovuServer` is asked for; the composition root adds `isPackaged`, `repoRoot` and the
 *  live product-telemetry launch. */
export interface SiteServerStartInput {
  siteDir: string;
  cliMode: CliMode;
  port: number | undefined;
  emitBootToken: true;
  adminDevProxyUrl: string | null;
  nodeToolchainEnv: Record<string, string>;
}

/** Electron, spawn, registry and lease effects, bound once by the composition root. */
export interface SiteBackendPorts<TServer extends SiteBackendServer> {
  /** `desktop-auth.ts`'s `sitePartition`. */
  partitionFor: (required: { siteDir: string }) => string;
  /** `shared-sites.ts`'s `attachRunningSite` against the shared workspace. */
  attachRunning: (required: { siteDir: string }) => TServer | null;
  /** `shared-sites.ts`'s `rememberSharedSiteOpen` against the shared workspace. */
  rememberOpen: (required: { siteDir: string }) => void;
  /** `admin-dev-proxy.ts`'s probe, bound to `app.isPackaged` and `process.env`. */
  resolveAdminDevProxyUrl: () => Promise<string | null>;
  /** `desktop-capture.ts`'s bridge, bound to a `BrowserWindow` factory and the capture pool. */
  startCaptureBridge: () => Promise<{ env: Record<string, string>; close(): void }>;
  startServer: (required: SiteServerStartInput) => Promise<TServer>;
  /** The bundled node toolchain's env, or `undefined` when it could not be written this launch. */
  baseToolchainEnv: Record<string, string> | undefined;
  recordSiteOpened: (required: { registryPath: string; row: { siteDir: string; port: number; workspaceId: string; pid: number; updatedAt: number } }) => void;
  now: () => number;
  /** `desktop-auth.ts`'s `armDesktopOwnerSignIn` on this partition's session. */
  armOwnerSignIn: (required: { partition: string; adminUrl: string; capability: string }) => void;
  /** `desktop-auth.ts`'s `ensureSiteSession` on this partition's session. */
  ensureSession: (required: { partition: string; adminUrl: string; redeem: () => Promise<boolean> }) => Promise<unknown>;
  /** `desktop-auth.ts`'s `redeemBootSession` on this partition's session. May reject. */
  redeemBootSession: (required: { partition: string; adminUrl: string; bootToken: string }) => Promise<{ ok: boolean; reason?: string }>;
  /** The live environment; only `TOVU_DESKTOP_USER_DATA_DIR`'s presence is read. */
  env: Readonly<Record<string, string | undefined>>;
  /** Electron's own executable, read on every announce. */
  electronPath: () => string;
  /** `bin/mcp-bridge.ts` next to `main.ts`. */
  bridgePath: string;
  userDataDir: () => string;
  /** `sites-mcp-registration.ts`'s `writeSitesMcpLauncher`. May throw. */
  writeMcpLauncher: (required: { userDataDir: string; electronPath: string; bridgePath: string }) => string;
  /** `sites-mcp-registration.ts`'s `registerSitesMcpServer` on this partition's session. */
  registerMcpServer: (required: { partition: string; adminUrl: string; workspaceId: string; launcherPath: string; bridgePath: string; userDataDir: string }) => Promise<{ ok: boolean; reason?: string }>;
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  /** The `openSites` supervisor surface {@link SiteBackend.openSiteServer} reads and writes. */
  openSites: OpenSitesPort<TServer>;
  /** `sitePreviewScheduler.schedule`. */
  schedulePreview: (required: { siteDir: string }) => void;
  /** `siteThemePreviews.sync`. */
  syncThemePreview: (required: { siteDir: string }) => void;
}

/** The `openSites` map surface a sites-home open reads and writes. */
export interface OpenSitesPort<TServer> {
  get(siteDir: string): { server: TServer } | undefined;
  set(siteDir: string, entry: { server: TServer; siteDir: string }): unknown;
}

export interface SiteBackend<TServer extends SiteBackendServer> {
  authenticateSiteSession(required: { siteDir: string; server: TServer; partition: string }, optional?: {}): Promise<boolean>;
  startSiteBackend(required: { siteDir: string; ctx: SiteBackendCtx }, optional?: { port?: number }): Promise<{ server: TServer; partition: string }>;
  announceDesktopToolsToSite(required: { server: TServer; partition: string }, optional?: {}): void;
  openSiteServer(required: { siteDir: string; ctx: SiteBackendCtx }, optional?: { port?: number }): Promise<TServer>;
}

/**
 * Bind the site-open steps to their ports.
 * @returns `{ authenticateSiteSession, startSiteBackend, announceDesktopToolsToSite, openSiteServer }`.
 * @complexity O(1).
 */
export function createSiteBackend<TServer extends SiteBackendServer>(
  { ports }: { ports: SiteBackendPorts<TServer> }, _optional = {},
): SiteBackend<TServer> {
  /**
   * Put this child's admin session into `partition`'s cookie jar by redeeming the single-use boot
   * token it printed.
   *
   * Deliberately best-effort and silent-on-success. Every failure path — a child that minted no
   * token, a token already spent, a route that refused — logs one line and returns, and the caller
   * loads the admin anyway, where the ordinary login screen is waiting. That fallback is the design,
   * not a gap: it must never turn "you have to type a password" into "the window is blank", and it
   * must never fabricate a session.
   *
   * @returns whether the session was authenticated.
   * @complexity O(1) — one loopback request.
   */
  async function authenticateSiteSession(
    { siteDir, server, partition }: { siteDir: string; server: TServer; partition: string }, _opts = {},
  ): Promise<boolean> {
    if (typeof server.bootToken !== "string" || server.bootToken.length === 0) {
      ports.log(`tovu desktop: ${siteDir} reported no boot token — the admin will ask for a login.`);
      return false;
    }
    let result;
    try {
      result = await ports.redeemBootSession({ partition, adminUrl: server.adminUrl, bootToken: server.bootToken });
    } catch (error) {
      // `assertLoopbackAdminUrl` throwing is a wiring bug, not an auth outcome — something handed
      // this a non-loopback origin, which must be loud rather than swallowed.
      ports.error(`tovu desktop: desktop sign-in refused for ${siteDir}: ${(error as Error).message}`);
      return false;
    }
    if (!result.ok) {
      ports.log(`tovu desktop: desktop sign-in did not apply to ${siteDir} (${result.reason}) — the admin will ask for a login.`);
    }
    return result.ok;
  }

  /**
   * Register this shell's MCP tool server with the site that just booted, so its assistant can reach
   * the desktop's own capabilities (list the operator's websites, add one, reveal one's folder).
   *
   * **Runs on every ordinary-profile site open; scratch profiles never register.** Both halves
   * are re-asserted rather than created once. The
   * launcher is regenerated because it embeds an absolute path to the Electron binary inside the
   * `.app` bundle — which goes stale the instant the operator drags the app to `/Applications` or an
   * update replaces it, and a stale one fails at connect with a spawn error naming neither cause.
   * The row is re-PUT because `external-mcp-repo.sqlite.ts` hard-deletes with no tombstone, so an
   * operator who removed the connection in Settings removed it unrecoverably; an idempotent PUT makes
   * both app-moves and that accident self-healing by the same mechanism.
   *
   * Placed immediately after `ensureSiteSession` because it depends on it: the PUT authenticates
   * with the session cookie that call just put in this partition's jar.
   *
   * **Fire-and-forget, and never awaited.** A site whose assistant lacks the desktop tools is
   * degraded, not broken, and the operator is mid-launch — so this must not be able to delay or fail
   * opening their window. `registerSitesMcpServer` never rejects for a registration outcome; the
   * `catch` is for a genuinely unexpected fault (an unwritable `userData`, a non-loopback admin URL)
   * and reports rather than propagating, for the same reason.
   *
   * @complexity O(1) — one file write and one request.
   */
  function announceDesktopToolsToSite({ server, partition }: { server: TServer; partition: string }, _opts = {}): void {
    // 2026-10-13 scratch-QA incident: opening tovu-dev wrote a temporary launcher's path into
    // the SHARED content.db, replacing the real desktop row; deleting scratch userData left
    // the owner's assistant with spawn ENOENT. A profile override must never publish that path.
    if (ports.env.TOVU_DESKTOP_USER_DATA_DIR !== undefined) return;
    try {
      // Read live, never persisted as truth — see this function's own note on staleness.
      const electronPath = ports.electronPath();
      const bridgePath = ports.bridgePath;
      const userDataDir = ports.userDataDir();
      const launcherPath = ports.writeMcpLauncher({ userDataDir, electronPath, bridgePath });
      void ports.registerMcpServer({
        partition,
        adminUrl: server.adminUrl,
        // The site's OWN workspace id, from `tovu serve`'s parsed boot line — never a hard-coded
        // `"workspace-local"`. `resolveWorkspace` picks the single or oldest workspace row and
        // `--workspace` can name another, so an assumed id would 404 on exactly the sites that differ.
        workspaceId: server.workspaceId,
        launcherPath,
        // Unused on POSIX (`writeSitesMcpLauncher` already embedded them in the launcher script);
        // on win32, where that call wrote no script and `launcherPath` is `electronPath` itself,
        // `registerSitesMcpServer`/`buildSitesMcpRegistration` need these to build `args`/`env`.
        bridgePath,
        userDataDir,
      }).then((result) => {
        if (!result.ok) ports.warn(`tovu-desktop: the assistant's desktop tools are unavailable for this site — ${result.reason}`);
      });
    } catch (error) {
      ports.warn(`tovu-desktop: could not register the desktop MCP tools — ${(error as Error).message}`);
    }
  }

  /** Spawn this site's child, or attach to a server a concurrent Web start won the race with.
   *  `spawned: false` means the returned handle is that attached server, needing no bookkeeping. */
  async function spawnSiteServer(siteDir: string, ctx: SiteBackendCtx, port: number | undefined): Promise<{ server: TServer; spawned: boolean }> {
    // ALWAYS emitted (DS-01). `emitBootToken` is what makes `server.bootToken` non-null below — see
    // `desktop-auth.ts`'s header for why this replaced a shell-minted, shell-stored password
    // entirely. It used to be `!alreadyAuthenticated`, decided from the cookie jar BEFORE this spawn,
    // and that ordering is the defect: it is a spawn argument, so there is no server to ask yet, and
    // a wrong guess could never be revised: no token had been minted, so a cookie the server no
    // longer honoured dropped the operator onto a login form for a password this shell never issued
    // (it passes no `desktopCredential` — the shell now seeds a random `TOVU_ADMIN_PASSWORD` into
    // every spawn it makes, LAN-bind plan 2026-09-23 Slice 3, `buildCliEnv` in `tovu-server.ts` — never
    // shown to the operator anywhere, and never a password they could type in even if they wanted to).
    // An unnecessary token is inert (single-use, process-scoped, never
    // written to disk); an unnecessary REDEEM is the 30-day-session pile-up, and that is what
    // `ensureSiteSession` still keeps conditional.

    // Resolved per site-start rather than once at boot: a developer routinely starts `npm run dev`
    // after the shell is already open, and a boot-time answer would stay "no Vite" for the rest of
    // the session. Yields `null` when packaged and when nothing is listening, in which case the child
    // serves `apps/admin/dist` exactly as before — see `admin-dev-proxy.ts` for why this is probed
    // rather than set optimistically.
    const adminDevProxyUrl = await ports.resolveAdminDevProxyUrl();
    const captureBridge = await ports.startCaptureBridge();
    let server: TServer;
    try {
      server = await ports.startServer({
        siteDir, cliMode: ctx.cliMode, port, emitBootToken: true, adminDevProxyUrl,
        nodeToolchainEnv: { ...ports.baseToolchainEnv, ...captureBridge.env, TOVU_RUNNING_APP: "Desktop" },
      });
    } catch (error) {
      captureBridge.close();
      // A simultaneous Web start can win between our preflight and the child's database claim.
      const attached = ports.attachRunning({ siteDir });
      if (attached) return { server: attached, spawned: false };
      throw error;
    }
    server.onExit(() => captureBridge.close());
    return { server, spawned: true };
  }

  /** Record, arm, authenticate and announce a freshly spawned child. */
  async function adoptSpawnedServer(siteDir: string, ctx: SiteBackendCtx, server: TServer, partition: string): Promise<void> {
    ports.rememberOpen({ siteDir });
    ports.recordSiteOpened({ registryPath: ctx.registryPath, row: {
      siteDir, port: server.port, workspaceId: server.workspaceId, pid: server.pid, updatedAt: ports.now(),
    } });
    if (server.ownerSignInCapability) {
      ports.armOwnerSignIn({ partition, adminUrl: server.adminUrl, capability: server.ownerSignInCapability });
    }
    // Awaited before returning, so the cookie is already in the jar when the caller's window/guest
    // makes its first navigation — a session applied after the page had loaded would still show the
    // login form until a reload. The decision itself lives in `desktop-auth.ts` so it can be tested
    // against fakes; this file only supplies the per-site inputs and the redeem it owns.
    await ports.ensureSession({
      partition, adminUrl: server.adminUrl,
      redeem: () => authenticateSiteSession({ siteDir, server, partition }),
    });
    announceDesktopToolsToSite({ server, partition });
  }

  /**
   * Spawn (or reuse) `siteDir`'s own `tovu serve` and put a valid admin session in its cookie jar —
   * every step both `openSiteWindow` (own-server mode, one `BrowserWindow` per site) and
   * {@link openSiteServer} (sites-home mode, one embedded `<webview>` tab per site) need, and NOTHING
   * either of them does with the result: this never touches `openSites`, a `BrowserWindow`, or a
   * `<webview>` — callers own that bookkeeping, so a caller whose next step fails (`createWindow`,
   * say) decides for itself how to unwind the server this just started.
   *
   * A site already authenticated from a previous launch keeps its session cookie in this
   * `persist:`-prefixed partition (see `desktop-auth.ts`'s header, property 2) across app restarts.
   * Minting and redeeming a fresh boot token here TOO was the defect: a brand-new 30-day session on
   * every open, one per launch, none of them ever revoked — 713 live rows found in one site's own
   * database. Skipping the mint when a session cookie is already present is what stops that
   * accumulation at its source; ending the session on close (both callers' own cleanup) is the other
   * half.
   *
   * @param optional.port pin this site's port (only ever passed for the startup call honoring
   *   `TOVU_DESKTOP_PORT` — see `resolveStartupSiteDirs`); every other call self-allocates so two
   *   sites opened in the same launch can never collide.
   * @returns `{server, partition}` — `partition` is the exact Electron session-partition string the
   *   caller's own `BrowserWindow`/`<webview>` must use, so the cookie this just seeded is visible to it.
   * @complexity O(1) beyond `startTovuServer`'s own cost.
   */
  async function startSiteBackend(
    { siteDir, ctx }: { siteDir: string; ctx: SiteBackendCtx }, { port }: { port?: number } = {},
  ): Promise<{ server: TServer; partition: string }> {
    const partition = ports.partitionFor({ siteDir });
    const attached = ports.attachRunning({ siteDir });
    if (attached) {
      ports.rememberOpen({ siteDir });
      return { server: attached, partition };
    }
    const { server, spawned } = await spawnSiteServer(siteDir, ctx, port);
    if (spawned) await adoptSpawnedServer(siteDir, ctx, server, partition);
    return { server, partition };
  }

  /**
   * The sites home UI's counterpart to `openSiteWindow`: ensure `siteDir`'s own `tovu serve` is
   * running and return its `server` handle, WITHOUT a `BrowserWindow`. The Projects screen embeds the
   * result directly in a `<webview>` tab inside its one window instead (`App.tsx`'s
   * `SiteWorkspace`, reading `port`/`partition` off the `SiteRecord` `project-ipc.ts`'s
   * `handleStart` returns). Reused, not re-spawned, when already open — same as `openSiteWindow`.
   *
   * Nothing here ever closes what it opens. Unlike a `BrowserWindow`, a `<webview>` tab has no
   * per-tab lifecycle event to hang a stop on: closing a tab is a renderer-only concern
   * (`App.hooks.ts`'s `closeProjectTab`) and deliberately leaves the site running, the same way
   * Tovu-Runner leaves a project running when its tab closes. `app.on("before-quit")` still
   * stops every entry in `openSites` on quit, sites-home-opened or not, and `project-ipc.ts`'s
   * `handleDelete` still stops one explicitly.
   *
   * Callers MUST run this through `serializer.run(siteDir, ...)`, same requirement as
   * `openSiteWindow` and for the same reason.
   *
   * @returns the started (or reused) server handle.
   * @complexity O(1) beyond `startSiteBackend`'s own cost.
   */
  async function openSiteServer(
    { siteDir, ctx }: { siteDir: string; ctx: SiteBackendCtx }, { port }: { port?: number } = {},
  ): Promise<TServer> {
    const already = ports.openSites.get(siteDir);
    if (already) return already.server;
    const { server } = await startSiteBackend({ siteDir, ctx }, { port });
    ports.openSites.set(siteDir, { server, siteDir });
    ports.schedulePreview({ siteDir });
    ports.syncThemePreview({ siteDir });
    return server;
  }

  return { authenticateSiteSession, startSiteBackend, announceDesktopToolsToSite, openSiteServer };
}
