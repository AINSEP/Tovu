import type { Express } from "express";

import { ContentTypeNotActiveError, EntryFieldValidationError, EntryNotFoundError, ForbiddenError, VersionConflictError } from "../../../../features/entries/errors";
import { toEntryOutbox } from "../../../../features/entries/repo.memory";
import { updateEntry } from "../../../../features/entries/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

function statusFor(error: Error): { status: number; code: string } {
  if (error instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof EntryNotFoundError) return { status: 404, code: "ENTRY_NOT_FOUND" };
  if (error instanceof ContentTypeNotActiveError) return { status: 409, code: "CONTENT_TYPE_NOT_ACTIVE" };
  if (error instanceof VersionConflictError) return { status: 409, code: "VERSION_CONFLICT" };
  if (error instanceof EntryFieldValidationError) return { status: 400, code: "VALIDATION_ERROR" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

/**
 * @file design-spec.md §1.5/§1.9 — `PUT /api/admin/v1/entries/:id` (updates an entry's
 * title/fieldsJson, REQ-28). Gated by `admin.collections.manage`.
 */
export function registerAdminEntryUpdateRoute(app: Express, deps: RouteDeps): void {
  app.put("/api/admin/v1/entries/:id", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.collections.manage",
        workspaceId: deps.workspaceId,
        entityType: "entry",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.collections.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.collections.manage", reason: authResult.reason },
        });
        return;
      }

      const body = req.body ?? {};
      if (typeof body.expectedVersion !== "number") {
        res.status(400).json({ error: "'expectedVersion' (number) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await updateEntry({
        deps: {
          entryRepo: deps.entryRepo,
          contentTypeRepo: deps.contentTypeRepo,
          clock: deps.clock,
          authorize: deps.authorize,
          outbox: toEntryOutbox(deps),
        },
        input: {
          actorId: principal.id,
          workspaceId: deps.workspaceId,
          id: String(req.params.id),
          title: typeof body.title === "string" ? body.title : undefined,
          fieldsJson: body.fieldsJson,
          expectedVersion: body.expectedVersion,
        },
      });

      if (!result.ok) {
        const { status, code } = statusFor(result.error);
        res.status(status).json({ error: result.error.message, code });
        return;
      }
      res.json(result.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
