import type { Response } from "express";

import { updateWorkspace, WorkspaceConflictError, WorkspaceNotFoundError, WorkspaceValidationError } from "#src/features/workspace/index";
import { toAdminWorkspaceResponse } from "#src/server/inbound/admin-http/http/workspace";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { WorkspaceRouteRegistrar } from "./deps.js";

/** This route's two writable PATCH fields — `undefined` means "leave unchanged" — read off an
 *  untyped body in one place. @complexity O(1). */
function parseWorkspaceUpdateBody(rawBody: unknown): { name: string | undefined; slug: string | undefined } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    name: body.name !== undefined ? String(body.name) : undefined,
    slug: body.slug !== undefined ? String(body.slug) : undefined,
  };
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendWorkspaceUpdateError(res: Response, err: unknown): void {
  if (err instanceof WorkspaceValidationError) {
    res.status(400).json({ error: err.message, code: "VALIDATION_ERROR" });
    return;
  }
  if (err instanceof WorkspaceConflictError) {
    res.status(409).json({ error: err.message, code: "RESOURCE_CONFLICT", details: { field: "slug" } });
    return;
  }
  if (err instanceof WorkspaceNotFoundError) {
    res.status(404).json({ error: err.message, code: "RESOURCE_NOT_FOUND" });
    return;
  }
  res.status(500).json({ error: "internal error" });
}

/**
 * PATCH workspaces/:workspaceId — `UPDATE_WORKSPACE` (SPEC-044 REQ-04, AC-05). `:workspaceId` must
 * equal the caller's own workspace (INV-04, checked before authorization, same as `get.ts`). Gated
 * by `workspace.manage`.
 */
export const registerAdminWorkspaceUpdateRoute: WorkspaceRouteRegistrar = (app, deps) => {
  app.patch("/api/admin/v1/workspaces/:workspaceId", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "workspace.manage",
        workspaceId: deps.workspaceId,
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'workspace.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "workspace.manage", reason: authResult.reason },
        });
        return;
      }

      const { workspace } = await updateWorkspace({
        deps: { repo: deps.workspaceRepo },
        input: {
          id: deps.workspaceId,
          ...parseWorkspaceUpdateBody(req.body),
        },
      });

      res.json({ workspace: toAdminWorkspaceResponse(workspace) });
    } catch (err) {
      sendWorkspaceUpdateError(res, err);
    }
  });
};
