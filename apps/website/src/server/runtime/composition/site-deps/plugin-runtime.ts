import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { RECHARTS_BROWSER_APPROVAL } from "../charts-recharts-source.js";
import { RECHARTS_RUNTIME_SOURCE } from "../charts-recharts-source.js";
import { TOVU_CORE_EXTENSION_CLAIMS } from "../core-extension-claims.js";
import { WORD_COUNT_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/word-count/index";
import { composePluginRuntime } from "../plugin-runtime.js";
import { createDeclaredContentTypePorts } from "../declared-content-types.js";
import { deferDeclaredContentTypePorts } from "@jini-ai/plugins/host";
import { pluginsInstallDir } from "../site-paths.js";
import type { RouteDeps } from "../../../routes/types.js";
import { type CreateSiteRouteDepsOverrides, type resolveSiteBindingOverride, pluginFailureThresholdOverride } from "./overrides.js";
import type { followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import type { SqliteContentTypeRepo } from "#src/features/content-types/repo.sqlite";
import type { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";

interface ComposeSitePluginRuntimeRequired {
  lifecycleTracker: () => Pick<RouteDeps['tracker'], 'capture'>;
  routeDepsBuiltForPluginHost: () => { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;
  workspaceId: string;
  clock: { nowMs: () => number; nowIso: () => string };
  pluginActivationRepo: ReturnType<typeof followProviderActivations>;
  resolvedSiteBinding: ReturnType<typeof resolveSiteBindingOverride>;
  contentTypeRepo: () => SqliteContentTypeRepo;
  idGen: { newId: () => string };
  outbox: () => SqliteOutboxAdapter;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
}

export function composeSitePluginRuntime(required: ComposeSitePluginRuntimeRequired, _optional = {}) {
  const { lifecycleTracker, routeDepsBuiltForPluginHost, workspaceId, clock, pluginActivationRepo, resolvedSiteBinding, contentTypeRepo, idGen, outbox, overrides } = required;
  const pluginRuntime = composePluginRuntime({
    productTracker: () => lifecycleTracker(),
    getPluginHost: () => routeDepsBuiltForPluginHost()?.pluginHost,
    workspaceId,
    clock,
    activationRepo: pluginActivationRepo,
    // content-analyzer (AW-7 Tier 2) is tier-2: compiled in, disabled until enabled, and its code
    // only ever runs in a fresh worker per call (`plugin-runtime.ts`'s tier-2 import seam).
    sources: [WORD_COUNT_RUNTIME_SOURCE, CONTENT_ANALYZER_RUNTIME_SOURCE, RECHARTS_RUNTIME_SOURCE],
    browserProviderApprovals: [RECHARTS_BROWSER_APPROVAL],
    bundledEnabledIds: [RECHARTS_RUNTIME_SOURCE.manifest.id],
    // Reachability fix: previously omitted entirely, so `discoverPlugins()` only ever scanned the
    // compiled-in built-in registry — a plugin placed on disk (REQ-02's install layout) was
    // invisible to every real boot of this composition root, no matter how it got there.
    installDir: pluginsInstallDir({ siteDir: resolvedSiteBinding.dir }),
    coreClaims: TOVU_CORE_EXTENSION_CLAIMS,
    // AW-7 Tier 1: plugins' declared content types go through core's own `registerContentType`.
    // Deferred: `contentTypeRepo`/`outbox` are declared further down, and enable never runs during
    // composition.
    declaredContentTypes: deferDeclaredContentTypePorts({
      build: () => createDeclaredContentTypePorts({ repo: contentTypeRepo(), clock, ids: idGen, outbox: outbox() }),
    }),
    ...pluginFailureThresholdOverride(overrides),
  });
  return { pluginRuntime };
}
