import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import { localSiteLifecycleRoutes } from "@jini-ai/cms/admin-http/routes/sites/local-sites";
import { sitesConfigReadRoute, sitesHomeSetRoute } from "@jini-ai/cms/admin-http/routes/sites/sites-home";
import { siteActivateRoute, siteCreateRoute, siteTokenSignInPluginsRoute, type SiteCreateRouteDeps } from "@jini-ai/cms/admin-http/routes/system/sites";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { nodeSitesDirectoryProbe, registerSitesConfigSaveRoute, type SitesSettingsDeps } from "#src/server/inbound/admin-http/routes/sites/sites-home";
import { registerWarmSiteControl } from "#src/server/inbound/admin-http/routes/sites/warm-site-control";
import { registerSitePreviewRoutes } from "#src/server/runtime/composition/modules/site-previews-route";
import { handleListSites, registerDevWarmSiteRoute, type SitesPorts } from "#src/server/inbound/admin-http/routes/system/sites";
import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import { composePluginCredentials } from "#src/server/runtime/composition/agent-plugin-service-ports";
import { sealPendingAgentPluginTokensForNewSite as sealPendingAgentPluginTokensReal } from "#src/server/runtime/composition/pending-agent-plugin-tokens";
import { localSiteSupervisorForHost, warmSiteServerForHost } from "#src/server/runtime/lifecycle/local-site-host";
import { sitePreviewServiceForHost } from "#src/server/runtime/lifecycle/site-preview-host";
import { activateSiteWithWarmServer, createSiteForOwner, resolveSiteSwitchBase, type SitePreviewService } from "#src/features/sites/index";
import { listNewSiteAgentPluginTokenSignInPlugins } from "#src/features/agent-plugins/new-site-agent-plugin-tokens";
import type { checkAgentPluginAccessToken as checkAgentPluginAccessTokenReal } from "#src/features/agent-plugins/token-sign-in";
import {
  createSitesWorkspace, type SitesWorkspace, listSiteTrash, listSites as listSitesReal, persistActiveSite as persistActiveSiteReal,
  readPersistedActiveSite as readPersistedActiveSiteReal, type readSiteRunning, type SiteListEntry,
  isSiteSwitcherEnabled as isSiteSwitcherEnabledReal, LocalSiteError, type LocalSiteSupervisorPort,
  trashSite, restoreSite, permanentlyDeleteTrashedSite, siteTrashName,
} from "#src/platform/site-dir/index";
import { devRestartPortFromEnv } from "#src/platform/dev-supervisor/index";
import type { DevRestartPort } from "@jini-ai/core/contracts/site/dev-supervisor-dev-restart";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The `sites` server module: the admin Sites screen's registrars (`registerAdminSitesRoutes`,
 * `registerSitesHomeRoutes`, `registerLocalSitesRoutes`).
 *
 * K1 (RT-K1-adm-sites-1/-2, RT-K1-adm-system-14): the settings read, the home choice, the local-site
 * lifecycle, Create, Activate and the token-sign-in-plugin list are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/{sites,system}/*`). The host's own collaborators — the site-dir
 * layer, the site-admin feature functions, the dev supervisor, the Node directory probe — are bound
 * here, at registration, so a spec never sees `RouteDeps`. Still hand-written (see each file):
 * `PUT .../sites/config` (two failure copies by phase), List and `/internal/dev-warm-site`
 * (`routes/system/sites.ts`), card previews (binary image) and the warm-child relay.
 *
 * Registration order is unchanged: settings (GET config, PUT config, PUT home), then the warm relay
 * (which replaces everything below on a warm child), dev warm-start, preview, lifecycle, List,
 * token plugins, Create, Activate.
 */

