import type { JsonValue } from "../../../../core/ports";
import { NON_REGISTER_DEFINITION_OPS } from "../../../../features/settings/definitions-dispatch";
import {
  AliasDepthExceededError,
  DefinitionInvalidError,
  DefinitionTombstonedError,
  ForbiddenError,
  RenameRetypeConflictError,
  SecretNotSupportedError,
} from "../../../../features/settings/errors";
import type { DefinitionInput } from "../../../../features/settings/settings";
import type { SettingOwnerKind, SettingValueSchema } from "../../../../features/settings/types";
import { registerDefinitions } from "../../../../features/settings/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteRegistrar } from "../../../routes/types";
import { toWriteServiceDeps } from "./shared";

/**
 * POST register/rename/retype/deprecate/tombstone setting definitions
 * (SPEC-007 api.spec.md `SETTINGS_REGISTER_DEFINITIONS`, tasks.md T038).
 *
 * Path deviation: api.spec.md §1 lists the literal path
 * `/api/v1/admin/settings/definitions` (no workspace segment). Every other
 * admin route registrar in this codebase mounts under
 * `/api/admin/v1/workspaces/:workspaceId/...` (see `presentation/get.ts`,
 * `menus/create.ts`, etc.) and validates `:workspaceId` against
 * `deps.workspaceId` — this route follows that established convention
 * instead, since v1 is single-workspace and every sibling admin route already
 * does the same 404-on-mismatched-workspace check.
 *
 * Each item's `op` (default `"register"`) routes to the matching Phase-2
 * write-service function. All five share the `settings.definitions.manage`
 * gate — each function re-checks it internally (chokepoint discipline), but
 * this route also pre-checks it once up front for a fast, structured 403
 * (mirrors `presentation/patch-active-theme.ts`'s explicit-authorize-then-call
 * pattern) rather than parsing a thrown `ForbiddenError`'s message.
 *
 * Deviation: `coercionJson` (api.spec.md's field name for `retype`) is
 * declared as an opaque `object` there, but `retypeDefinition` needs a string
 * `coercionTag` naming an already-registered coercer (`settings.ts`'s
 * `registerCoercer` registry). This route accepts either a bare string or an
 * object with a `tag` field, falling back to `"identity"` — smallest
 * reasonable bridge between the two shapes, disclosed here rather than
 * silently guessing.
 */
export const registerAdminSettingsRegisterDefinitionsRoute: RouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/settings/definitions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.definitions.manage",
        workspaceId: deps.workspaceId,
        entityType: "setting-definition",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.definitions.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.definitions.manage", reason: authResult.reason },
        });
        return;
      }

      const items: unknown[] | null = Array.isArray(req.body?.definitions) ? req.body.definitions : null;
      if (!items) {
        res.status(400).json({ error: "'definitions' must be an array", code: "VALIDATION_ERROR" });
        return;
      }

      const writeDeps = toWriteServiceDeps(deps);
      const opCtx = { deps: writeDeps, callerPrincipalId: principal.id, authWorkspaceId: deps.workspaceId };
      const applied: Array<{ key: string; op: string; status: string }> = [];
      const toRegister: DefinitionInput[] = [];

      for (const raw of items) {
        const item = raw as Record<string, unknown>;
        const ownerKind = item.ownerKind as SettingOwnerKind;
        const namespace = String(item.namespace ?? "");
        const key = String(item.key ?? "");
        const op = String(item.op ?? "register");
        // Platform defs (core/theme) are workspace_id=null; site-owned defs carry this workspace's
        // id (REQ-02 namespace fence, `settings.ts`'s `NAMESPACE_FENCE`).
        const workspaceId = ownerKind === "site" ? deps.workspaceId : null;

        if (op === "register") {
          toRegister.push({
            namespace,
            key,
            ownerKind,
            workspaceId,
            schema: item.schemaJson as SettingValueSchema,
            defaultValue: (item.defaultJson ?? null) as JsonValue | null,
            scopes: Number(item.scopes),
            secret: Boolean(item.secret ?? false),
          });
          applied.push({ key: `${namespace}.${key}`, op, status: "applied" });
          continue;
        }

        const handler = NON_REGISTER_DEFINITION_OPS[op];
        if (!handler) {
          res.status(400).json({ error: `unknown op '${op}'`, code: "VALIDATION_ERROR" });
          return;
        }

        await handler(opCtx, {
          namespace,
          key,
          ownerKind,
          workspaceId,
          newNamespace: item.newNamespace as string | undefined,
          newKey: item.newKey as string | undefined,
          schemaJson: item.schemaJson as SettingValueSchema,
          defaultJson: (item.defaultJson ?? null) as JsonValue | null,
          coercionJson: item.coercionJson as string | { tag?: string } | undefined,
        });
        applied.push({ key: `${namespace}.${key}`, op, status: "applied" });
      }

      if (toRegister.length > 0) {
        await registerDefinitions({
          deps: writeDeps,
          input: { definitions: toRegister, callerPrincipalId: principal.id, authWorkspaceId: deps.workspaceId },
        });
      }

      res.json({ applied });
    } catch (err) {
      if (err instanceof SecretNotSupportedError) {
        res.status(400).json({ error: err.message, code: "SECRET_NOT_SUPPORTED" });
        return;
      }
      if (err instanceof DefinitionInvalidError) {
        res.status(400).json({ error: err.message, code: "DEFINITION_INVALID" });
        return;
      }
      if (err instanceof RenameRetypeConflictError) {
        res.status(409).json({ error: err.message, code: "RENAME_RETYPE_CONFLICT" });
        return;
      }
      if (err instanceof AliasDepthExceededError) {
        res.status(409).json({ error: err.message, code: "ALIAS_DEPTH_EXCEEDED" });
        return;
      }
      if (err instanceof DefinitionTombstonedError) {
        res.status(409).json({ error: err.message, code: "DEFINITION_TOMBSTONED" });
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
