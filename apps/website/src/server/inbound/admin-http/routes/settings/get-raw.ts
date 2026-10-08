import type { SettingsRouteRegistrar } from "./deps.js";
import { CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, resolveUserLayerReadTarget, createTovuSettingsService, mountSettingsJsonRoute, rejectSettingsRequest } from "./shared.js";

/** This route's two required query params, or `null` if either is missing.
 *  @complexity O(1). */
function parseGetRawQuery(query: Record<string, unknown>): { namespace: string; key: string; principalId: string | undefined } | null {
  const namespace = String(query.namespace ?? "");
  const key = String(query.key ?? "");
  if (!namespace || !key) {
    return null;
  }
  return { namespace, key, principalId: query.principalId ? String(query.principalId) : undefined };
}

/**
 * Layer resolution and rationale: Jini packages/core/src/settings/express/cms-adapter.ts.
 * `state === "set"` yields stored data; cleared or absent layers read as null.
 *
 * GET the per-layer raw values of one setting key (SPEC-007 api.spec.md
 * `SETTINGS_GET_RAW`, spec.md line ~20).
 *
 * Path deviation: see `register-definitions.ts`'s header — this route follows
 * the codebase's established `/api/admin/v1/workspaces/:workspaceId/...` mount
 * convention rather than api.spec.md's literal (workspace-less) path, matching
 * the other 5 settings routes.
 *
 * Query contract (disclosed): api.spec.md §4 documents `SETTINGS_GET_EFFECTIVE`'s
 * request contract (`namespace`, `workspaceId?`, `principalId?`) but never spells
 * out `SETTINGS_GET_RAW`'s own — this route mirrors `get-effective.ts`'s shape,
 * adding the required `key` param the raw (single-key) read needs that the
 * namespace-wide effective read does not. Deviation from that documented shape:
 * `workspaceId` is NOT honored as a query param (the workspace always comes from
 * the authorized `deps.workspaceId`), and `principalId` naming another principal
 * requires `settings.user.read` — see the scoping comment in the handler.
 *
 * Definition resolution reuses `resolveDefinition` (the same cached read-path
 * resolver `getEffective` uses internally) rather than re-deriving it — a
 * missing/tombstoned definition 404s `DEFINITION_NOT_FOUND`, mirroring
 * `set.ts`/`clear.ts`'s identical mapping for the same error.
 */
export const registerAdminSettingsGetRawRoute: SettingsRouteRegistrar = (app, deps) => {
  mountSettingsJsonRoute({ app, deps, method: "get", path: "/api/admin/v1/workspaces/:workspaceId/settings/raw",
    handle: async ({ request: req, principal, authorize }) => {
      await authorize({ permission: "settings.read.raw", entityType: "setting-value" });

      const parsedQuery = parseGetRawQuery(req.query as Record<string, unknown>);
      if (!parsedQuery) {
        rejectSettingsRequest({ status: 400,
          error: "'namespace' and 'key' query params are required",
          code: "VALIDATION_ERROR",
        });
      }
      const { namespace, key } = parsedQuery;
      // `authorize()` above was checked against `deps.workspaceId` and `principal.id` — never let
      // the actual read target a different workspace or principal than what was authorized.
      // The `:workspaceId` path param is already pinned to `deps.workspaceId` above; a
      // `workspaceId` query param is ignored rather than trusted (ADR-007).
      const workspaceId = deps.workspaceId;
      const readTarget = await resolveUserLayerReadTarget(deps, {
        requestedPrincipalId: parsedQuery.principalId,
        callerPrincipalId: principal.id,
      });
      if (!readTarget.allowed) {
        rejectSettingsRequest({ status: 403,
          error: `principal '${principal.id}' is not authorized to read another principal's user-layer value (${readTarget.reason})`,
          code: "FORBIDDEN",
          details: { permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, reason: readTarget.reason },
        });
      }
      const principalId = readTarget.principalId;

      const value = await createTovuSettingsService({ deps }).raw({ namespace, key, workspaceId, principalId });
      if (!value) {
        rejectSettingsRequest({ status: 404,
          error: `definition '${namespace}.${key}' was not found`,
          code: "DEFINITION_NOT_FOUND",
        });
      }
      return value;
    },
  });
};
