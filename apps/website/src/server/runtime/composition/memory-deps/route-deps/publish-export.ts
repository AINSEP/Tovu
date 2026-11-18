// `type`-only, so it is erased and adds no runtime edge — used only to annotate
// {@link runExportSite} below.
import type { ExportEngine } from "#src/features/deployments/export-run";
import type { RouteDeps } from "../../../../routes/types.js";
// 2026-09-05 (fix-cycle) — used to be a lazy `require()` here; see `runExportSite`'s doc below for
// why a plain static import is now correct.
import { exportSite } from "#src/features/site-export/index";
import { resolvePublishContentPeerHttpClient } from "../../publish-content-http.js";
import { resolveExportOutputRootDir, resolvePublishOutputRootDir, bundledAgentPluginsDir, resolveSourceControlExportRootDir } from "../../site-paths.js";
import { describeSiteBinding } from "#src/platform/site-dir/index";
import { isAdminAssistantEnabled } from "../../admin-assistant-enabled.js";
import { resolveStorefrontProducts } from "../../../../inbound/public-http/routes/site/products.js";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import { listPublishedPosts } from "#src/features/post/index";
import { InMemoryPublishHistoryStore, InMemoryPublishCredentialVerificationCache } from "#src/features/deployments/static-publish/index";
import { executionModeFromEnv } from "#src/features/deployments/publish-credentials/index";
import { loadBundledDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";
import { readBundledDeployWorkflowFiles } from "#src/features/deployments/index";
import { loadBundledDeployOpsRegistry } from "#src/features/deployments/deploy-ops/registry";
import { loadBundledSourceControlProviderRegistry } from "#src/features/source-control/provider-registry";
import { loadMailCredentialCards } from "../../../boot/mail-provider-catalog.js";
import { loadBundledMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { loadBundledCredentialSchemeRegistry } from "#src/features/agent-plugins/auth-schemes";
import { InMemorySourceControlCredentialSetRepo } from "#src/features/source-control/index";
import { InMemoryVendorCredentialSetRepo } from "#src/features/deployments/publish-credentials/repo.memory";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { CUSTOM_CREDENTIALS_EGRESS_POLICY, SINGLE_HOP_HTTPS_EGRESS_POLICY, MEDIA_IMPORT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { createMediaProviderRegistry } from "@jini-ai/integrations/media-providers";
import { resolveActiveTheme, NO_THEME_ID } from "#src/features/theme/index";
import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";

/**
 * `exportSite`, now a plain static reference — until 2026-09-05 this was resolved at CALL time via a
 * lazy `require()`, to break a cycle that no longer exists.
 *
 * THE CYCLE THIS USED TO BREAK, AND WHY IT'S GONE. The original justification (2026-08-15, this
 * doc's own prior text): `features/site-export/site-exporter.ts` imported `createApp` from THIS file, so
 * a static `import { exportSite } from "#src/features/site-export/index"` here would have closed
 *
 *     server/app.ts -> export/index.ts -> export/site-exporter.ts -> server/app.ts
 *
 * and the daemon (`server/inbound/assistant/agent-daemon-server.ts`, which imports this file for
 * `createRouteDeps`) crashed on every boot with `TypeError: Cannot read properties of undefined
 * (reading 'createInMemoryChatStoreFactory')` when that edge closed eagerly. That back-edge was
 * removed for real on 2026-08-16 (generalized 2026-08-20, "RouteDeps-narrowing pass 2"):
 * `site-exporter.ts` no longer imports `server/app.ts` at all, static OR lazy — it boots the app via
 * `options.routeDeps.createSiteApp()`, injected through `RouteDeps` (see that file's own header
 * comment and `routes/types.ts`'s `createSiteApp` doc). This file's lazy `require()` for the
 * OPPOSITE direction (this file calling INTO `features/site-export`) was never actually needed once that
 * injection landed — it just never got revisited, including across two path-rewrite commits
 * (`03cc71442`, `e031173e4`) that mechanically edited these very lines without re-checking the cycle
 * claim.
 *
 * VERIFIED 2026-09-05, not assumed: `features/site-export`'s complete runtime closure (`ports.ts`,
 * `route-manifest.ts`, `site-exporter.ts`, `export-failure-summary.ts`, `index.ts`, and everything
 * THEY import — `features/theme`, `features/post`, `features/presentation`, `features/redirects`,
 * `platform/routing`, `contracts/core`) contains zero imports of this file or any `#src/server/**`
 * module — confirmed by direct source read of every file in that closure, a repo-wide grep for any
 * specifier reaching `runtime/composition/app`, and independently by `.dependency-cruiser.mjs`'s own
 * 2026-08-28 cross-validated (DFS + `no-circular` + madge) 5-SCC baseline, which names the real
 * `deps.ts`/`app.ts`/`deployment-overview.ts` cycle (deps.ts closed the same cycle via a static
 * import as of 2026-09-16, t91 F4.1-A — see that file's own doc) but does not include this edge. This file already statically
 * imports every one of those modules' own dependencies anyway (`#src/features/theme/index`,
 * `#src/features/post/index`, `#src/features/presentation/index`, `#src/features/redirects/index`,
 * `#src/platform/routing/index`, `#src/contracts/core/**` are all imported above), so this static
 * import adds `features/site-export`'s own 5 files to this file's runtime closure and nothing else.
 *
 * Also fixes a real defect, not just cleanup: the lazy `require()` ran tsx's CJS loader over
 * `features/site-export`'s whole barrel graph inside processes that had already loaded the same files
 * via tsx's ESM loader (any in-process test that calls `routeDeps.exportSiteBound`/`runExportSite`,
 * e.g. `commit-site.ts`, `static-publish/adapter.ts`), producing two V8 coverage images per file that
 * lcov merges into one corrupted `SF:` block — see
 * `ADS-memory/reports/2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`'s "Route A".
 */
const runExportSite: ExportEngine<RouteDeps> = (options, _optional = {}) => exportSite(options);

/** Publish-content stores, the export engine and the nullary closures over the final routeDeps. */
export function memoryPublishExportDeps(required: MemoryRootContext, _optional = {}) {
  const {
    createSiteApp,
    fileBlobIndex,
    options,
    publishContentApplyPort,
    publishContentBaselineRepo,
    publishContentBundleRepo,
    publishContentPeerRepo,
    publishContentRunRepo,
    publishContentSeedHash,
    routeDeps,
  } = required;
  return {
    // Task 6 of the publish-content (Publish Content) feature — hermetic double for
    // `server/runtime/composition/deps.ts`'s real `SqlitePublishContentBundleRepo`. Hoisted above
    // (not constructed inline) so Task 8's `publishContentApplyPort` reads the SAME store. See
    // `routes/types.ts`'s `publishContentBundleRepo` doc.
    publishContentBundleRepo,
    // `publish-files-plan-2026-09-24.md` §3 — hoisted above so it is the SAME instance a `pack()`
    // fills and a route reads. See `routes/types.ts`'s `fileBlobIndex` doc.
    fileBlobIndex,
    // Task 7 — hermetic double for `server/runtime/composition/deps.ts`'s real
    // `SqlitePublishContentBaselineRepo`. Hoisted above for the same reason. See
    // `routes/types.ts`'s `publishContentBaselineRepo` doc.
    publishContentBaselineRepo,
    // Task 8 — the real apply loop (`apply-loop.ts`). See `routes/types.ts`'s
    // `publishContentApplyPort` doc.
    publishContentApplyPort,
    publishContentSeedHash,
    // Task 8 — the apply loop's audit trail. See `routes/types.ts`'s `publishContentRunRepo` doc.
    publishContentRunRepo,
    // Task 10 — peers + the guarded outbound client that dials them. The client is built from
    // `createPublishContentPeerEgressPolicy()` with the same operator-set `devHostAllowlist` the
    // SQLite root reads, so a hermetic app is not accidentally more permissive than a real one.
    publishContentPeerRepo,
    publishContentPeerHttpClient: resolvePublishContentPeerHttpClient({}, options.publishContentPeerHttpClient ? { client: options.publishContentPeerHttpClient } : {}),
    // 2026-08-15 — the real export engine, bound here rather than imported inside
    // `features/deployments/export-run.ts`/`export-site.ts` — see `routes/types.ts`'s
    // `runExportSite` doc for why that indirection is required, not stylistic. NOT resolved lazily
    // any more; see {@link runExportSite} (the local const below, shadowing this field's own name)
    // for why a plain static import replaced the `require()` this used to carry.
    runExportSite,
    // Read ONCE here rather than deep in `export-run.ts`/`cli/commands/export.ts` — see
    // `apps/website/src/server/runtime/composition/deps.ts`'s `resolveExportOutputRootDir` doc and `routes/types.ts`'s
    // `exportOutputRootDir` doc. Rooted at the same `describeSiteBinding()` this root reports as
    // `siteBinding`, as are the publish and source-control roots below.
    exportOutputRootDir: resolveExportOutputRootDir({ siteDir: describeSiteBinding().dir }),
    // Read ONCE here — see `routes/types.ts`'s `adminAssistantEnabled` doc. This module's own
    // mount-gating code below reads THIS field rather than calling `isAdminAssistantEnabled()` a
    // second time, so the value never disagrees with which admin-assistant routes are actually live.
    adminAssistantEnabled: isAdminAssistantEnabled(),
    // Built in `createRouteDeps` (app.ts): this file must not import `createApp`, which would close a cycle
    // through `app.ts`. See the comment there for the nullary closure and its test gotcha.
    createSiteApp,
    // 2026-08-16 — see `routes/types.ts`'s `resolveStorefrontProducts` doc (edge 2 of the
    // export<->server decoupling): a direct reference, same reasoning as `createSiteApp` above
    // (`resolveStorefrontProducts` is declared in `./routes/site/products`, already imported by
    // this file to register the real product routes).
    //
    // 2026-08-20 (RouteDeps-narrowing pass 2) — same nullary-closure conversion as `createSiteApp`
    // immediately above, same reasoning, same TEST GOTCHA.
    resolveStorefrontProducts: () => resolveStorefrontProducts(routeDeps()),
    // 2026-09-03 — see `routes/types.ts`'s `resolveActiveThemeId`/`listPublishedPosts` docs: closes
    // the `platform <-> features/presentation`/`platform <-> features/post` module cycles
    // `check:architecture` flagged (`features/site-export/route-manifest.ts` no longer imports either
    // function directly). Same nullary-closure-over-`routeDeps` shape as `resolveStorefrontProducts`
    // immediately above.
    resolveActiveThemeId: () => resolveActiveThemeId(routeDeps()),
    listPublishedPosts: () =>
      listPublishedPosts({ deps: { repo: routeDeps().postRepo }, input: { workspaceId: routeDeps().workspaceId } }),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Publish history and the bundled deploy / source-control / mail / auth-scheme registries. */
export function memoryDeployRegistryDeps(_required: MemoryRootContext, _optional = {}) {
  return {
    // 2026-08-16 rework — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real `SqlitePublishHistoryStore`;
    // see `routes/types.ts`'s `publishHistoryStore` doc.
    publishHistoryStore: new InMemoryPublishHistoryStore(),
    // 2026-08-15 (Contract v2) — see `routes/types.ts`'s `publishExecutionMode` doc.
    // `executionModeFromEnv()` (not a hardcoded `"self-hosted-cli"`) so a test can still exercise
    // `TOVU_EXECUTION_MODE=hosted-api-only` against this hermetic root.
    publishExecutionMode: executionModeFromEnv(),
    // Read ONCE here rather than deep in `static-publish/adapter.ts` — see `apps/website/src/server/runtime/composition/deps.ts`'s
    // `resolvePublishOutputRootDir` doc and `routes/types.ts`'s `publishOutputRootDir` doc.
    publishOutputRootDir: resolvePublishOutputRootDir({ siteDir: describeSiteBinding().dir }),
    // Hermetic: every bundled plugin's own source directory (each hosting plugin ships its own
    // targets), no install or activation step — see `routes/types.ts`'s `loadDeployTargets` doc.
    loadDeployTargets: () =>
      loadBundledDeployTargetRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    loadDeployWorkflowFiles: async () => readBundledDeployWorkflowFiles({ sourceRoot: bundledAgentPluginsDir() }),
    loadDeployOps: () => loadBundledDeployOpsRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    // Hermetic the same way: every bundled source-control declaration — see `routes/types.ts`'s
    // `loadSourceControlProviders` doc.
    loadSourceControlProviders: () =>
      loadBundledSourceControlProviderRegistry({ sourceRoot: bundledAgentPluginsDir() }),
    // And the bundled plugins' own key cards — see `routes/types.ts`'s `loadPluginCredentialCards` doc.
    loadPluginCredentialCards: () =>
      loadMailCredentialCards({ loadMailAdapters: () => loadBundledMailAdapterRegistry({ sourceRoot: bundledAgentPluginsDir() }) }),
    // And the bundled plugins' credential scheme rules — see `routes/types.ts`'s `loadAuthSchemes` doc.
    loadAuthSchemes: async () =>
      (await loadBundledCredentialSchemeRegistry({ sourceRoot: bundledAgentPluginsDir() })).rules,
    // 2026-08-16 — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real (also in-memory — see
    // `routes/types.ts`'s `publishCredentialVerificationCache` doc for why this cache is
    // deliberately never DB-backed) instance.
    publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache(),
    // 2026-08-15 — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real
    // `SqliteSourceControlCredentialSetRepo`; see `routes/types.ts`'s
    // `sourceControlCredentialSetRepo` doc.
    sourceControlCredentialSetRepo: new InMemorySourceControlCredentialSetRepo(),
    // Read ONCE here rather than deep in `source-control/commit-site.ts` — see `apps/website/src/server/runtime/composition/deps.ts`'s
    // `resolveSourceControlExportRootDir` doc and `routes/types.ts`'s `sourceControlExportRootDir`
    // doc.
    sourceControlExportRootDir: resolveSourceControlExportRootDir({ siteDir: describeSiteBinding().dir }),
    // 2026-08-16 (Phase 3) — hermetic double for `apps/website/src/server/runtime/composition/deps.ts`'s real
    // `SqliteVendorCredentialSetRepo`; see `routes/types.ts`'s `vendorCredentialSetRepo` doc.
    vendorCredentialSetRepo: new InMemoryVendorCredentialSetRepo({}),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Custom credentials, the guarded HTTP clients, the export bound to routeDeps and the static site context. */
export function memoryClientsAndSiteContextDeps(required: MemoryRootContext, _optional = {}) {
  const {
    customCredentialSetRepo,
    guardedOutboundHttpClient,
    routeDeps,
    siteBinding,
  } = required;
  return {
    customCredentialSetRepo,
    // `features/custom-credentials`'s two agent tools need a guarded `HttpClientPort` — see
    // `routes/types.ts`'s `customCredentialsHttpClient` doc. `createDefaultHttpClient` performs no
    // I/O until a request is actually sent, so building a real one here (rather than a fake) keeps
    // this hermetic composition root's own tests exercising the real SSRF-guard/host-binding path.
    // `CUSTOM_CREDENTIALS_EGRESS_POLICY`: the SAME policy `apps/website/src/server/runtime/composition/deps.ts` uses for its own instance
    // (2026-09-10) — see that export's own doc for why this domain needed to follow a GET redirect
    // (GitHub's Actions job-logs endpoint 302s to a signed Azure Blob URL) and could no longer share
    // the mailer's zero-redirect `SINGLE_HOP_HTTPS_EGRESS_POLICY`.
    customCredentialsHttpClient: createDefaultHttpClient({ policy: CUSTOM_CREDENTIALS_EGRESS_POLICY }),
    deployOpsHttpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }),
    // 2026-09-06 — `features/media-import`'s `media_import_from_url`. Same reasoning as the line
    // above (a real guarded client, not a fake, so this hermetic composition root's own tests
    // exercise the real SSRF guard), built from `MEDIA_IMPORT_EGRESS_POLICY` instead — see
    // `routes/types.ts`'s `mediaImportHttpClient` doc for why the two policies cannot be shared.
    mediaImportHttpClient: createDefaultHttpClient({ policy: MEDIA_IMPORT_EGRESS_POLICY }),
    mediaGenerationHttpClient: guardedOutboundHttpClient,
    // Built-in vendors only: this hermetic root reads no plugin modules at construction (same rule as
    // the plugin seams above); `deps.ts` adds plugin vendors via `loadMediaProviderRegistry`.
    mediaProviderRegistry: createMediaProviderRegistry(),
    // 2026-08-20 (RouteDeps-narrowing fix) — see `routes/types.ts`'s `exportSiteBound` doc. `routeDeps`
    // spread LAST: this self-referencing closure captures the `const routeDeps` binding below (safe —
    // the arrow body only runs after `createRouteDeps()` has returned, by which point `routeDeps` is
    // fully constructed), and it must always win over whatever `opts` a caller passes, even if that
    // `opts` happens to carry its own `routeDeps` key (see `routes/types.ts`'s own doc on this field
    // for the exact bug this ordering closes).
    // 2026-09-05 (fix-cycle) — plain static reference now; see `runExportSite`'s doc below for why
    // the lazy `require()` this used to carry is gone.
    exportSiteBound: (opts) => exportSite({ ...opts, routeDeps: routeDeps() }),
    staticSiteContext: async () => {
      const theme = resolveActiveTheme({ deps: routeDeps(), activeThemeId: await routeDeps().resolveActiveThemeId() });
      return { name: routeDeps().siteDisplayName.read() ?? siteBinding.name, slug: siteBinding.name,
        theme: theme && typeof theme === "object" ? theme.manifest.name : "None",
        themeId: theme && typeof theme === "object" ? theme.manifest.id : NO_THEME_ID };
    },
  } satisfies Partial<MemoryRouteDeps>;
}
