import { moveToTrash } from "#src/features/trash/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { TrashRouteRegistrar } from "./deps.js";

/**
 * POST move one entity of any `TRASHABLE` kind into the Trash. Design of record:
 * `ADS-memory/.local-artifacts/handoffs/2026-09-21-t8f-trash-more-plan.md` §3.
 *
 * Unlike `restore.ts`/`purge.ts`, this route takes exactly ONE item, not a selection: it is the
 * generic replacement for every per-domain `DELETE`/`POST .../trash` path (`routes/menus/delete.ts`,
 * `routes/taxonomy/delete-term.ts`, `routes/forms/delete-submission.ts`, `routes/widgets/trash.ts`,
 * …), and none of those ever deleted more than one row per call either. There is deliberately no
 * coarse `content.read`-style entry gate here (unlike `list.ts`/`restore.ts`/`purge.ts`, which all
 * gate onto the shared Trash SCREEN before their own per-row check) — `moveToTrash` checks the one
 * permission that matters, the kind's own, exactly as every bespoke delete path already does.
 */
export const registerAdminTrashMoveToTrashRoute: TrashRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/trash/items", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const body = readBody(req.body);
      if (!body) {
        res.status(400).json({ error: "expected { type, id }", code: "INVALID_INPUT" });
        return;
      }

      const outcome = await moveToTrash(
        { workspaceId: deps.workspaceId, entityType: body.type, entityId: body.id, actor: { principalId: principal.id } },
        { registry: deps.registry, trash: deps.trash, db: deps.db, authorize: deps.authorize, clock: deps.clock }
      );

      if (outcome.ok) {
        res.json({ ok: true, version: outcome.version });
        return;
      }
      switch (outcome.reason) {
        case "unknown-type":
          res.status(404).json({ error: `'${body.type}' is not a kind the Trash can hold`, code: "TRASH_UNKNOWN_TYPE" });
          return;
        case "not-found":
          res.status(404).json({ error: "item was not found", code: "NOT_FOUND" });
          return;
        case "forbidden":
          res.status(403).json({
            error: `principal '${principal.id}' is not authorized for '${outcome.permission}'`,
            code: "FORBIDDEN",
            details: { permission: outcome.permission },
          });
          return;
        case "version-changed":
          res.status(409).json({ error: "the item changed since it was last read", code: "TRASH_VERSION_CHANGED" });
          return;
        case "blocked":
          // `TERM_HAS_CHILDREN` (`registry.ts`'s only `blocker` today) is the one message this text is
          // written for — plan's literal spec. A second blocked kind needs its own `code` branch here
          // rather than reusing this sentence; `code`/`count` alone are already generic.
          res.status(409).json({
            error: `this term has ${outcome.count} sub-terms — move them under another parent, or delete them permanently, first`,
            code: outcome.code,
            count: outcome.count,
          });
          return;
      }
    } catch {
      res.status(500).json({ error: "internal error" });
    }
  });
};

/**
 * Reads `{ type, id }`, or `null` when the body is not a usable one.
 *
 * @complexity O(1).
 */
function readBody(body: unknown): { type: string; id: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { type, id } = body as { type?: unknown; id?: unknown };
  if (typeof type !== "string" || type.length === 0) return null;
  if (typeof id !== "string" || id.length === 0) return null;
  return { type, id };
}
