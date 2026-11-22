import type { Request, Response } from "express";

/**
 * @file The route preamble every workspace-scoped admin and public route shares: reading a matched
 * `:param` and the mount-path `404 workspace was not found`. ~190 route files hand-rolled the same
 * four-line block; owning it once keeps their status code and body from drifting apart.
 * (Moved here from `admin-http/routes/media/route-guards.ts`, dedupe plan group RG1.)
 */

/**
 * Reads a `:param` segment as a string. Express guarantees a matched `:param` is always populated,
 * so the `?? ""` fallback is unreachable through a real HTTP request — the repo's established
 * answer is to KEEP the guard (restored 2026-09-03 after being deleted as dead code) and exercise
 * it with a hand-built `req` that deliberately violates that contract. It also keeps a direct
 * handler call with no params from comparing against the literal string `"undefined"`.
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
