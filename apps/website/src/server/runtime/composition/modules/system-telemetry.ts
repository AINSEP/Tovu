import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import { browserTelemetryRoute } from "@jini-ai/cms/admin-http/routes/system/browser-telemetry";
import { ADMIN_BROWSER_TELEMETRY_PER_PRINCIPAL, createRateLimiter, type RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The admin browser-telemetry registrar (RT-K1-adm-system-2): mounts the Jini spec
 * `@jini-ai/cms/admin-http/routes/system/browser-telemetry` with this host's per-principal budget
 * (`ADMIN_BROWSER_TELEMETRY_PER_PRINCIPAL`), its tracker and the session layer's credential kind.
 */

export type AdminBrowserTelemetryDeps = Pick<RouteDeps, "clock" | "tracker">;

/** This route's own per-principal budget (a browser with a render loop must not flood a vendor). */
export function createBrowserTelemetryLimiter(deps: Pick<RouteDeps, "clock">): RateLimiter {
  return createRateLimiter({ profile: ADMIN_BROWSER_TELEMETRY_PER_PRINCIPAL, clock: deps.clock });
}

/**
 * Registers `POST /api/admin/v1/telemetry` (behind `requireAdminSession`, like all of `/api/admin`).
 * The path has no `:workspaceId` (deployment-level: no workspace guard) and the spec asks for no
 * permission, so the port fields are inert: the authorizer fails closed should a later edit call it.
 * @complexity O(1) setup.
 */
export function registerAdminBrowserTelemetryRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: AdminBrowserTelemetryDeps }, { limiter = createBrowserTelemetryLimiter(deps) }: { limiter?: RateLimiter } = {}): void {
  mountAdminJsonRoute({ errors,
    app,
    spec: { ...browserTelemetryRoute, readHeaders: ["content-length"] },
    deps: {
      workspaceId: "",
      authorize: async () => ({ allowed: false, reason: "browser telemetry authorizes no permission" }),
      tracker: deps.tracker,
      limiter,
      // `context` is the principal copy these admin ports authenticated (the spec only narrows its type).
      credentialKind: ({ context }) => adminRequestFactsFor({ context: context as OperatorPrincipalRecord | undefined }).credentialKind,
    },
  }, { failure: { operation: "routes/system/browser-telemetry", code: "INTERNAL_ERROR" } });
}
