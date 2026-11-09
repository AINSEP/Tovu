import { resolveHostSignals } from "#src/server/runtime/composition/host-signals";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { createPluginModuleImporter, type PluginBeforeSavePreview, pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import { createPluginRuntimeCore, type PluginRuntimeCoreBindings, type PluginRuntimeSource, type PluginRuntimeText } from "@jini-ai/plugins/host/node";
import type { BundledBrowserProviderApproval, PluginSourcePolicyPort } from '@jini-ai/plugins/host';
import { createSitePluginPolicy } from '#src/features/plugin-runtime/install';

import type { Clock as ClockPort } from "@jini-ai/core/primitives";

import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import type { DeclaredContentTypePorts } from "@jini-ai/plugins/host";
import type { ExtensionClaim } from "@jini-ai/plugins/host";
import type { Tier2CallRunner } from "@jini-ai/plugins/host/worker";
import { createTier2WorkerRunner } from "#src/server/runtime/plugin-tier2/run-in-worker";
import type { BeforeSaveHookPort } from "#src/features/post/index";

/**
 * Extract-s6 L1c: the plugin-owned runtime core (`createPluginRuntimeCore`, its port types, the
 * package-location/uninstall-path guards and `PluginRuntimeSource`) now lives in
 * `@jini-ai/plugins/host/node` (`runtime-core.ts`). Re-exported here so every existing importer keeps
 * its path; `PluginUninstallPathError` is the same class object, so `instanceof` checks are unchanged.
 * This module keeps only Tovu's wiring: env/host-signals policy, the worker runner, the SDK host
 * binding, telemetry projection, lookup and wording.
 */
export { createPluginRuntimeCore, PluginUninstallPathError } from "@jini-ai/plugins/host/node";
export type { PluginRuntimeCoreBindings, PluginRuntimeCoreOptional, PluginRuntimeCoreRequired, PluginRuntimeHostBinding, PluginRuntimeLookup, PluginRuntimeSource, PluginRuntimeText, PluginRuntimeTracker } from "@jini-ai/plugins/host/node";

export interface ComposePluginRuntimeRequired {
  readonly productTracker?: () => Pick<Tracker, 'capture'>;
  /** Review pins and first-boot defaults supplied only by the product composition roots. */
  readonly browserProviderApprovals?: readonly BundledBrowserProviderApproval[];
  readonly bundledEnabledIds?: readonly string[];
  readonly pluginSourcePolicy?: PluginSourcePolicyPort;
  readonly getPluginHost?: () => import("#src/contracts/headless/index").PluginHostPort | undefined;
  readonly workspaceId: string;
  readonly clock: ClockPort;
  readonly activationRepo: PluginActivationRepoPort;
  readonly sources: readonly PluginRuntimeSource[];
  /** Consecutive hook failures before quarantine. Omitted uses the registry default. */
  readonly failureThreshold?: number;
  /** Runs one Tier-2 (`tier: "tier-2"`) plugin call in isolation. Omitted ⇒ a fresh Node worker
   * per call (`server/runtime/plugin-tier2/run-in-worker.ts`); tests inject a shorter timeout. */
  readonly tier2CallRunner?: Tier2CallRunner;
  /** Site-installed plugin scan root, forwarded verbatim to `discoverPlugins({ installDir })`
   * (REQ-02). Omitted ⇒ legacy mode: built-ins only, identical to today's behavior (discovery.ts's
   * own EC-09/AC-16 contract) — this parameter only ADDS reachability for site-installed plugins,
   * it never changes what a caller who omits it observes. */
  readonly installDir?: string;
  /** Names core itself holds (routes, tools, permissions, tables, … — `claim-conflicts.ts` claims,
   * prefix claims allowed). A plugin claiming one is refused at enable and quarantined at boot.
   * Omitted ⇒ no core claims: plugin-vs-plugin conflicts are still detected. The real roots pass
   * `TOVU_CORE_EXTENSION_CLAIMS` (`core-extension-claims.ts`). */
  readonly coreClaims?: readonly ExtensionClaim[];
  /** Where plugins' declared content types are created (AW-7 Tier 1) — the roots bind
   * `createDeclaredContentTypePorts` over their content-type repo. Omitted ⇒ a plugin that declares
   * content types is refused at enable (see `declarative-enable.ts`). */
  readonly declaredContentTypes?: DeclaredContentTypePorts;
}

/** The product-typed view composition roots consume; member names and docs are the core's. */
export interface PluginRuntimeBindings extends Omit<PluginRuntimeCoreBindings, "beforeSaveHook" | "previewPluginBeforeSave"> {
  readonly beforeSaveHook: BeforeSaveHookPort;
  /** Admin preview (AW-7): one attached plugin's beforeSave patch for a draft, nothing saved or
   * counted toward quarantine. `null` ⇒ not attached. See `HookRegistry.previewBeforeSave`. */
  readonly previewPluginBeforeSave: PluginBeforeSavePreview;
}

/**
 * Server-layer composition for SPEC-005's runtime half. The application roots own the concrete
 * activation repo/source list; this helper builds the per-load core handles, delegates module
 * ownership/setup to `loadPlugin()`, and performs the one shared attach operation only after setup
 * has completed successfully.
 */
export function composePluginRuntime(required: ComposePluginRuntimeRequired, _optional: Record<string, never> = {}): PluginRuntimeBindings {
  const { productTracker, getPluginHost, pluginSourcePolicy, tier2CallRunner, workspaceId, clock, activationRepo, sources, ...optionalInputs } = required;
  const core = createPluginRuntimeCore({
    workspaceId, clock, activationRepo, sources,
    pluginSourcePolicy: pluginSourcePolicy ?? createSitePluginPolicy({ env: process.env, hostSignals: resolveHostSignals({ env: process.env }) }),
    tier2CallRunner: tier2CallRunner ?? createTier2WorkerRunner({}),
    pluginSdkBinding: pluginHostBinding.pluginSdkBinding,
    hostBinding: pluginHostBinding,
    createModuleImporter: createPluginModuleImporter,
    text: TOVU_PLUGIN_RUNTIME_TEXT,
    quarantineTelemetry: ({ pluginId }) => ({ event: { name: "plugin_quarantined", userId: "system" }, options: { properties: { pluginId, pluginKind: "cms", reasonClass: "lifecycle" } } }),
  }, {
    ...(productTracker === undefined ? {} : { tracker: productTracker }),
    ...(getPluginHost === undefined ? {} : { lookup: getPluginHost }),
    ...optionalInputs,
  });
  return { ...core, beforeSaveHook: core.beforeSaveHook, previewPluginBeforeSave: core.previewPluginBeforeSave };
}

/** Tovu's exact runtime wording (tool names, manifest file name, route prefix). */
const TOVU_PLUGIN_RUNTIME_TEXT: PluginRuntimeText = {
  // readDefinedPlugin accepts this SDK wrapper ABI; no package imports are needed from an
  // external site's Documents folder. Owner: full server access for now. Follow-up: sandbox tier-3.
  scaffoldEntry: `export default { definition: { setup(sdk) {
  /* Register declared content filters here.
   * To add the examples below, declare capabilities http.route.register and tools.register,
   * and contributes: { routes: ['GET /hello'], tools: ['echo'] } in tovu.plugin.json.
   * Routes mount at /api/p/<plugin-id>/hello. Widgets use render.contribute and contributes.widgets.
   * sdk.routes.add({ method: 'GET', path: '/hello', access: 'public', handler: () => ({ body: { hello: true } }) });
   * sdk.tools.add({ name: 'echo', description: 'Echo input', inputSchema: { type: 'object' }, handler: ({ input }) => input });
   * sdk.widgets.add({ name: '<declared-widget-name>', render: () => '<strong>Hello</strong>' });
   */
} } };\n`,
  reloadApprovalRequired: ({ added }) => `PLUGIN_APPROVAL_REQUIRED: this version adds ${added.join(', ')}. The approved version keeps running; ask the owner to approve it by enabling it again with plugins_set_enabled.`,
  restoreFailedReason: 'Source reload and restored-version reload failed; fix the draft or use plugin_source_rollback.',
};
