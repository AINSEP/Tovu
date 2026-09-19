// Side-effect import, same shape as `features/pages/permissions.ts`'s own consumers: registers the
// Task 9 built-in-role grants (`publish_content.read`/`publish_content.apply` -> admin) before
// any composition-root code runs — see that module's header for why this must happen here, in the
// static import graph, rather than inline at call time below.
import path from "node:path";

import "#src/features/publish-content/permissions";
import { installFirstPartyPublishContentTypes } from "#src/server/runtime/composition/publish-content-manifest";
import { registerPublishContentExportRoute } from "#src/server/inbound/admin-http/routes/publish-content/export";
import { registerPublishContentBlobsProbeRoute } from "#src/server/inbound/admin-http/routes/publish-content/blobs-probe";
import { registerPublishContentBlobPutRoute } from "#src/server/inbound/admin-http/routes/publish-content/blob-put";
import { registerPublishContentBlobGetRoute } from "#src/server/inbound/admin-http/routes/publish-content/blob-get";
import { registerPublishContentBundleCreateRoute } from "#src/server/inbound/admin-http/routes/publish-content/bundle-create";
import { registerPublishContentImportRoutes } from "#src/server/inbound/admin-http/routes/publish-content/import";
import { registerPublishContentPeerRoutes } from "#src/server/inbound/admin-http/routes/publish-content/peers";
import { registerPublishContentPeerTransportRoutes } from "#src/server/inbound/admin-http/routes/publish-content/peer-transport";
import { registerPublishContentDestinationRoutes } from "#src/server/inbound/admin-http/routes/publish-content/destination";
import { findCandidateDestination } from "#src/features/publish-trust/connect";
import {
  COMMITTED_JSON_CODEC,
  createFileProvisioning,
  PUBLISH_TRUST_CONFIG_PATH,
} from "#src/features/publish-trust/provisioning";
import { nodeProvisioningFileIo, resolveCommittedConfigRoot } from "#src/features/publish-trust/provisioning.node-io";
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
 * is resolved fresh against the CURRENT request's deps (`routes/publish-content/deps.ts`'s shared
 * `toPublishContentDeps`) rather than closing over whichever `createApp()` call happened to
 * register it — so there is no
 * stale-closure risk for a reset to guard against either.
 */
export function createPublishContentModule(deps: PublishContentRouteDeps): ServerModuleHandle {
  installFirstPartyPublishContentTypes();

  // The SOURCE half of publishing trust, composed here for the same reason
  // `publish-trust-grants.ts` composes the destination half at the composition root: the feature
  // owns the merge semantics and stays pure, and only this layer is allowed to touch a disk.
  //
  // Paths are repo-relative — what is written here is committed deploy config, so it belongs to
  // the repo rather than to a site directory — and resolved against `resolveCommittedConfigRoot()`,
  // not the bare process working directory: own-server mode (the desktop shell) runs this module
  // with its cwd wherever opened Electron, not the repo root, which is exactly the "correct
  // primitive, unwired/misfed call site" defect class this file's own header warns about. See that
  // function's own doc for why `process.cwd()` is still its fallback (correct for a plain `tovu
  // serve` and for the deployed container) rather than `import.meta.dirname` arithmetic.
  const repoRoot = resolveCommittedConfigRoot();
  const provisioning = createFileProvisioning({
    io: nodeProvisioningFileIo,
    codec: COMMITTED_JSON_CODEC,
    path: path.join(repoRoot, PUBLISH_TRUST_CONFIG_PATH),
  });
  const findCandidate = () =>
    findCandidateDestination({ io: nodeProvisioningFileIo, resolvePath: (relative) => path.join(repoRoot, relative) });

  return {
    name: "publish-content",
    registerRoutes: (app) => {
      registerPublishContentExportRoute(app, deps);
      registerPublishContentBlobsProbeRoute(app, deps);
      registerPublishContentBlobPutRoute(app, deps);
      // The download half of the same blob channel (2026-09-19) — what makes the PULL direction
      // able to carry media bytes at all. Gated on `publish_content.read`, not `.apply`; see
      // `blob-get.ts`'s own header for why that is the read-side permission and not a relaxation.
      registerPublishContentBlobGetRoute(app, deps);
      registerPublishContentBundleCreateRoute(app, deps);
      registerPublishContentImportRoutes(app, deps);
      // Task 10: peer CRUD, then the outbound push/pull driver that dials a peer's own copies of
      // the routes registered above.
      registerPublishContentPeerRoutes(app, deps);
      registerPublishContentPeerTransportRoutes(app, deps);
      // Zero-setup publishing: the one action that turns a fresh install into one that can publish,
      // without a key ever being minted, displayed or copied. See `destination.ts`'s header for why
      // it lives behind the Publish button rather than on a settings screen.
      registerPublishContentDestinationRoutes(app, deps, { provisioning, findCandidate });
    },
  };
}
