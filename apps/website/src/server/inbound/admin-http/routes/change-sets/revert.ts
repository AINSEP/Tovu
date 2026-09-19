import type { Response } from "express";

import {
  ChangeSetInvalidStatusError,
  ChangeSetNotFoundError,
  RevertConflictError,
  RevertForbiddenError,
  RevertNotPossibleError,
  revertChangeSet,
} from "#src/contracts/core/commands/index";
import { toChangeSetHeaderResponse } from "#src/server/inbound/admin-http/http/change-sets";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentRouteRegistrar } from "../content/deps.js";

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendChangeSetRevertError(res: Response, err: unknown): void {
  if (err instanceof ChangeSetNotFoundError) {
    res.status(404).json({ error: err.message, code: "CHANGE_SET_NOT_FOUND" });
    return;
  }
  if (err instanceof ChangeSetInvalidStatusError) {
    res.status(409).json({ error: err.message, code: "CHANGE_SET_INVALID_STATUS" });
    return;
  }
  // Before `RevertConflictError` below only by file convention (matches `sendPostUpdateError`'s
  // 403-checks-first ordering) — the two classes are unrelated, so ordering has no `instanceof`
  // hazard here.
  if (err instanceof RevertForbiddenError) {
    res.status(403).json({ error: err.message, code: "REVERT_FORBIDDEN", details: { reason: err.reasonCode } });
    return;
  }
  if (err instanceof RevertConflictError) {
    res.status(409).json({
      error: err.message,
      code: "REVERT_CONFLICT",
      details: { currentVersion: err.currentVersion, currentActorId: err.currentActorId },
    });
    return;
  }
  if (err instanceof RevertNotPossibleError) {
    res.status(422).json({ error: err.message, code: "REVERT_NOT_POSSIBLE" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * POST revert an applied change set (SPEC-001 REQ-07/08/10).
 *
 * Gated by the existing `changeset.revert` permission, checked directly via `authorize()` —
 * `revertChangeSet` is a standalone `core/commands` function called directly by this route, not
 * routed through `executeCommand` (that gateway wraps forward mutations, not reverts), so this
 * uses the same in-route pattern as `members/disable.ts` rather than the gateway pair.
 *
 * Task 14b (2026-09-18): accepts an optional `force: true` body field, which is itself the
 * "operator explicitly clicked through a warning" signal — the same shape
 * `features/recovery/recovery-orchestrator.ts`'s `disclosureAcknowledged` uses (a single
 * strictly-`=== true` boolean the caller must deliberately set), not the full
 * `gated-mutations` plan -> confirm -> execute token ceremony, which is a separate, heavier
 * primitive this route has no other reason to adopt. `force` is forwarded to `revertChangeSet`
 * alongside `principal.kind` so the agent-cannot-force rule is enforced once, in `core/commands`,
 * not re-implemented at this layer.
 */
export const registerAdminChangeSetRevertRoute: ContentRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/change-sets/:changeSetId/revert", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const changeSetId = String(req.params.changeSetId ?? "");

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "changeset.revert",
        workspaceId: deps.workspaceId,
        entityType: "change_set",
        entityId: changeSetId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'changeset.revert' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "changeset.revert", reason: authResult.reason },
        });
        return;
      }

      const body = req.body ?? {};
      const reverted = await revertChangeSet({
        deps: {
          changeSets: deps.changeSets,
          registry: deps.revertRegistry,
          clock: deps.clock,
          idGen: deps.idGen,
          outbox: deps.outbox,
        },
        input: {
          workspaceId: deps.workspaceId,
          changeSetId,
          force: body.force === true,
          principalKind: principal.kind,
        },
      });

      res.json({ changeSet: toChangeSetHeaderResponse(reverted) });
    } catch (err) {
      sendChangeSetRevertError(res, err);
    }
  });
};
