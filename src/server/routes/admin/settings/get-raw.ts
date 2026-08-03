import type { JsonValue } from "@jini-ai/cms/core";
import { resolveDefinition, type SettingValueRecord } from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps";
import { CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, resolveUserLayerReadTarget } from "./shared";

/** `state==="set"` yields the stored value; a `cleared` row (or an absent layer) reads as `null`. */
function layerValueOf(record: SettingValueRecord | null): JsonValue | null {
  return record && record.state === "set" ? record.valueJson : null;
}

/**
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
  app.get("/api/admin/v1/workspaces/:workspaceId/settings/raw", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.read.raw",
        workspaceId: deps.workspaceId,
        entityType: "setting-value",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.read.raw' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.read.raw", reason: authResult.reason },
        });
        return;
      }

      const namespace = String(req.query.namespace ?? "");
      const key = String(req.query.key ?? "");
      if (!namespace || !key) {
        res.status(400).json({
          error: "'namespace' and 'key' query params are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      // `authorize()` above was checked against `deps.workspaceId` and `principal.id` — never let
      // the actual read target a different workspace or principal than what was authorized.
      // The `:workspaceId` path param is already pinned to `deps.workspaceId` above; a
      // `workspaceId` query param is ignored rather than trusted (ADR-007).
      const workspaceId = deps.workspaceId;
      const readTarget = await resolveUserLayerReadTarget(deps, {
        requestedPrincipalId: req.query.principalId ? String(req.query.principalId) : undefined,
        callerPrincipalId: principal.id,
      });
      if (!readTarget.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized to read another principal's user-layer value (${readTarget.reason})`,
          code: "FORBIDDEN",
          details: { permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION, reason: readTarget.reason },
        });
        return;
      }
      const principalId = readTarget.principalId;

      const definition = await resolveDefinition({ repo: deps.settingsRepo }, { namespace, key, workspaceId });
      if (!definition) {
        res.status(404).json({
          error: `definition '${namespace}.${key}' was not found`,
          code: "DEFINITION_NOT_FOUND",
        });
        return;
      }

      const [globalValue, workspaceValue, userValue] = await Promise.all([
        deps.settingsRepo.getGlobalValue(definition.settingId),
        deps.settingsRepo.getWorkspaceValue({ workspaceId, settingId: definition.settingId }),
        principalId
          ? deps.settingsRepo.getUserValue({ workspaceId, principalId, settingId: definition.settingId })
          : Promise.resolve(null),
      ]);

      res.json({
        key: `${namespace}.${key}`,
        global: layerValueOf(globalValue),
        workspace: layerValueOf(workspaceValue),
        user: layerValueOf(userValue),
        default: definition.defaultValue,
      });
    } catch (err) {
      void err;
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
