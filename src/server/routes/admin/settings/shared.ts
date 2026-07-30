import type { SettingsWriteServiceDeps } from "../../../../features/settings/write-service";
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
