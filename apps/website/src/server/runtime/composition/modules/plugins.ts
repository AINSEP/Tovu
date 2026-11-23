import type { Express } from "express";

import { pluginFilesRoute } from "@jini-ai/cms/admin-http/routes/plugins/files";
import { pluginListRoute } from "@jini-ai/cms/admin-http/routes/plugins/list";
import { pluginPreviewRunRoute, pluginPreviewStatusRoute } from "@jini-ai/cms/admin-http/routes/plugins/preview";
import { pluginUninstallRoute, type PluginUninstallInput } from "@jini-ai/cms/admin-http/routes/plugins/uninstall";
import {
  PluginAlreadyInTrashError, PluginEnabledError, PluginHookFailedError, PluginNotFoundError, PluginNotUninstallableError,
  toAdminPluginResponse, uninstallPlugin,
} from "@jini-ai/plugins/host";
import { PLUGIN_PACKAGE_FILE_LIMITS, PluginPackagePathError } from "@jini-ai/plugins/host/node";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { pluginHookFailedBody } from "#src/server/inbound/admin-http/http/plugin-hook-error";
import { registerChartProviderRoutes } from "#src/server/inbound/admin-http/routes/plugins/chart-providers";
import { registerPluginInstallRoutes } from "#src/server/inbound/admin-http/routes/plugins/install";
import { localPluginInstaller, type LocalInstallerDeps } from "#src/server/inbound/admin-http/routes/plugins/local-installer";
import { registerPluginProviderSettingsRoutes } from "#src/server/inbound/admin-http/routes/plugins/provider-settings";
import { registerPluginSetEnabledRoute } from "#src/server/inbound/admin-http/routes/plugins/set-enabled";
import { PluginUninstallPathError } from "#src/server/runtime/composition/plugin-runtime";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { OutboxPort, AuthorizeFn, ChangeSetRepoPort } from "@jini-ai/core/contracts/events";
import type { PluginActivationRepoPort } from "@jini-ai/core/contracts/site/plugins-host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import type { PluginBeforeSavePreview } from "#src/features/plugin-runtime/host-binding";
import type { PluginConflict } from "@jini-ai/core/contracts/site/plugins-host";
import type { PluginPackageFiles } from "@jini-ai/plugins/host/node";
import type { RemovePluginFn } from "@jini-ai/core/contracts/site/plugins-host";


/**
 * Narrow `RouteDeps` slice for the `plugins` admin HTTP surface (SPEC-005 REQ-10, C-016), moved from
 * the deleted `routes/plugins/deps.ts`: the host bag the registrars read. `discoverPlugins`/`onEnabled`/
 * `onDisabled` are pre-bound closures (installDir/builtIns, hook-registry attach/detach already
 * captured by the composition root), so the route layer never constructs a discovery call itself.
 */
export interface PluginsRouteDeps {
  notifyRosterChanged: import("#src/contracts/core/tool-access-change").NotifyToolAccessChanged;
  /** Existing provider/assistant-face owner, bound by the site composition. */
  providerFaces?: Pick<import('#src/features/plugin-runtime/service-ports').PluginProviderFacesPort, 'affectedPluginIds'>;
  /** Owner-action signals; the shared noop means off (consent-gated inside the facade). */
  tracker: import("@jini-ai/core/contracts/site/diagnostics-observability").Tracker;
  pluginSourcePolicy?: import('@jini-ai/plugins/host').PluginSourcePolicyPort;
  /** Records the owner's enable as the site plugin's approved capability set (consent gap, 2026-10-12). */
  pluginSource?: Pick<import('@jini-ai/plugins/host/node').PluginSourcePort, "recordApproval">;
  pluginInstaller?: import("@jini-ai/plugins/host/node").PluginInstallerPort;
  workspaceId: UUID;
  authorize: AuthorizeFn;
  clock: ClockPort;
  idGen: IdGeneratorPort;
  changeSets: ChangeSetRepoPort;
  outbox?: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  /** Pre-bound: `installDir`/`builtIns` already captured by the composition root. */
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** 2026-10-04 — see `routes/types.ts`'s `PluginRuntimeDeps.listPluginConflicts`. */
  listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  removePlugin: RemovePluginFn;
  /** 2026-09-13 — pre-bound package-files listing (`installDir`/built-in sources already
   * captured). See `routes/types.ts`'s `PluginRuntimeDeps.readPluginPackageFiles` doc. */
  readPluginPackageFiles: (record: PluginDiscoveryRecord) => Promise<PluginPackageFiles>;
  /** AW-7 Tier 2 — see `routes/types.ts`'s `previewPluginBeforeSave` doc. */
  previewPluginBeforeSave: PluginBeforeSavePreview;
}