/** The unexpected-failure copy key and authorization of each mount, exactly as each hand-written
 *  route had them: every sites route called `authorizeOrRespond` once (`"guarded"`, one check each,
 *  so no `authorizationByPermission`); the settings routes chose their own 500 copy (`message`).
 *
 *  `gateFirst` (config read, home, Create, Activate): those hand-written routes answered the
 *  deployment gate (switcher flag / boot binding) BEFORE `getAuthedPrincipal`, so a closed gate's
 *  403/409 won even with no session. The ports authenticate before `handle`, where each spec checks
 *  its gate, so these mounts defer the missing principal (`deferMissingPrincipal`). That stays fail
 *  closed: none of the four specs refuses in `parse`, each answers its gate and then calls
 *  `authorize` before any side effect, and the port's `authorize` throws `getAuthedPrincipal`'s
 *  error on a missing principal — the same redacted 500 (`sites-route-gate-precedence.test.ts`).
 *  The token-plugin list read the session first (no gate), so it keeps the default. */
function sitesMountOptions(
  { operation }: { operation: string },
  { message, gateFirst = false }: { message?: string; gateFirst?: boolean } = {},
): AdminJsonRouteMountOptions {
  const failure = { operation, code: "INTERNAL_ERROR", ...(message === undefined ? {} : { message }) };
  return { authorization: "guarded", failure, ...(gateFirst ? { deferMissingPrincipal: true } : {}) };
}

/** The two port fields; `authorize` is read per request, as the hand-written routes read it. */
function sitesPortDeps({ deps }: { deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Sites settings (read, save, home), authorized at the same boundary as Sites mutations. All three are Jini
 *  specs over this host's workspace and Node directory probe; the save is mounted by
 *  `registerSitesConfigSaveRoute` with its gate and phase-aware failure copy. @complexity O(1). */
export function registerSitesHomeRoutes(
  { errors, app, deps, workspace }: { errors: RouteErrorPorts; app: Express; deps: Omit<SitesSettingsDeps, "isSiteSwitcherEnabled"> & { isSiteSwitcherEnabled?: () => boolean }; workspace: SitesWorkspace },
  _options = {},
): void {
  const switcherEnabled = () => (deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabledReal)();
  mountAdminJsonRoute({ errors, app, spec: sitesConfigReadRoute, deps: { ...sitesPortDeps({ deps }), switcherEnabled, workspace } },
    sitesMountOptions({ operation: "routes/sites/sites-home" }, { message: "Could not read sites settings.", gateFirst: true }));
  registerSitesConfigSaveRoute({ errors, app, deps: { ...deps, isSiteSwitcherEnabled: switcherEnabled }, workspace });
  mountAdminJsonRoute({ errors, app, spec: sitesHomeSetRoute, deps: { ...sitesPortDeps({ deps }), switcherEnabled, workspace, directories: nodeSitesDirectoryProbe } },
    sitesMountOptions({ operation: "routes/sites/sites-home" }, { message: "Could not save sites home.", gateFirst: true }));
}

export type AdminSitesDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding" | "createSite"> & {
  tracker?: RouteDeps["tracker"];
  sitesWorkspace?: SitesWorkspace;
  localSiteSupervisor?: LocalSitesRouteDeps["localSiteSupervisor"];
  siteTrash?: LocalSitesRouteDeps["siteTrash"];
  listSiteTrash?: typeof listSiteTrash;
  /** Card preview captures (`site-preview-host.ts`); a test injects a fake, `null` turns them off. */
  sitePreviews?: SitePreviewService | null;
  /** The guarded outbound client a token check probes through. Absent, a given token is refused as
   *  not checkable rather than saved unchecked. */
  customCredentialsHttpClient?: RouteDeps["customCredentialsHttpClient"];
  checkAgentPluginAccessToken?: typeof checkAgentPluginAccessTokenReal;
  sealPendingAgentPluginTokens?: typeof sealPendingAgentPluginTokensReal;
  listTokenSignInPlugins?: (required: { workspaceId: string }) => ReturnType<typeof listNewSiteAgentPluginTokenSignInPlugins>;
  /** Injectable so a route test proves both branches without touching the real filesystem or
   *  `sites/`. Each defaults to the real `site-dir`/`site-switcher-enabled` implementation. */
  listSites?: (optional?: Parameters<typeof listSitesReal>[0]) => readonly SiteListEntry[];
  persistActiveSite?: typeof persistActiveSiteReal;
  readSiteRunning?: typeof readSiteRunning;
  isSiteSwitcherEnabled?: typeof isSiteSwitcherEnabledReal;
  readPersistedActiveSite?: typeof readPersistedActiveSiteReal;
  /** The `npm run dev` restart channel for Activate's `restartNow`. Defaults to
   *  `devRestartPortFromEnv({ delayMs: 0 })` (`null` outside `dev.mjs`); a test passes a fake or `null`. */
  devRestart?: DevRestartPort | null;
};

/** Resolves every port the routes below share, falling back to the real implementation. */
function resolveSitesPorts({ deps, sitesWorkspace }: { deps: AdminSitesDeps; sitesWorkspace: SitesWorkspace }): SitesPorts {
  return {
    deps,
    listSites: deps.listSites ?? listSitesReal,
    isSiteSwitcherEnabled: deps.isSiteSwitcherEnabled ?? isSiteSwitcherEnabledReal,
    readPersistedActiveSite: deps.readPersistedActiveSite ?? readPersistedActiveSiteReal,
    localSiteSupervisor: deps.localSiteSupervisor ?? localSiteSupervisorForHost({ binding: deps.siteBinding, workspaceId: deps.workspaceId }),
    warmServer: warmSiteServerForHost({ binding: deps.siteBinding, workspaceId: deps.workspaceId }),
    // HTTP sends its JSON response before the timer fires; only chat needs a reply grace period.
    devRestart: deps.devRestart === undefined ? devRestartPortFromEnv({ delayMs: 0 }) : deps.devRestart,
    sitePreviews: deps.sitePreviews === undefined ? sitePreviewServiceForHost({ binding: deps.siteBinding }) : deps.sitePreviews ?? undefined,
    sitesWorkspace,
  };
}

export interface LocalSitesRouteDeps extends Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding"> {
  localSiteSupervisor?: LocalSiteSupervisorPort;
  afterTrash?: (required: { base: string; name: string }) => void;
  isSiteSwitcherEnabled: () => boolean;
  siteTrash?: { trash: typeof trashSite; restore: typeof restoreSite; remove: typeof permanentlyDeleteTrashedSite };
}

