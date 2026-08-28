import type { Response } from "express";

import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Shared `authorize()`-then-403 response helper (SPEC-006 admin RBAC gate).
 *
 * Every admin route follows the identical "call `authorize()`, and on denial write a 403
 * FORBIDDEN body with this exact `{ error, code, details }" shape" dance before reaching its own
 * business logic (125+ route files share this pattern as of 2026-08-18). Extracting it here is a
 * pure DRY/complexity move — this folder (`src/server/http/responses/`, see its `INFO.md`) is the
 * intended home for shared response-shaping helpers — not a behavior change: the JSON body, status
 * code, and field values are copied verbatim from the call sites this replaces.
 */

/** The subset of `authorize()`'s params every admin route already passes through unchanged. */
export interface AuthorizeGuardParams {
  principalId: string;
  permission: string;
  workspaceId: string;
  entityType: string;
  entityId?: string;
}

/**
 * Runs `authorize()` and, on denial, writes the standard 403 FORBIDDEN response and returns
 * `false`. Returns `true` when the caller is authorized (nothing written to `res` — the route
 * continues its own logic). Callers must `return` immediately when this resolves `false`.
 *
 * @complexity O(1) — one `authorize()` call, one branch.
 */
export async function authorizeOrRespond(
  res: Response,
  authorize: RouteDeps["authorize"],
  params: AuthorizeGuardParams
): Promise<boolean> {
  const authResult = await authorize(params);
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${params.principalId}' is not authorized for '${params.permission}' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission: params.permission, reason: authResult.reason },
    });
    return false;
  }
  return true;
}
