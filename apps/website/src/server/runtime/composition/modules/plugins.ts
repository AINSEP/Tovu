import type { Express } from "express";

import { pluginFilesRoute } from "@jini-ai/cms/admin-http/routes/plugins/files";
import { pluginListRoute } from "@jini-ai/cms/admin-http/routes/plugins/list";
import { pluginPreviewRunRoute, pluginPreviewStatusRoute } from "@jini-ai/cms/admin-http/routes/plugins/preview";
import { pluginSetEnabledRoute, type PluginSetEnabledInput } from "@jini-ai/cms/admin-http/routes/plugins/set-enabled";
import { pluginUninstallRoute, type PluginUninstallInput } from "@jini-ai/cms/admin-http/routes/plugins/uninstall";
import { projectKeyUseRoute } from "@jini-ai/cms/admin-http/routes/plugins/project-key-use";
import { pluginProviderSettingsGetRoute, pluginProviderSettingsSaveRoute, type ProviderSettingsRouteDeps as ProviderSettingsSpecDeps } from "@jini-ai/cms/admin-http/routes/plugins/provider-settings";
import type { ProviderConfigSource } from "@jini-ai/core/contracts/site/composition-provider-config-source";
import { declaredProviderSettingFields, saveProviderSettings } from "#src/server/runtime/composition/provider-settings-save";
import { PluginAlreadyInTrashError, PluginConflictError, PluginEnabledError, PluginHookFailedError, PluginIncompatibleError, PluginInvalidError, PluginNotFoundError, PluginNotUninstallableError, pluginCapabilitySet, setPluginEnabled, toAdminPluginResponse, uninstallPlugin } from "@jini-ai/plugins/host";
import { PLUGIN_PACKAGE_FILE_LIMITS, PluginInstallError, PluginLoadError, PluginPackagePathError } from "@jini-ai/plugins/host/node";
import { ToolAccessLoweringError } from "@jini-ai/core/tool-access-change";
import { lowerPluginToolAccess } from "@jini-ai/plugins/runtime/lower-tool-access";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { pluginHookFailedBody } from "#src/server/inbound/admin-http/http/plugin-hook-error";
import { registerChartProviderRoutes } from "#src/server/inbound/admin-http/routes/plugins/chart-providers";
import { registerPluginInstallRoutes } from "#src/server/inbound/admin-http/routes/plugins/install";
import { localPluginInstaller, type LocalInstallerDeps } from "#src/server/inbound/admin-http/routes/plugins/local-installer";
import { PluginUninstallPathError } from "#src/server/runtime/composition/plugin-runtime";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";
import type { Clock as ClockPort, IdGenerator as IdGeneratorPort, UUID } from "@jini-ai/core/primitives";
import type { OutboxPort, AuthorizeFn, ChangeSetRepoPort } from "@jini-ai/core/contracts/events";
import type { PluginActivationRepoPort } from "@jini-ai/core/contracts/site/plugins-host";
import type { AdminPluginDto } from "@jini-ai/core/contracts/site/cms-plugins";
import type { AdminPluginEnvelope } from "@jini-ai/plugins/host";
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
  notifyRosterChanged: import("@jini-ai/core/tool-access-change").NotifyToolAccessChanged;
  /** Existing provider/assistant-face owner, bound by the site composition. */
  providerFaces?: Pick<import('@jini-ai/plugins/runtime/service-ports').PluginProviderFacesPort, 'affectedPluginIds'>;
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
 * Core restates the engine's admin row as `AdminPluginDto` (it cannot import the engine) and the
 * plugins specs answer that type, while this module binds the engine's `toAdminPluginResponse` to
 * them. Binding only proves engine -> Core; this pin fails the typecheck when either side gains,
 * loses or retypes a field. Type-only: no runtime cost.
 */
type IsTrue<T extends true> = T;
export type PluginRowMatchesCoreDto = IsTrue<[AdminPluginEnvelope] extends [AdminPluginDto] ? ([AdminPluginDto] extends [AdminPluginEnvelope] ? true : false) : false>;

/**
 * The two port fields every plugins mount passes. `authorize` is read per request (tests reassign
 * it). The hand-written plugin routes asked `authorizeOrRespond` with principal, permission and
 * workspace only — never an entity — so the port's `entityType`/`entityId` are dropped here and the
 * host authorizer sees exactly the params it always did.
 */
function pluginPortDeps({ deps }: { deps: Pick<PluginsRouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: ({ entityType: _entityType, entityId: _entityId, ...params }) => deps.authorize(params) };
}