/** Mount the Jini local-site lifecycle specs (start/stop/trash/restore/delete) over this host's
 * site-dir layer. Register only handlers; host lifetime belongs to the serving composition.
 * @complexity O(1).
 */
export function registerLocalSitesRoutes({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: LocalSitesRouteDeps }, _options = {}): void {
  const siteTrash = deps.siteTrash ?? { trash: trashSite, restore: restoreSite, remove: permanentlyDeleteTrashedSite };
  const routeDeps = {
    workspaceId: deps.workspaceId, authorize: deps.authorize, localSiteSupervisor: deps.localSiteSupervisor, siteTrash, siteTrashName,
    afterTrash: deps.afterTrash,
    siteSwitchBase: () => resolveSiteSwitchBase({ binding: deps.siteBinding, switchingEnabled: deps.isSiteSwitcherEnabled() }),
    localSiteErrorCode: (error: unknown) => (error instanceof LocalSiteError ? error.code : undefined),
  };
  // No mount options: the hand-written lifecycle handler called `authorizeOrRespond` (the `"guarded"`
  // default) and answered an unexpected failure with `sendAdminFailure`'s route-derived copy (no options).
  for (const spec of localSiteLifecycleRoutes) mountAdminJsonRoute({ errors, app, spec, deps: routeDeps });
}

function registerSitesSupportRoutes({ errors, app, ports }: { errors: RouteErrorPorts; app: Express; ports: SitesPorts }): void {
  const { deps, warmServer, sitePreviews, localSiteSupervisor, isSiteSwitcherEnabled, readPersistedActiveSite } = ports;
  registerDevWarmSiteRoute({ app, warmServer });
  registerSitePreviewRoutes({ errors, app, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, sitePreviews } });
  registerLocalSitesRoutes({ errors, app, deps: { ...deps, localSiteSupervisor, isSiteSwitcherEnabled,
    afterTrash({ base, name }) {
      // A next-launch default must not silently recreate the folder just moved to Trash.
      if (readPersistedActiveSite({ cwd: base }) === name) {
        (deps.persistActiveSite ?? persistActiveSiteReal)({ name: deps.siteBinding.name }, { cwd: base });
      }
    },
  } });
}

