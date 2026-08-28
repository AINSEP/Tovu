import {
  DefinitionNotFoundError,
  DefinitionTombstonedError,
  ForbiddenError,
  PrincipalNotFoundError,
  ScopeNotAllowedError,
  type SettingScope,
  clear,
  deriveRequiredPermission,
} from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SettingsRouteRegistrar } from "./deps.js";
import { resolveTargetWorkspaceId, respondToSettingsError, toWriteServiceDeps, type SettingsErrorMapping } from "./shared.js";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

const CLEAR_ERROR_MAPPINGS: readonly SettingsErrorMapping[] = [
  { matches: (e) => e instanceof PrincipalNotFoundError, status: 404, code: "PRINCIPAL_NOT_FOUND" },
  { matches: (e) => e instanceof DefinitionNotFoundError, status: 404, code: "DEFINITION_NOT_FOUND" },
  { matches: (e) => e instanceof DefinitionTombstonedError, status: 409, code: "DEFINITION_TOMBSTONED" },
  { matches: (e) => e instanceof ScopeNotAllowedError, status: 400, code: "SCOPE_NOT_ALLOWED" },
  { matches: (e) => e instanceof ForbiddenError, status: 403, code: "FORBIDDEN" },
];

/** This route's required fields, off an untyped body: `namespace`, `key`, and a `VALID_SCOPES`
 *  member. `null` means the body failed that check.
 *  @complexity O(1). */
function parseClearRequestFields(rawBody: unknown): {
  namespace: string;
  key: string;
  scope: SettingScope;
  bodyWorkspaceId: unknown;
  principalId: string | undefined;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const namespace = String(body.namespace ?? "");
  const key = String(body.key ?? "");
  const scope = body.scope as SettingScope;
  if (!namespace || !key || !VALID_SCOPES.includes(scope)) {
    return null;
  }
  return {
    namespace,
    key,
    scope,
    bodyWorkspaceId: body.workspaceId,
    principalId: body.principalId ? String(body.principalId) : undefined,
  };
}

/**
 * DELETE clear a setting's value at a scope (SPEC-007 api.spec.md
 * `SETTINGS_CLEAR`, tasks.md T041, AC-24/RT-001).
 *
 * Mirrors `set.ts`'s shape exactly: same permission-derivation pre-check,
 * same `authWorkspaceId` fallback expression, same `PrincipalNotFoundError`
 * -> 404 mapping (not 500 — the Red-Team RT-001 fix applies equally to
 * clear, since `write-service.clear()` runs the identical
 * `assertTargetPrincipalInWorkspace` check as `set()`).
 */
export const registerAdminSettingsClearRoute: SettingsRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/settings/value", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const parsed = parseClearRequestFields(req.body);
      if (!parsed) {
        res.status(400).json({
          error: "namespace, key, and scope (global|workspace|user) are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      const { namespace, key, scope, bodyWorkspaceId, principalId } = parsed;
      // See `resolveTargetWorkspaceId` in `shared.ts`. This route previously took the write target
      // straight from the body while authorizing against `deps.workspaceId` below — a cross-tenant
      // clear. It also never defaulted for non-global scopes, the same masked-500 gap `set.ts` was
      // fixed for on 2026-07-31 and that its comment flagged here as an unfixed follow-up.
      const targetWorkspace = resolveTargetWorkspaceId(deps, { bodyWorkspaceId, scope });
      if (!targetWorkspace.ok) {
        res.status(400).json({ error: targetWorkspace.error, code: "VALIDATION_ERROR" });
        return;
      }
      const workspaceId = targetWorkspace.workspaceId;

      const permission = deriveRequiredPermission({
        scope,
        targetPrincipalId: principalId,
        callerPrincipalId: principal.id,
      });
      // See `set.ts`'s identical comment: always the ambient `deps.workspaceId`,
      // never a fallback to the caller's own principal id.
      const authWorkspaceId = deps.workspaceId;
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission,
        workspaceId: authWorkspaceId,
        entityType: "setting-value",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${permission}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission, reason: authResult.reason },
        });
        return;
      }

      const result = await clear({
        deps: toWriteServiceDeps(deps),
        input: { namespace, key, scope, workspaceId, principalId, callerPrincipalId: principal.id, authWorkspaceId },
      });

      res.json({ key: `${namespace}.${key}`, scope, value: null, revisionSeq: result.revisionSeq });
    } catch (err) {
      respondToSettingsError(res, err, CLEAR_ERROR_MAPPINGS);
    }
  });
};