export type PluginsRouteRegistrar = (required: { app: Express; deps: PluginsRouteDeps }, optional?: Record<string, never>) => void;

/** The deps the list route reads; activation is only ever looked up, never written. */
export type PluginsListRouteDeps = Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "discoverPlugins" | "listPluginConflicts"> &
  LocalInstallerDeps & { pluginActivationRepo: Pick<PluginsRouteDeps["pluginActivationRepo"], "getActivation"> };

/**
 * The two port fields every plugins mount passes. `authorize` is read per request (tests reassign
 * it). The hand-written plugin routes asked `authorizeOrRespond` with principal, permission and
 * workspace only — never an entity — so the port's `entityType`/`entityId` are dropped here and the
 * host authorizer sees exactly the params it always did.
 */
function pluginPortDeps({ deps }: { deps: Pick<PluginsRouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, entityId: _entityId, ...params }) => deps.authorize(params) };
}

/** Every converted plugins route used `authorizeOrRespond` (`"guarded"`); the operation picks its 500 copy. */
function mountOptions(operation: string) {
  return { authorization: "guarded" as const, failure: { operation, code: "INTERNAL_ERROR" } };
}

/** Discovery and activation lookups, read per request from the host bag. */
function pluginReadDeps({ deps }: { deps: Pick<PluginsRouteDeps, "discoverPlugins"> & { pluginActivationRepo: Pick<PluginsRouteDeps["pluginActivationRepo"], "getActivation"> } }, _optional: Record<string, never> = {}) {
  return {
    discoverPlugins: () => deps.discoverPlugins(),
    pluginActivationRepo: { getActivation: (input: { workspaceId: string; pluginId: string }) => deps.pluginActivationRepo.getActivation(input) },
  };
}

export const registerPluginsListRoute = ({ app, deps }: { app: Express; deps: PluginsListRouteDeps }, _optional: Record<string, never> = {}): void => {
  const listDeps = {
    ...pluginPortDeps({ deps }), ...pluginReadDeps({ deps }), toAdminPluginResponse,
    // A host without conflict tracking has none to show.
    listPluginConflicts: async () => (await deps.listPluginConflicts?.()) ?? new Map(),
    localInstallAvailable: () => Boolean(localPluginInstaller(deps)),
  };
  mountAdminJsonRoute({ app, spec: pluginListRoute, deps: listDeps }, mountOptions("routes/plugins/list"));
};

export const registerPluginFilesRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const filesDeps = {
    ...pluginPortDeps({ deps }), discoverPlugins: () => deps.discoverPlugins(),
    readPluginPackageFiles: (record: PluginDiscoveryRecord) => deps.readPluginPackageFiles(record),
    packageFileLimits: PLUGIN_PACKAGE_FILE_LIMITS, unsafePathError: PluginPackagePathError,
  };
  mountAdminJsonRoute({ app, spec: pluginFilesRoute, deps: filesDeps }, mountOptions("routes/plugins/files"));
};

export const registerPluginUninstallRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const uninstallDeps = {
    ...pluginPortDeps({ deps }), clock: deps.clock, discoverPlugins: () => deps.discoverPlugins(),
    uninstallPlugin: ({ discovery, input }: { discovery: readonly PluginDiscoveryRecord[]; input: PluginUninstallInput }) =>
      uninstallPlugin({ deps: { repo: deps.pluginActivationRepo, discovery, remove: deps.removePlugin }, input }),
    uninstallErrors: {
      notFound: PluginNotFoundError, notUninstallable: PluginNotUninstallableError, enabled: PluginEnabledError,
      alreadyInTrash: PluginAlreadyInTrashError, unsafePath: PluginUninstallPathError,
    },
  };
  mountAdminJsonRoute({ app, spec: pluginUninstallRoute, deps: uninstallDeps }, mountOptions("routes/plugins/uninstall"));
};