/** Forward the create fields to their feature owner; validation and errors stay there.
 * @complexity O(1) adapter overhead; creation/token costs belong to createSiteForOwner. */
function createSiteCollaborator({ deps }: { deps: AdminSitesDeps }, _options = {}): SiteCreateRouteDeps["createSite"] {
  return ({ switcherBase, name, actorId, adminPassword, agentPluginTokens }) => createSiteForOwner(
    { workspaceId: deps.workspaceId, actorId, source: "admin", switcherBase, name, adminPassword, agentPluginTokens },
    {
      bundledSourceRoot: bundledAgentPluginsDir(),
      credentials: deps.customCredentialsHttpClient && composePluginCredentials({ httpClient: deps.customCredentialsHttpClient }),
      tracker: deps.tracker,
      createSite: deps.createSite,
      customCredentialsHttpClient: deps.customCredentialsHttpClient,
      checkAgentPluginAccessToken: deps.checkAgentPluginAccessToken,
      sealPendingAgentPluginTokens: deps.sealPendingAgentPluginTokens ?? sealPendingAgentPluginTokensReal,
    },
  );
}

/** Mount the token-plugin list, Create and Activate specs with this host's site-admin functions.
 * @complexity O(1). */
function registerSiteAdminSpecs({ errors, app, ports }: { errors: RouteErrorPorts; app: Express; ports: SitesPorts }, _options = {}): void {
  const { deps, isSiteSwitcherEnabled, listSites, devRestart, sitesWorkspace, warmServer } = ports;
  // The served tree's base, never `process.cwd()`: the flag, then the binding (see `resolveSiteSwitchBase`).
  const siteSwitchBase = () => resolveSiteSwitchBase({ binding: deps.siteBinding, switchingEnabled: isSiteSwitcherEnabled() });
  const listTokenSignInPlugins = deps.listTokenSignInPlugins
    ?? (() => listNewSiteAgentPluginTokenSignInPlugins({ bundledSourceRoot: bundledAgentPluginsDir() }));
  mountAdminJsonRoute({ errors, app, spec: siteTokenSignInPluginsRoute, deps: { ...sitesPortDeps({ deps }), listTokenSignInPlugins } }, sitesMountOptions({ operation: "routes/system/sites" }));
  mountAdminJsonRoute({ errors, app, spec: siteCreateRoute, deps: { ...sitesPortDeps({ deps }), siteSwitchBase, createSite: createSiteCollaborator({ deps }) } }, sitesMountOptions({ operation: "routes/system/sites" }, { gateFirst: true }));
  mountAdminJsonRoute({ errors, app, spec: siteActivateRoute, deps: { ...sitesPortDeps({ deps }), siteSwitchBase,
    // `restartNow: true` (2026-10-05, OD-S1) asks the `npm run dev` supervisor to restart onto the
    // new site; without it, Activate behaves exactly as before (persist + instructions).
    activateSite: ({ switcherBase, name, restartNow }) => activateSiteWithWarmServer(
      { switcherBase, name, currentSiteName: deps.siteBinding.name, restartNow, dirOverridden: deps.siteBinding.dirOverridden },
      { listSites, persistActiveSite: deps.persistActiveSite, devRestart, readSiteRunning: deps.readSiteRunning, workspace: sitesWorkspace, warmServer },
    ) } }, sitesMountOptions({ operation: "routes/system/sites" }, { gateFirst: true }));
}

export function registerAdminSitesRoutes({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: AdminSitesDeps }, _optional: Record<string, never> = {}): void {
  const sitesWorkspace = deps.sitesWorkspace ?? createSitesWorkspace({});
  registerSitesHomeRoutes({ errors, app, deps, workspace: sitesWorkspace });
  if (registerWarmSiteControl({ app, binding: deps.siteBinding, workspaceId: deps.workspaceId })) return;
  const ports = resolveSitesPorts({ deps, sitesWorkspace });
  const base = "/api/admin/v1/workspaces/:workspaceId/system/sites";
  registerSitesSupportRoutes({ errors, app, ports });
  app.get(base, (req, res) => handleListSites({ ports, req, res }));
  registerSiteAdminSpecs({ errors, app, ports });
}
