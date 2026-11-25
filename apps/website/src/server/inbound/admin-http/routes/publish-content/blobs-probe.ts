import { blobsProbeRoute } from "@jini-ai/cms/admin-http/routes/publish-content/blobs-probe";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";

import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { rejectOversizedJsonBody } from "#src/server/inbound/shared/body-size-limit";
import type { PublishContentRouteRegistrar } from "./deps.js";

/**
 * `POST .../publish-content/blobs/probe` (Task 6): the Jini spec behind the admin ports (`"guarded"`, the
 * route's own 500 copy). The body cap stays this host's middleware in the SAME route registration, through the
 * mount's `bodyParsers` slot (ahead of the handler): its 413 body `{ error: "Content too large to save.", code:
 * "PAYLOAD_TOO_LARGE" }` predates the kit's envelope, it answers before the workspace 404 as before, and the
 * route-table pin keeps its middleware-plus-handler row. The spec declares no `maxBodyBytes`, so the body is
 * measured once. The route's rationale and the flat 400 bodies live with the spec.
 */
export const registerPublishContentBlobsProbeRoute: PublishContentRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: blobsProbeRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, blobStore: deps.blobStore } },
    {
      authorization: "guarded",
      failure: { operation: "routes/publish-content/blobs-probe", code: "INTERNAL_ERROR" },
      bodyParsers: [rejectOversizedJsonBody({ maxBytes: CONTENT_ENTRY_MAX_BODY_BYTES })],
    },
  );
};
