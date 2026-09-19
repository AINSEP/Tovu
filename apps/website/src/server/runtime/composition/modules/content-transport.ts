import { installFirstPartyTransportTypes } from "#src/server/runtime/composition/content-transport-manifest";
import { registerContentTransportExportRoute } from "#src/server/inbound/admin-http/routes/content-transport/export";
import type { ContentTransportRouteDeps } from "#src/server/inbound/admin-http/routes/content-transport/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file Task 4 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * The `content-transport` server module: today, one route (the export/pull side). This is the
 * "real consumer" `content-transport-manifest.ts`'s own header says is the natural place to call
 * `installFirstPartyTransportTypes()` — nothing before this module called it, so `post`/`page` were
 * registered contributors that no code path ever read.
 *
 * `installFirstPartyTransportTypes()` runs once per `createApp()` call, mirroring
 * `resetPageHeadRegistry()`'s call at the top of `createApp()` for the same class of problem: a
 * process-wide registry that a hermetic-composition test may rebuild many times per process. Unlike
 * that registry, this one needs no matching RESET here — `registerContentTransportContributor`
 * (Task 2) already replaces by `entityType` key rather than appending, so repeated calls across many
 * `createApp()` invocations never accumulate duplicates, and each registered contributor's `build()`
 * is resolved fresh against the CURRENT request's deps (`export.ts`'s own `toContentTransportDeps`)
 * rather than closing over whichever `createApp()` call happened to register it — so there is no
 * stale-closure risk for a reset to guard against either.
 */
export function createContentTransportModule(deps: ContentTransportRouteDeps): ServerModuleHandle {
  installFirstPartyTransportTypes();
  return {
    name: "content-transport",
    registerRoutes: (app) => {
      registerContentTransportExportRoute(app, deps);
    },
  };
}