/** `PLUGIN_PREVIEW_STATUS` (GET) then `PLUGIN_PREVIEW` (POST), same order as before. The hook-failure
 *  body stays the host's (`http/plugin-hook-error.ts` logs the plugin's own error, redacted). */
export const registerPluginPreviewRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const previewDeps = {
    ...pluginPortDeps({ deps }), ...pluginReadDeps({ deps }),
    previewPluginBeforeSave: (...args: Parameters<PluginsRouteDeps["previewPluginBeforeSave"]>) => deps.previewPluginBeforeSave(...args),
    hookFailedError: PluginHookFailedError, pluginHookFailedBody,
  };
  mountAdminJsonRoute({ app, spec: pluginPreviewStatusRoute, deps: previewDeps }, mountOptions("routes/plugins/preview"));
  mountAdminJsonRoute({ app, spec: pluginPreviewRunRoute, deps: previewDeps }, mountOptions("routes/plugins/preview"));
};

/**
 * K1 (RT-K1-adm-plugins): list, files, uninstall and preview (status + run) are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/plugins/*`) mounted behind the admin ports; `RouteDeps` is read only
 * here. `@jini-ai/cms` does not depend on `@jini-ai/plugins`, so the plugin mechanisms and the error
 * classes each ladder maps are injected from here. Still hand-written (non-JSON or host-session
 * bound): chart-providers, install, provider-settings; set-enabled not yet converted.
 */
/**
 * @file The `plugins` server module (SPEC-005, ADR-005-ARCH) — ADR-046 Phase 3 server-module
 * convention, mirroring `modules/widgets.ts` exactly.
 *
 * `PluginsRouteDeps` (declared above, moved from the deleted `routes/plugins/deps.ts`) is a structural subset of `RouteDeps` —
 * `pluginActivationRepo`/`discoverPlugins` were added directly to `RouteDeps` (mirroring how
 * `widgetBindingRepo`/`entryRefsRepo` were added for the `widgets` module), so no widened or
 * narrowed local type is needed here, same as `widgets.ts`'s own rationale.
 *
 * Registers `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` (REQ-10, Phase 1) plus `PLUGIN_UNINSTALL`
 * (Milestone 2, 2026-08-20 — no SPEC-005 spec package covers it; see `uninstall.ts`'s own header)
 * and `PLUGIN_FILES` (2026-09-13 — the read-only package-files viewer; see `files.ts`'s header),
 * and `PLUGIN_PREVIEW` (AW-7 Tier 2, 2026-10-04 — one plugin's beforeSave on an unsaved draft; see
 * `preview.ts`'s header) with its `GET` sibling `PLUGIN_PREVIEW_STATUS` (2026-10-05).
 * The admin UI screen (REQ-12..18) consumes the Phase 1 contract as a black box; the `word-count`
 * dogfood plugin (Phase 2) and the `post.ts` hook-wiring (Phase 3) were later, gated phases that
 * added no new routes to this module. Local folder install/update now use the owner-approved
 * 2026-09-22 plan: uninstall/disable came first, since revocation is what makes installing safe.
 */
export function createPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "plugins",
    registerRoutes: ({ app }, _options = {}) => {
      registerChartProviderRoutes({ app, deps });
      registerPluginsListRoute({ app, deps });
      registerPluginSetEnabledRoute({ app, deps });
      registerPluginUninstallRoute({ app, deps });
      registerPluginFilesRoute({ app, deps });
      registerPluginProviderSettingsRoutes({ app, deps });
      registerPluginInstallRoutes({ app, deps });
      // After the install routes: `.../plugins/:pluginId/preview` also matches
      // `.../plugins/install/preview`, and Express runs the first registered match.
      registerPluginPreviewRoute({ app, deps });
    },
  };
}
