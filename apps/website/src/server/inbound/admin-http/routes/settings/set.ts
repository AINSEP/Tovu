import type { JsonValue } from "@jini-ai/cms/core";
import {
  DefinitionNotFoundError,
  DefinitionTombstonedError,
  ForbiddenError,
  PrincipalNotFoundError,
  ScopeNotAllowedError,
  ValueValidationFailedError,
  type SettingScope,
  deriveRequiredPermission,
  set,
} from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SettingsRouteRegistrar } from "./deps.js";
import { resolveTargetWorkspaceId, respondToSettingsError, toWriteServiceDeps, type SettingsErrorMapping } from "./shared.js";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

const SET_ERROR_MAPPINGS: readonly SettingsErrorMapping[] = [
  { matches: (e) => e instanceof PrincipalNotFoundError, status: 404, code: "PRINCIPAL_NOT_FOUND" },
  { matches: (e) => e instanceof DefinitionNotFoundError, status: 404, code: "DEFINITION_NOT_FOUND" },
  { matches: (e) => e instanceof DefinitionTombstonedError, status: 409, code: "DEFINITION_TOMBSTONED" },
  { matches: (e) => e instanceof ScopeNotAllowedError, status: 400, code: "SCOPE_NOT_ALLOWED" },
  { matches: (e) => e instanceof ValueValidationFailedError, status: 400, code: "VALUE_VALIDATION_FAILED" },
  { matches: (e) => e instanceof ForbiddenError, status: 403, code: "FORBIDDEN" },
];

/** This route's required fields, off an untyped body: `namespace`, `key`, a `VALID_SCOPES` member,
 *  and a `valueJson` property (its presence, not its truthiness — `null`/`0`/`""` are legal values,
 *  which is why this checks `"valueJson" in body` rather than `body.valueJson !== undefined`).
 *  `null` means the body failed that check.
 *  @complexity O(1). */
function parseSetRequestFields(rawBody: unknown): {
  namespace: string;
  key: string;
  scope: SettingScope;
  valueJson: JsonValue;
  bodyWorkspaceId: unknown;
  principalId: string | undefined;
} | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const namespace = String(body.namespace ?? "");
  const key = String(body.key ?? "");
  const scope = body.scope as SettingScope;
  if (!namespace || !key || !VALID_SCOPES.includes(scope) || !("valueJson" in body)) {
    return null;
  }
  return {
    namespace,
    key,
    scope,
    valueJson: body.valueJson as JsonValue,
    bodyWorkspaceId: body.workspaceId,
    principalId: body.principalId ? String(body.principalId) : undefined,
  };
}

/**
 * PUT set a setting's value at a scope (SPEC-007 api.spec.md `SETTINGS_SET`,
 * tasks.md T040, AC-24/RT-001).
 *
 * Path deviation: see `register-definitions.ts`'s header.
 *
 * `deriveRequiredPermission` (the self-vs-other rule, behavior.spec.md §1.3)
 * computes the permission before this route's own explicit `authorize()`
 * pre-check — `write-service.set()` re-checks the identical permission
 * internally (chokepoint discipline), so this is belt-and-suspenders: the
 * pre-check gives a fast, structured 403 body matching this codebase's other
 * routes; the inner check is the real, non-bypassable gate.
 *
 * `PrincipalNotFoundError` (REQ-13/INV-09 — a `scope=user` write targeting a
 * `principalId` that isn't an active principal in the request's workspace)
 * maps to 404, NOT 500 — this was Red-Team RT-001's flagged gap.
 */
export const registerAdminSettingsSetRoute: SettingsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/settings/value", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const parsed = parseSetRequestFields(req.body);
      if (!parsed) {
        res.status(400).json({
          error: "namespace, key, scope (global|workspace|user), and valueJson are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      const { namespace, key, scope, valueJson, bodyWorkspaceId, principalId } = parsed;
      // The write target is the ambient workspace, never the body's. See
      // `resolveTargetWorkspaceId`'s doc in `shared.ts` for why a body-named
      // workspace is REJECTED rather than honored: accepting it authorized
      // against this workspace while writing another tenant's row.
      //
      // This also keeps the 2026-07-31 fix it replaces: `scope: "user"` and
      // `scope: "workspace"` writes with no `workspaceId` in the body used to
      // reach `write-service.set()` as `undefined`, which
      // `saveUserValue`/`saveWorkspaceValue` (`repo.sqlite.ts`) require and
      // throw on -- a masked 500 for every settings-dialog tab adapter in
      // `apps/admin/src/lib/settings-tabs.ts`, none of which send it.
      // Defaulting to `deps.workspaceId` for non-global scopes is what every
      // other settings route already does (`get-effective.ts`,
      // `list-definitions.ts`), because the `:workspaceId` path param is
      // 404-checked against `deps.workspaceId` above (ADR-007).
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
      // The ambient workspace this whole route operates within (single-
      // workspace v1) — always `deps.workspaceId`, never a fallback to the
      // caller's own principal id (that fallback is what `write-service.ts`
      // used internally pre-Phase-5; it breaks `authorize()`'s real
      // `findById({workspaceId, id})` lookup for `scope=global` requests,
      // which never carry a `workspaceId`). Passed through as
      // `authWorkspaceId` below so the inner chokepoint check uses the same
      // value as this pre-check.
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

      const result = await set({
        deps: toWriteServiceDeps(deps),
        input: {
          namespace,
          key,
          scope,
          value: valueJson,
          workspaceId,
          principalId,
          callerPrincipalId: principal.id,
          authWorkspaceId,
        },
      });

      res.json({ key: `${namespace}.${key}`, scope, value: result.value, revisionSeq: result.revisionSeq });
    } catch (err) {
      respondToSettingsError(res, err, SET_ERROR_MAPPINGS);
    }
  });
};
