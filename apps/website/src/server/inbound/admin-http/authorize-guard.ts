import type { Response } from "express";

import type { RouteDeps } from "#src/server/routes/types";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "./publish-trust-auth.js";

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

/**
 * The subset of `authorize()`'s params every admin route already passes through unchanged.
 *
 * `entityType`/`entityId` are optional, matching `AuthorizeFn`'s own real contract
 * (`contracts/core/gated-mutations/ports.ts`) — a collection-level route (`list`, or a
 * workspace-scoped action with no single entity to name) legitimately has neither, and forcing
 * them here would just push those call sites back to hand-rolling the 403 block this exists to
 * remove.
 */
export interface AuthorizeGuardParams {
  principalId: string;
  permission: string;
  workspaceId: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Runs `authorize()` and, on denial, writes the standard 403 FORBIDDEN response and returns
 * `false`. Returns `true` when the caller is authorized (nothing written to `res` — the route
 * continues its own logic). Callers must `return` immediately when this resolves `false`.
 *
 * **One exception, and it is the reason this takes `res` rather than just the two things it
 * writes:** when the request authenticated with a publishing credential
 * (`publish-trust-auth.ts`), the answer comes from that grant's closed capability set instead of
 * RBAC. Doing it HERE rather than at each route is deliberate — a publishing token must never be
 * able to inherit a human's permissions, and 125+ call sites already funnel through this one
 * function, so the property cannot be lost by a route that forgets to ask. Every other request is
 * untouched: `getPublishTrustContext` returns `null` and the original `authorize` runs.
 *
 * @complexity O(1) — one `authorize()` call, one branch.
 */
export async function authorizeOrRespond(
  res: Response,
  authorize: RouteDeps["authorize"],
  params: AuthorizeGuardParams
): Promise<boolean> {
  const publishTrust = getPublishTrustContext(res);
  const effectiveAuthorize = publishTrust ? publishTrustAuthorizeFor(publishTrust) : authorize;
  const authResult = await effectiveAuthorize(params);
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
