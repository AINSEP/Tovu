import { ForbiddenError, type SettingScope } from "#src/features/settings/index";
import type { SettingsRouteRegistrar } from "./deps.js";
import { resolveTargetWorkspaceId, createTovuSettingsService, mountSettingsJsonRoute, rejectSettingsRequest } from "./shared.js";

const VALID_SCOPES: readonly SettingScope[] = ["global", "workspace", "user"];

/**
 * This route's required fields, off an untyped body: `namespace` and a `VALID_SCOPES` member.
 * `null` means the body failed that check.
 * @complexity O(1).
 */
function parseResetRequestFields(rawBody: unknown): { namespace: string; scope: SettingScope; bodyWorkspaceId: unknown } | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const namespace = String(body.namespace ?? "");
  const scope = body.scope as SettingScope;
  if (!namespace || !VALID_SCOPES.includes(scope)) {
    return null;
  }
  return { namespace, scope, bodyWorkspaceId: body.workspaceId };
}

/**
 * Partition selection and rationale: Jini packages/core/src/settings/express/cms-adapter.ts.
 * The workspace partition a namespace's definitions live in for this scope — `null` (platform) for
 * `global`, else this workspace's own partition, falling back to the ambient workspace when the
 * resolved target workspace itself was `undefined` (the `scope: "global"` case `resolveTargetWorkspaceId`
 * itself returns, which never reaches here since `scope !== "global"` on this path).
 * @complexity O(1).
 * @complexity O(keys registered in the namespace), including CMS ledger writes.
 *
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
  mountSettingsJsonRoute({ app, deps, method: "post", path: "/api/admin/v1/workspaces/:workspaceId/settings/reset",
    errorMappings: [{ matches: (error) => error instanceof ForbiddenError, status: 403, code: "FORBIDDEN" }],
    handle: async ({ request: req, principal, authorize }) => {
      const parsedBody = parseResetRequestFields(req.body);
      if (!parsedBody) {
        rejectSettingsRequest({ status: 400,
          error: "namespace and scope (global|workspace|user) are required",
          code: "VALIDATION_ERROR",
        });
      }
      const { namespace, scope, bodyWorkspaceId } = parsedBody;
      // See `resolveTargetWorkspaceId` in `shared.ts`. This was the worst of the three: it took the
      // target workspace from the body while authorizing against `deps.workspaceId` below, so one
      // request could wipe an entire namespace in another tenant.
      const targetWorkspace = resolveTargetWorkspaceId(deps, { bodyWorkspaceId, scope });
      if (!targetWorkspace.ok) {
        rejectSettingsRequest({ status: 400, error: targetWorkspace.error, code: "VALIDATION_ERROR" });
      }
      const workspaceId = targetWorkspace.workspaceId;

      const permission = `settings.reset.${scope}`;
      // See `set.ts`'s identical comment: always the ambient `deps.workspaceId`,
      // never a fallback to the caller's own principal id.
      const authWorkspaceId = deps.workspaceId;
      await authorize({ permission, entityType: "setting-namespace" });

      const result = await createTovuSettingsService({ deps }).reset({
        namespace, scope, workspaceId, callerPrincipalId: principal.id, authWorkspaceId,
      });

      return { namespace, clearedCount: result.clearedCount, revisionSeqs: result.revisionSeqs };
    },
  });
};