/** The unexpected-failure copy key (`sendAdminFailure`'s operation) and authorization of each mount.
 *  Every converted plugins route but set-enabled used `authorizeOrRespond` (`"guarded"`).
 *  - `deferMissingPrincipal`: only set-enabled refused a malformed `enabled` (400) before
 *    `getAuthedPrincipal(res)`; list, files, uninstall and preview read the session first, so they
 *    keep the principal-first order. */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  optional: Pick<AdminJsonRouteMountOptions, "deferMissingPrincipal"> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" }, ...optional };
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
  mountAdminJsonRoute({ app, spec: pluginListRoute, deps: listDeps }, mountOptions({ operation: "routes/plugins/list", authorization: "guarded" }));
};

export const registerPluginFilesRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const filesDeps = {
    ...pluginPortDeps({ deps }), discoverPlugins: () => deps.discoverPlugins(),
    readPluginPackageFiles: (record: PluginDiscoveryRecord) => deps.readPluginPackageFiles(record),
    packageFileLimits: PLUGIN_PACKAGE_FILE_LIMITS, unsafePathError: PluginPackagePathError,
  };
  mountAdminJsonRoute({ app, spec: pluginFilesRoute, deps: filesDeps }, mountOptions({ operation: "routes/plugins/files", authorization: "guarded" }));
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
  mountAdminJsonRoute({ app, spec: pluginUninstallRoute, deps: uninstallDeps }, mountOptions({ operation: "routes/plugins/uninstall", authorization: "guarded" }));
};

/** The owner's enable of a site plugin is its approved capability set; a host without a plugin
 *  source (or a record without a manifest) records nothing. @complexity O(capabilities). */
async function recordSiteApproval({ deps, record }: { deps: Pick<PluginsRouteDeps, "pluginSource">; record: PluginDiscoveryRecord }, _optional: Record<string, never> = {}): Promise<void> {
  if (record.manifest && deps.pluginSource) await deps.pluginSource.recordApproval({ id: record.id, capabilities: pluginCapabilitySet({ manifest: record.manifest }) }, {});
}

/**
 * `PLUGIN_SET_ENABLED` (PATCH). The gateway (`executeCommand`) asks the RAW host authorizer with the
 * activation entity and answers its own 403, so `authorizeCommand` is `deps.authorize` read per
 * request — not the port's entity-dropping wrapper. The port authorizer is never asked, so the mount
 * is `"direct"` (the hand-written route never consulted a publishing credential's grant either).
 * It defers a missing session (`deferMissingPrincipal`): the hand-written route answered a malformed
 * `enabled` with its 400 before reading the principal, and a valid body still fails closed in the
 * spec's `pluginActorId` before discovery or the gateway runs.
 */
export const registerPluginSetEnabledRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const setEnabledDeps = {
    ...pluginPortDeps({ deps }), clock: deps.clock, idGen: deps.idGen, changeSets: deps.changeSets, outbox: deps.outbox,
    authorizeCommand: (params: Parameters<PluginsRouteDeps["authorize"]>[0]) => deps.authorize(params),
    pluginActivationRepo: deps.pluginActivationRepo, discoverPlugins: () => deps.discoverPlugins(),
    setPluginEnabled: ({ discovery, input }: { discovery: readonly PluginDiscoveryRecord[]; input: PluginSetEnabledInput }) => setPluginEnabled({
      deps: { clock: deps.clock, repo: deps.pluginActivationRepo, discovery, onEnabled: deps.onPluginEnabled, onDisabled: deps.onPluginDisabled },
      input,
    }),
    onPluginEnabled: ({ pluginId }: { pluginId: string }) => deps.onPluginEnabled(pluginId),
    onPluginDisabled: ({ pluginId }: { pluginId: string }) => deps.onPluginDisabled(pluginId),
    recordApproval: ({ record }: { record: PluginDiscoveryRecord }) => recordSiteApproval({ deps, record }),
    lowerToolAccess: ({ pluginId }: { pluginId: string }) =>
      lowerPluginToolAccess({ pluginId, notifyRosterChanged: deps.notifyRosterChanged, ...(deps.providerFaces ? { providerFaces: deps.providerFaces } : {}) }, {}),
    tracker: deps.tracker, toAdminPluginResponse,
    setEnabledErrors: {
      toolAccessLowering: ToolAccessLoweringError, install: PluginInstallError, notFound: PluginNotFoundError, incompatible: PluginIncompatibleError,
      invalid: PluginInvalidError, conflict: PluginConflictError, load: PluginLoadError,
    },
  };
  mountAdminJsonRoute({ app, spec: pluginSetEnabledRoute, deps: setEnabledDeps }, mountOptions({ operation: "routes/plugins/set-enabled", authorization: "direct" }, { deferMissingPrincipal: true }));
};

/** `PLUGIN_PREVIEW_STATUS` (GET) then `PLUGIN_PREVIEW` (POST), same order as before. The hook-failure
 *  body stays the host's (`http/plugin-hook-error.ts` logs the plugin's own error, redacted). */
