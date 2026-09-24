import { mayActOnEntityType, TRASH_READ_PERMISSION } from "#src/features/trash/index";
import type { RestoreOutcome } from "#src/features/trash/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { MAX_TRASH_SELECTION, type TrashRouteRegistrar } from "./deps.js";

/**
 * POST restore the selected items.
 *
 * Per item, and per item only. One row whose plugin has been uninstalled, or one that someone else
 * restored a second ago, must not abort the rest of a selection the operator ticked by hand — each
 * gets its own permission check, its own transaction and its own recorded outcome, and the response
 * says which is which. A selection where every item failed is still a 200: the request was
 * understood and answered, and the per-item reasons are the answer.
 *
 * Items are addressed by `{ entityType, entityId }` rather than by the trash row's id, so this
 * endpoint maps 1:1 onto `TrashPort.restore` and needs no id lookup the port does not have.
 */
export const registerAdminTrashRestoreRoute: TrashRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/trash/restore", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      // The same entry gate `list.ts` and `purge.ts` apply, for the same reason: the Trash is one
      // surface, and three routes on it disagreeing about who is allowed onto it is how one of them
      // later gets widened alone. Per-item checks below still decide what actually moves.
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

      const items = readItems(req.body);
      if (!items) {
        res.status(400).json({
          error: `expected { items: [{ entityType, entityId }] } with 1..${MAX_TRASH_SELECTION} entries`,
          code: "INVALID_INPUT",
        });
        return;
      }

      const at = deps.clock.nowIso();
      const results: { entityType: string; entityId: string; outcome: RestoreOutcome | "forbidden" }[] = [];
      for (const item of items) {
        const gate = await mayActOnEntityType(deps, {
          principalId: principal.id,
          entityType: item.entityType,
          entityId: item.entityId,
        });
        if (!gate.allowed) {
          results.push({ ...item, outcome: "forbidden" });
          continue;
        }
        results.push({
          ...item,
          outcome: await deps.trash.restore({
            workspaceId: deps.workspaceId,
            entityType: item.entityType,
            entityId: item.entityId,
            at,
            actor: { principalId: principal.id },
          }),
        });
      }

      res.json({ restored: results.filter((r) => r.outcome === "restored").length, results });
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Reads the selection, or `null` when the body is not a usable one.
 *
 * @complexity O(n) in the selection's length.
 */
function readItems(body: unknown): { entityType: string; entityId: string }[] | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = (body as { items?: unknown }).items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TRASH_SELECTION) return null;

  const items: { entityType: string; entityId: string }[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { entityType, entityId } = entry as { entityType?: unknown; entityId?: unknown };
    if (typeof entityType !== "string" || entityType.length === 0) return null;
    if (typeof entityId !== "string" || entityId.length === 0) return null;
    items.push({ entityType, entityId });
  }
  return items;
}
