import type { SettingScope, SettingsWriteServiceDeps } from "../../../../features/settings";
import type { SettingsRouteDeps } from "./deps";

/**
 * @file Shared plumbing for the `settings` admin route registrars
 * (SPEC-007 Phase 5).
 *
 * Purpose:
 * `write-service.ts` declares its own smaller `SettingsWriteServiceDeps`
 * shape (`repo`/`clock`/`ids`/`authorize`/`principals`) rather than reusing
 * `RouteDeps` directly (see that file's header) — this adapter maps the
 * flat `RouteDeps` fields onto it once so every settings route file doesn't
 * repeat the same five-field object literal.
 *
 * Retyped from `RouteDeps` to `SettingsRouteDeps` (ADR-046 Phase 3, SPEC-040) — a pure narrowing,
 * since this function already only ever reads fields the new narrow type includes; see
 * `deps.ts`'s file header for the confirmed field set.
 */
export function toWriteServiceDeps(deps: SettingsRouteDeps): SettingsWriteServiceDeps {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.idGen,
    authorize: deps.authorize,
    principals: deps.principalRepo,
  };
}

export type TargetWorkspaceResolution =
  | { ok: true; workspaceId: string | undefined }
  | { ok: false; error: string };

/**
 * Decides which workspace a settings WRITE may target, from the request body.
 *
 * This exists because a body-supplied `workspaceId` was a cross-tenant write. All three mutation
 * routes authorize against the ambient `deps.workspaceId` (the `:workspaceId` path param, already
 * 404-checked against it at the top of each handler) while passing the BODY's `workspaceId` through
 * to `write-service` as the write target. Nothing required the two to match, so a principal holding
 * `settings.workspace.write` here could post `{"scope":"workspace","workspaceId":"<other>"}` and
 * have both authorize() calls pass against this workspace while `saveWorkspaceValue` wrote the
 * other tenant's row. `reset` was worse: one request wiped a whole namespace in another tenant.
 *
 * The rule is that there is nothing to decide — the target IS the ambient workspace. A body that
 * names a different one is rejected with 400 rather than ignored, so a mis-integrated caller fails
 * loudly instead of silently writing somewhere else than it asked for. A body that names THIS
 * workspace is accepted as redundant-but-consistent, since existing callers send it.
 *
 * `scope: "global"` returns `undefined`: there is no workspace concept in the platform partition,
 * and seeding one would be wrong for the reason `authWorkspaceId`'s own doc comment already gives.
 *
 * Lives here rather than in any one route so the three cannot drift apart again — copy-paste drift
 * between these files is what produced the gap. `write-service` re-asserts the same invariant as a
 * backstop for non-HTTP callers.
 *
 * @param deps - narrowed route deps; supplies the ambient authorized workspace.
 * @param required.bodyWorkspaceId - the request body's `workspaceId`, unvalidated.
 * @param required.scope - the write's target scope.
 * @returns the workspace id to write (`undefined` = global partition), or a 400 message.
 * @complexity O(1).
 */
export function resolveTargetWorkspaceId(
  deps: Pick<SettingsRouteDeps, "workspaceId">,
  required: { bodyWorkspaceId: unknown; scope: SettingScope }
): TargetWorkspaceResolution {
  const named =
    required.bodyWorkspaceId === undefined || required.bodyWorkspaceId === null || required.bodyWorkspaceId === ""
      ? undefined
      : String(required.bodyWorkspaceId);

  if (named !== undefined && named !== deps.workspaceId) {
    return {
      ok: false,
      error: `workspaceId '${named}' does not match this route's workspace; a settings write cannot target another workspace`,
    };
  }

  return { ok: true, workspaceId: required.scope === "global" ? undefined : deps.workspaceId };
}

/**
 * Permission that gates reading *another* principal's user-layer value. Mirrors
 * `write-service.ts`'s existing `settings.user.self.write` vs `settings.user.write` split for
 * writes (`permissionFor`, lines ~80-83): touching your own user layer and touching someone
 * else's are deliberately separate grants — now with the matching read-side pair.
 *
 * Read is NOT implied by write here: this checks `settings.user.read` and nothing else, so the
 * permission model no longer conflates the two. Existing write-holders are not locked out —
 * `identity/permissions.ts` registers a one-time additive `settings.user.write -> settings.user.read`
 * grant fan-out for that, which is where the compatibility concern belongs (grant data), not here
 * (the authorization check).
 */
export const CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION = "settings.user.read";

export type UserLayerReadTarget =
  | { allowed: true; principalId: string | undefined }
  | { allowed: false; reason: string };

/**
 * Decides which principal's user layer a settings read may target.
 *
 * Both read routes (`get-raw.ts`, `get-effective.ts`) authorize their own read permission against
 * the *caller's* principal, which says nothing about whether the caller may see a *different*
 * principal's data. A request naming someone else must therefore clear a second, explicit
 * `authorize()` check before the read proceeds (ADR-021: `authorize()` is the only evaluator).
 * Lives here rather than in either route so the two cannot drift apart again — the copy-paste
 * drift between them is what produced this gap in the first place.
 *
 * @param deps - narrowed route deps; supplies the evaluator and the authorized workspace.
 * @param required.requestedPrincipalId - the request's `principalId` query param, if any.
 * @param required.callerPrincipalId - the session-derived principal `authorize()` was checked for.
 * @returns `allowed` with the principal id to read (`undefined` = skip the user layer entirely),
 *   or `allowed: false` with `authorize()`'s machine-readable denial reason.
 * @complexity O(1); performs at most one `authorize()` call (none for a self-read or no-op read).
 * @overallScore 100
 */
export async function resolveUserLayerReadTarget(
  deps: Pick<SettingsRouteDeps, "authorize" | "workspaceId">,
  required: { requestedPrincipalId: string | undefined; callerPrincipalId: string }
): Promise<UserLayerReadTarget> {
  const { requestedPrincipalId, callerPrincipalId } = required;
  if (!requestedPrincipalId || requestedPrincipalId === callerPrincipalId) {
    return { allowed: true, principalId: requestedPrincipalId };
  }

  const result = await deps.authorize({
    principalId: callerPrincipalId,
    permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
    workspaceId: deps.workspaceId,
    entityType: "setting-value",
  });
  return result.allowed ? { allowed: true, principalId: requestedPrincipalId } : { allowed: false, reason: result.reason };
}
