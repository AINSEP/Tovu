import { ForbiddenError, type SettingScope, resetNamespace } from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { SettingsRouteRegistrar } from "./deps.js";
import { resolveTargetWorkspaceId, toWriteServiceDeps } from "./shared.js";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

/** This route's required fields, off an untyped body: `namespace` and a `VALID_SCOPES` member.
 *  `null` means the body failed that check.
 *  @complexity O(1). */
function parseResetRequestFields(rawBody: unknown): { namespace: string; scope: SettingScope; bodyWorkspaceId: unknown } | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const namespace = String(body.namespace ?? "");
  const scope = body.scope as SettingScope;
  if (!namespace || !VALID_SCOPES.includes(scope)) {
    return null;
  }
  return { namespace, scope, bodyWorkspaceId: body.workspaceId };
}

/** The workspace partition a namespace's definitions live in for this scope — `null` (platform) for
 *  `global`, else this workspace's own partition, falling back to the ambient workspace when the
 *  resolved target workspace itself was `undefined` (the `scope: "global"` case `resolveTargetWorkspaceId`
 *  itself returns, which never reaches here since `scope !== "global"` on this path).
 *  @complexity O(1). */
function resolveDefinitionWorkspaceId(scope: SettingScope, workspaceId: string | undefined, ambientWorkspaceId: string): string | null {
  return scope === "global" ? null : (workspaceId ?? ambientWorkspaceId);
}

/**
 * POST reset every setting in a namespace to defaults at a scope
 * (SPEC-007 api.spec.md `SETTINGS_RESET`, tasks.md T042).
 *
 * `resetNamespace` (ADR-028 §7 R3-01) is the "explicit, human-invoked
 * orchestrator": it authorizes the coarse `settings.reset.<scope>` permission
 * once, then loops `clear()` in a reset-authorized internal context (skipping
 * each inner authorize() re-check). This route pre-checks the same
 * `settings.reset.<scope>` permission for a fast, structured 403, mirroring
 * `set.ts`/`clear.ts`.
 *
 * `keysInNamespace` isn't tracked anywhere as a first-class list — this route
 * derives it the same way `write-service.ts`'s own `resolveScopedDefinitionOrThrow`
 * resolves a single key's definition partition: `scope=global` reads the
 * platform partition (`workspaceId=null`); `scope=workspace`/`scope=user` read
 * this workspace's site-owned partition.
 */
export const registerAdminSettingsResetRoute: SettingsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/settings/reset", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const parsedBody = parseResetRequestFields(req.body);
      if (!parsedBody) {
        res.status(400).json({
          error: "namespace and scope (global|workspace|user) are required",
          code: "VALIDATION_ERROR",
        });
        return;
      }
      const { namespace, scope, bodyWorkspaceId } = parsedBody;
      // See `resolveTargetWorkspaceId` in `shared.ts`. This was the worst of the three: it took the
      // target workspace from the body while authorizing against `deps.workspaceId` below, so one
      // request could wipe an entire namespace in another tenant.
      const targetWorkspace = resolveTargetWorkspaceId(deps, { bodyWorkspaceId, scope });
      if (!targetWorkspace.ok) {
        res.status(400).json({ error: targetWorkspace.error, code: "VALIDATION_ERROR" });
        return;
      }
      const workspaceId = targetWorkspace.workspaceId;

      const permission = `settings.reset.${scope}`;
      // See `set.ts`'s identical comment: always the ambient `deps.workspaceId`,
      // never a fallback to the caller's own principal id.
      const authWorkspaceId = deps.workspaceId;
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission,
        workspaceId: authWorkspaceId,
        entityType: "setting-namespace",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${permission}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission, reason: authResult.reason },
        });
        return;
      }

      const definitionWorkspaceId = resolveDefinitionWorkspaceId(scope, workspaceId, deps.workspaceId);
      const definitions = await deps.settingsRepo.listActiveDefinitions({ workspaceId: definitionWorkspaceId });
      const keysInNamespace = definitions.filter((d) => d.namespace === namespace).map((d) => d.key);

      const result = await resetNamespace(
        {
          deps: toWriteServiceDeps(deps),
          input: { namespace, scope, workspaceId, callerPrincipalId: principal.id, authWorkspaceId },
        },
        keysInNamespace
      );

      res.json({ namespace, clearedCount: result.clearedCount, revisionSeqs: result.revisionSeqs });
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message, code: "FORBIDDEN" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
