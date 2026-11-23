import type { Express } from "express";

import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import { commerceStatusRoute } from "@jini-ai/cms/admin-http/routes/commerce/status";
import { readCommerceStatus } from "@jini-ai/commerce";

/**
 * @file The Commerce status route's registrar (a Jini route spec mounted behind the admin ports).
 *
 * Production leaves Commerce unmounted: only tests mount this explicitly, which preserves the future
 * CMS authorization adapter. The registrar binds the one host-owned thing the spec cannot import,
 * the Commerce package's `readCommerceStatus`, to this request's optional payment runtime.
 */

/** Dependencies required by the Commerce status transport adapter. */
export type AdminCommerceStatusDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & { lipay?: import("@jini-ai/commerce").CommercePaymentRuntimePort };

/**
 * Registers the authenticated, workspace-scoped Commerce operational-status endpoint.
 *
 * @param app - Express application receiving the route.
 * @param deps - Tenant, authorization, and optional payment-runtime dependencies.
 * @returns Nothing; registration mutates only the supplied Express router.
 * @complexity O(1) per registration.
 */
export function registerAdminCommerceStatusRoute(
  { app, deps }: { app: Express; deps: AdminCommerceStatusDeps },
  _optional: Record<string, never> = {}
): void {
  mountAdminJsonRoute(
    {
      app,
      spec: commerceStatusRoute,
      deps: {
        workspaceId: deps.workspaceId,
        // `authorize` and the payment runtime are read per request, as the hand-written route read `deps.*`.
        authorize: (params) => deps.authorize(params),
        readCommerceStatus: ({ workspaceId }) => readCommerceStatus({ workspaceId, resolvePaymentRuntime: () => deps.lipay ?? null }),
      },
    },
    // Never consulted the publishing-credential override (`authorizeDirectOrRespond`).
    { authorization: "direct", failure: { operation: "routes/commerce/status", code: "INTERNAL_ERROR" } },
  );
}
