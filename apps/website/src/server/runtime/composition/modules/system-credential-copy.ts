import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";
import { credentialCopyGrantRoute, credentialCopyListRoute, type CredentialCopyRouteDeps } from "@jini-ai/cms/admin-http/routes/system/credential-copy";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { adminRequestFactsFor } from "#src/server/inbound/admin-http/admin-request-facts";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file K1 (RT-K1-adm-system-1): the Shared Keys "use a saved key" picker is the Jini specs
 * `credentialCopyListRoute` / `credentialCopyGrantRoute`, mounted behind the admin ports. The mount
 * keeps the hand-written gate order (`credential-copy.wire.test.ts`): `Cache-Control: no-store` on
 * every answer, the owner-session 403 AHEAD of the workspace 404 (`authenticateBeforeWorkspace`), and
 * the route's own redacted `copy-failed` 500. The registrar binds what the specs cannot see: the seeded
 * owner, the instance admission, the project key store and the request's local-host answer
 * (`adminRequestFactsFor(...).localAdmin`, the same `isLocalAdminRequest` the route called).
 */

type Deps = Pick<RouteDeps, "workspaceId" | "ownerPrincipalId" | "authorize" | "gatedMutations" | "projectKeys">;

const CREDENTIAL_COPY_MOUNT: AdminJsonRouteMountOptions = {
  sessionCredentialOnly: { message: "Use the owner's session to use saved keys.", permission: "system.write" },
  authenticateBeforeWorkspace: true,
  failure: {
    operation: "routes/system/credential-copy", code: "INTERNAL_ERROR", field: "message",
    message: "Using the saved key failed. Reopen Shared Keys and choose the key again.", details: { reasonCode: "copy-failed" },
  },
};

/** Owner-only browser picker; one approval submits one reference to this server-bound site.
 * @complexity O(1) per request besides the injected collaborators. */
export function registerAdminCredentialCopyRoutes({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: Deps }, _optional: Record<string, never> = {}): void {
  // Every field is read per request, as the hand-written route read `deps` (tests and boot swap them).
  const routeDeps: CredentialCopyRouteDeps & Pick<RouteDeps, "workspaceId" | "authorize"> = {
    workspaceId: deps.workspaceId,
    authorize: (params) => deps.authorize(params),
    ownerPrincipalId: async () => await deps.ownerPrincipalId,
    admitInstance: async (args) => {
      const instance = deps.gatedMutations.gatewayDeps.authorizeInstance;
      return !instance || (await instance(args)).allowed;
    },
    projectKeys: () => deps.projectKeys,
    isLocalRequest: ({ context }) => adminRequestFactsFor({ context: context as OperatorPrincipalRecord }).localAdmin,
  };
  const responseHeaders = { "Cache-Control": "no-store" };
  mountAdminJsonRoute({ errors, app, spec: { ...credentialCopyListRoute, responseHeaders }, deps: routeDeps }, CREDENTIAL_COPY_MOUNT);
  mountAdminJsonRoute({ errors, app, spec: { ...credentialCopyGrantRoute, responseHeaders }, deps: routeDeps }, CREDENTIAL_COPY_MOUNT);
}
