import { deleteWorkspace, WorkspaceLastRemainingError, WorkspaceNotFoundError } from "#src/features/workspace/index";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { Response } from "express";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/**
 * Maps `deleteWorkspace`'s thrown error types onto the admin error envelope (mirrors
 * `routes/menus/update-tree.ts`'s `sendUpdateMenuTreeError`).
 *
 * Exported for direct-invoke coverage. Because INV-05 above refuses every request this route can
 * currently address, `deleteWorkspace` is never actually reached over HTTP in v1, so these three
 * branches have no live caller today — they are retained (and tested here directly rather than
 * through a fetch) for the multi-workspace future the transition already supports. That is the
 * deliberate cost of guarding on identity: the refusal moved earlier than the domain call.
 *
 * @complexity O(1).
 */
export function sendDeleteWorkspaceError(res: Response, err: unknown): void {
  if (err instanceof WorkspaceLastRemainingError) {
    res.status(409).json({ error: err.message, code: "LAST_WORKSPACE" });
    return;
  }

  if (err instanceof WorkspaceNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }

  console.error(`admin workspace delete route failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  res.status(500).json({ error: "internal error" });
}

/**
 * DELETE workspaces/:workspaceId — `DELETE_WORKSPACE` (SPEC-044 REQ-05/INV-03, AC-06).
 * `:workspaceId` must equal the caller's own workspace (INV-04, checked before authorization, and
 * before the last-workspace guard — EC-04: an unauthorized caller learns nothing about workspace
 * count). Gated by `workspace.manage`.
 *
 * INV-05 (bound-workspace guard) — the reason this route refuses.
 *
 * `deleteWorkspace`'s INV-03 guard (`@jini-ai/cms/workspace`'s `delete.ts`) refuses only when the
 * target is the install's LAST remaining workspace ROW (`repo.list().length <= 1`); it does not
 * compare the row against this process's own fixed `deps.workspaceId`. That made the safety
 * property row-count-based rather than identity-based, and the count is caller-controlled: a
 * principal holding `workspace.manage` could POST a second, empty workspace row and then DELETE
 * this process's own `deps.workspaceId`, leaving every other route in the composition pointed at
 * a workspace id that no longer resolves. It was never a privilege-escalation path (both calls
 * need `workspace.manage`), but a single permission should not be able to destroy the running
 * site's own scope as a side effect of satisfying an unrelated invariant.
 *
 * The guard below is therefore keyed on identity, not on count: this process refuses to delete the
 * workspace it is bound to, whatever the row count happens to be. Because the `:workspaceId` check
 * above already narrows the target to `deps.workspaceId`, that makes the route refuse
 * unconditionally today — which is the honest v1 answer, and the same answer INV-03 gave by
 * accident. When a genuinely addressable second workspace arrives, this guard keeps refusing
 * exactly the one workspace that must not be deleted and lets the rest through, where the count
 * guard would have started allowing all of them. INV-03 stays in place underneath as
 * defence-in-depth for any other host of the package.
 *
 * Placed AFTER `authorize()` on purpose, in the position the count guard occupied, preserving
 * EC-04: an unauthorized caller still learns nothing about workspace count or bindings.
 */
export const registerAdminWorkspaceDeleteRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.delete("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    const targetWorkspaceId = String(req.params.workspaceId ?? "");
    if (targetWorkspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      if (
        !(await authorizeOrRespond(res, deps.authorize, {
          principalId: principal.id,
          permission: "workspace.manage",
          workspaceId: deps.workspaceId,
        }))
      )
        return;

      // INV-05: identity, not count. See this file's header.
      if (targetWorkspaceId === deps.workspaceId) {
        res.status(409).json({
          error: "the workspace this server is bound to cannot be deleted while it is serving that workspace",
          code: "BOUND_WORKSPACE",
        });
        return;
      }

      await deleteWorkspace({ deps: { repo: deps.workspaceRepo }, input: { id: deps.workspaceId } });

      res.status(204).send();
    } catch (err) {
      sendDeleteWorkspaceError(res, err);
    }
  });
};