export const registerPluginPreviewRoute: PluginsRouteRegistrar = ({ app, deps }, _options = {}) => {
  const previewDeps = {
    ...pluginPortDeps({ deps }), ...pluginReadDeps({ deps }),
    previewPluginBeforeSave: (...args: Parameters<PluginsRouteDeps["previewPluginBeforeSave"]>) => deps.previewPluginBeforeSave(...args),
    hookFailedError: PluginHookFailedError, pluginHookFailedBody,
  };
  mountAdminJsonRoute({ app, spec: pluginPreviewStatusRoute, deps: previewDeps }, mountOptions({ operation: "routes/plugins/preview", authorization: "guarded" }));
  mountAdminJsonRoute({ app, spec: pluginPreviewRunRoute, deps: previewDeps }, mountOptions({ operation: "routes/plugins/preview", authorization: "guarded" }));
};

/** The host bag the provider-settings and project-key-use registrar reads (moved from the deleted
 *  `routes/plugins/provider-settings.ts`; its wire tests build it directly). */
export interface ProviderSettingsRouteDeps extends Pick<PluginsRouteDeps, "workspaceId" | "authorize" | "discoverPlugins"> {
  tracker?: import('@jini-ai/core/contracts/site/diagnostics-observability').Tracker;
  providerConfig?: ProviderConfigSource;
  ownerPrincipalId?: Promise<string>;
  projectKeys?: import("#src/features/project-keys/service").ProjectKeysPort;
  providerAppliesAt?: (input: { pluginId: string }) => "now" | "restart" | "failed";
  reapplyProvider?: (input: { pluginId: string }) => Promise<import("@jini-ai/plugins/host").PluginProviderApplyResult>;
  /** Whether a key was saved the retired way (an API credential labelled `plugin:<id>`), read by label
   *  only, never decrypted. */
  legacyProviderCredential?: (required: { pluginId: string }) => Promise<boolean>;
}

/** The provider-settings spec deps, each read per request from the host bag (tests reassign fields). */
function providerSettingsDeps({ deps }: { deps: ProviderSettingsRouteDeps }, _optional: Record<string, never> = {}): ProviderSettingsSpecDeps & AdminJsonRoutePortDeps {
  return {
    ...pluginPortDeps({ deps }),
    get tracker() { return deps.tracker; },
    get providerConfig() { return deps.providerConfig; },
    get projectKeys() { return deps.projectKeys; },
    get providerAppliesAt() { return deps.providerAppliesAt; },
    get legacyProviderCredential() { return deps.legacyProviderCredential; },
    discoverPlugins: () => deps.discoverPlugins(),
    declaredFields: ({ records, pluginId }) => declaredProviderSettingFields({ records: records as readonly PluginDiscoveryRecord[], pluginId }),
    // The save rule (composition/provider-settings-save.ts) is shared with the assistant's key card;
    // the live reapply hook is bound here, as the hand-written route passed it.
    saveProviderSettings: (args) => saveProviderSettings({ ...args, config: args.config as ProviderConfigSource, reapply: deps.reapplyProvider }),
  };
}

/**
 * `PLUGIN_PROVIDER_SETTINGS` (`GET`/`PUT`) and the project key use route: Jini specs
 * (`@jini-ai/cms/admin-http/routes/plugins/{provider-settings,project-key-use}`) behind the admin ports
 * (`"guarded"`, `sendAdminFailure`'s route-derived 500 copy, as the hand-written routes had). Only the
 * installation owner's own session may change saved-key grants: the session-only 403 is the mount gate.
 */
export function registerPluginProviderSettingsRoutes({ app, deps }: { app: Express; deps: ProviderSettingsRouteDeps }, _optional: Record<string, never> = {}): void {
  const settingsDeps = providerSettingsDeps({ deps });
  mountAdminJsonRoute({ app, spec: pluginProviderSettingsGetRoute, deps: settingsDeps }, { authorization: "guarded" });
  mountAdminJsonRoute({ app, spec: pluginProviderSettingsSaveRoute, deps: settingsDeps }, { authorization: "guarded" });
  const keyUseDeps = {
    ...pluginPortDeps({ deps }), get projectKeys() { return deps.projectKeys; },
    ownerPrincipalId: async () => deps.ownerPrincipalId, ownerOnlyMessage: "Sign in as the installation owner to change this site's saved key grants.",
  };
  mountAdminJsonRoute({ app, spec: projectKeyUseRoute, deps: keyUseDeps }, {
    authorization: "guarded",
    sessionCredentialOnly: { message: "Use the owner's session to approve or revoke a saved key for this site.", permission: "custom-credentials.write" },
  });
}

/**
 * K1 (RT-K1-adm-plugins): list, set-enabled, files, uninstall and preview (status + run) are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/plugins/*`) mounted behind the admin ports; `RouteDeps` is read only
 * here. `@jini-ai/cms` does not depend on `@jini-ai/plugins`, so the plugin mechanisms and the error
 * classes each ladder maps are injected from here. Still hand-written (non-JSON): chart-providers, install.
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
