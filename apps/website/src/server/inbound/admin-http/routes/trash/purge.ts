import { mayActOnEntityType, TRASH_READ_PERMISSION } from "#src/features/trash/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { MAX_TRASH_SELECTION, type TrashRouteRegistrar } from "./deps.js";

/**
 * POST permanently destroy the selected items. The ONLY caller of `TrashPort.purgeSelected` in the
 * product, and the only path in the product that hard-deletes an entity on a human's say-so.
 *
 * Two things make this route different from `restore.ts`, and both come from it being irreversible:
 *
 *  1. **Items are named by trash row id**, because that is what the screen's checkboxes hold and
 *     what `purgeSelected` takes. Which means the route cannot know each row's kind from the
 *     request — a body that carried `entityType` alongside the id would let a caller name `comment`
 *     for a post's row and destroy a post holding only `comments.moderate`. So the per-kind check
 *     is not made here at all: it is handed to `purgeSelected` as `authorizeItem` and runs against
 *     the row the service itself resolved, in the same call that then purges it.
 *  2. The coarse gate below is only an entry gate. `content.read` gets you to the Trash surface;
 *     destroying a row still needs that row's own kind's permission, per row.
 *
 * Denied rows come back as `"forbidden"` beside the rows that did purge, exactly as
 * `adapter-unavailable` and `version-changed` do — a selection an operator ticked by hand must not
 * be aborted wholesale because one row was not theirs to destroy.
 */
export const registerAdminTrashPurgeRoute: TrashRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/trash/purge", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: TRASH_READ_PERMISSION,
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${TRASH_READ_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: TRASH_READ_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const ids = readIds(req.body);
      if (!ids) {
        res.status(400).json({
          error: `expected { ids: [string] } with 1..${MAX_TRASH_SELECTION} entries`,
          code: "INVALID_INPUT",
        });
        return;
      }

      const report = await deps.trash.purgeSelected({
        workspaceId: deps.workspaceId,
        ids,
        actor: { principalId: principal.id },
        // Resolved rows only — see this file's header for why the kind never comes off the request.
        authorizeItem: async (item) =>
          (await mayActOnEntityType(deps, {
            principalId: principal.id,
            entityType: item.entityType,
            entityId: item.entityId,
          })).allowed,
      });

      res.json({ purged: report.purged, results: report.results });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Reads the selection, or `null` when the body is not a usable one.
 *
 * Duplicate ids are left as the caller sent them rather than de-duplicated: `purgeSelected` reports
 * one result per requested id, and a response with fewer results than the request had ids is harder
 * for the screen to reconcile than a repeated `already-gone`.
 *
 * @complexity O(n) in the selection's length.
 */
function readIds(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { ids?: unknown }).ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TRASH_SELECTION) return null;

  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length === 0) return null;
    ids.push(entry);
  }
  return ids;
}
