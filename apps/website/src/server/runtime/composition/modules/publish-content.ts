// Side-effect import, same shape as `features/pages/permissions.ts`'s own consumers: registers the
// Task 9 built-in-role grants (`publish_content.read`/`publish_content.apply` -> admin) before
// any composition-root code runs — see that module's header for why this must happen here, in the
// static import graph, rather than inline at call time below.
import "#src/features/publish-content/permissions";
import { installFirstPartyPublishContentTypes } from "#src/server/runtime/composition/publish-content-manifest";
import { registerPublishContentExportRoute } from "#src/server/inbound/admin-http/routes/publish-content/export";
import { registerPublishContentBlobsProbeRoute } from "#src/server/inbound/admin-http/routes/publish-content/blobs-probe";
import { registerPublishContentBlobPutRoute } from "#src/server/inbound/admin-http/routes/publish-content/blob-put";
import { registerPublishContentBundleCreateRoute } from "#src/server/inbound/admin-http/routes/publish-content/bundle-create";
import { registerPublishContentImportRoutes } from "#src/server/inbound/admin-http/routes/publish-content/import";
import { registerPublishContentPeerRoutes } from "#src/server/inbound/admin-http/routes/publish-content/peers";
import { registerPublishContentPeerTransportRoutes } from "#src/server/inbound/admin-http/routes/publish-content/peer-transport";
import type { PublishContentRouteDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file Task 4 + Task 6 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 tasks 4 and 6.
 *
 * The `publish-content` server module: the export/pull route (Task 4) plus the blob pre-flight
 * and bundle-staging routes (Task 6: `blobs/probe`, `blobs/:sha`, `bundles`). This is the
 * "real consumer" `publish-content-manifest.ts`'s own header says is the natural place to call
 * `installFirstPartyPublishContentTypes()` — nothing before this module called it, so `post`/`page` were
 * registered contributors that no code path ever read.
 *
 * `installFirstPartyPublishContentTypes()` runs once per `createApp()` call, mirroring
 * `resetPageHeadRegistry()`'s call at the top of `createApp()` for the same class of problem: a
 * process-wide registry that a hermetic-composition test may rebuild many times per process. Unlike
 * that registry, this one needs no matching RESET here — `registerPublishContentContributor`
 * (Task 2) already replaces by `entityType` key rather than appending, so repeated calls across many
 * `createApp()` invocations never accumulate duplicates, and each registered contributor's `build()`
 * is resolved fresh against the CURRENT request's deps (`export.ts`'s own `toPublishContentDeps`)
 * rather than closing over whichever `createApp()` call happened to register it — so there is no
 * stale-closure risk for a reset to guard against either.
 */
export function createPublishContentModule(deps: PublishContentRouteDeps): ServerModuleHandle {
  installFirstPartyPublishContentTypes();
  return {
    name: "publish-content",
    registerRoutes: (app) => {
      registerPublishContentExportRoute(app, deps);
      registerPublishContentBlobsProbeRoute(app, deps);
      registerPublishContentBlobPutRoute(app, deps);
      registerPublishContentBundleCreateRoute(app, deps);
      registerPublishContentImportRoutes(app, deps);
      // Task 10: peer CRUD, then the outbound push/pull driver that dials a peer's own copies of
      // the routes registered above.
      registerPublishContentPeerRoutes(app, deps);
      registerPublishContentPeerTransportRoutes(app, deps);
    },
  };
}
