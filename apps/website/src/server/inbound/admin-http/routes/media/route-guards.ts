import type { Request, Response } from "express";

import { MediaValidationError } from "#src/features/media/index";
import type { AuthorizeGuardParams } from "#src/server/inbound/admin-http/authorize-guard";
import type { MediaRouteDeps } from "./deps.js";

/**
 * @file Request guards and failure responses shared by the admin media routes.
 *
 * Every media route opened with the same workspace check, and the write/read routes each carried
 * an identical 403 block and the same "validation is 400, anything else is a private 500" mapping.
 * Owning them once keeps those routes' status codes and bodies from drifting apart.
 */

/**
 * Reads a `:param` segment as a string. Express guarantees a matched `:param` is always populated,
 * so the `?? ""` fallback is unreachable through a real HTTP request — the repo's established
 * answer is to KEEP the guard (restored 2026-09-03 after being deleted as dead code) and exercise
 * it with a hand-built `req` that deliberately violates that contract.
 *
 * @complexity O(1).
 */
export function readRouteParam({ req, name }: { req: Pick<Request, "params">; name: string }): string {
  return String(req.params[name] ?? "");
}

/**
 * Writes the shared `404 workspace was not found` and returns `true` when the URL names a
 * workspace other than this deployment's own. Runs before authorization, so a foreign workspace
 * never reaches `authorize()` or any repository.
 *
 * @complexity O(1).
 */
export function rejectForeignWorkspace(
  { req, res, workspaceId }: { req: Pick<Request, "params">; res: Response; workspaceId: string },
): boolean {
  if (readRouteParam({ req, name: "workspaceId" }) === workspaceId) return false;
  res.status(404).json({ error: "workspace was not found" });
  return true;
}

/**
 * Runs `deps.authorize` and, on denial, writes the standard 403 FORBIDDEN body (the same shape
 * `authorize-guard.ts`'s `authorizeOrRespond` writes) and returns `false`.
 *
 * Deliberately calls `authorize` directly instead of `authorizeOrRespond`: these routes have never
 * consulted the publishing-credential capability override that helper adds, and switching them
 * over is an authorization change for the owner to decide, not part of a refactor.
 *
 * @complexity O(1) — one `authorize()` call.
 */
export async function authorizeMediaOrRespond(
  { res, authorize, params }: { res: Response; authorize: MediaRouteDeps["authorize"]; params: AuthorizeGuardParams },
): Promise<boolean> {
  const authResult = await authorize(params);
  if (authResult.allowed) return true;
  res.status(403).json({
    error: `principal '${params.principalId}' is not authorized for '${params.permission}' (${authResult.reason})`,
    code: "FORBIDDEN",
    details: { permission: params.permission, reason: authResult.reason },
  });
  return false;
}

/** Writes the media routes' `404 media '<id>' was not found` body.
 *  @complexity O(1). */
export function sendMediaNotFound({ res, mediaId }: { res: Response; mediaId: string }): void {
  res.status(404).json({ error: `media '${mediaId}' was not found` });
}

/** A `MediaValidationError` is the caller's fault and its message is safe to return (400); anything
 *  else is an unexpected failure whose details stay private (500 `internal error`).
 *  @complexity O(1). */
export function sendValidationOrInternalError({ res, error }: { res: Response; error: unknown }): void {
  if (error instanceof MediaValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "internal error" });
}
