import {
  ChangeSetInvalidStatusError,
  ChangeSetNotFoundError,
  defaultRevertRegistry,
  RevertConflictError,
  RevertNotPossibleError,
  revertChangeSet,
} from "../../../../core/commands";
import { toChangeSetHeaderResponse } from "../../../../server/http/admin/change-sets";
import type { RouteRegistrar } from "../../../routes/types";

/** POST revert an applied change set (SPEC-001 REQ-07/08/10). */
export const registerAdminChangeSetRevertRoute: RouteRegistrar = (app, deps) => {
  const registry = defaultRevertRegistry();

  app.post("/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId/revert", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const reverted = await revertChangeSet({
        deps: {
          changeSets: deps.changeSets,
          registry,
          reverterDeps: {
            postRepo: deps.postRepo,
            presentationRepo: deps.presentationRepo,
            clock: deps.clock,
          },
          clock: deps.clock,
          idGen: deps.idGen,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          changeSetId: String(req.params.changeSetId ?? ""),
        },
      });

      res.json({ changeSet: toChangeSetHeaderResponse(reverted) });
    } catch (err) {
      if (err instanceof ChangeSetNotFoundError) {
        res.status(404).json({ error: err.message, code: "CHANGE_SET_NOT_FOUND" });
        return;
      }
      if (err instanceof ChangeSetInvalidStatusError) {
        res.status(409).json({ error: err.message, code: "CHANGE_SET_INVALID_STATUS" });
        return;
      }
      if (err instanceof RevertConflictError) {
        res.status(409).json({ error: err.message, code: "REVERT_CONFLICT" });
        return;
      }
      if (err instanceof RevertNotPossibleError) {
        res.status(422).json({ error: err.message, code: "REVERT_NOT_POSSIBLE" });
        return;
      }
      res.status(500).json({ error: "internal error" });
    }
  });
};
