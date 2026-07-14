import {
  DefinitionNotFoundError,
  DefinitionTombstonedError,
  ForbiddenError,
  PrincipalNotFoundError,
  ScopeNotAllowedError,
} from "../../../../features/settings/errors";
import type { SettingScope } from "../../../../features/settings/types";
import { clear, deriveRequiredPermission } from "../../../../features/settings/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";
import { toWriteServiceDeps } from "./shared";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

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
export const registerAdminSettingsClearRoute: RouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId/settings/value", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const body = (req.body ?? {}) as Record<string, unknown>;
      const namespace = String(body.namespace ?? "");
      const key = String(body.key ?? "");
      const scope = body.scope as SettingScope;
      if (!namespace || !key || !VALID_SCOPES.includes(scope)) {
        res.status(400).json({
          error: "namespace, key, and scope (global|workspace|user) are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      const workspaceId = body.workspaceId ? String(body.workspaceId) : undefined;
      const principalId = body.principalId ? String(body.principalId) : undefined;

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
      if (err instanceof PrincipalNotFoundError) {
        res.status(404).json({ error: err.message, code: "PRINCIPAL_NOT_FOUND" });
        return;
      }
      if (err instanceof DefinitionNotFoundError) {
        res.status(404).json({ error: err.message, code: "DEFINITION_NOT_FOUND" });
        return;
      }
      if (err instanceof DefinitionTombstonedError) {
        res.status(409).json({ error: err.message, code: "DEFINITION_TOMBSTONED" });
        return;
      }
      if (err instanceof ScopeNotAllowedError) {
        res.status(400).json({ error: err.message, code: "SCOPE_NOT_ALLOWED" });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "FORBIDDEN" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
