import type { Express } from "express";

import { ContentTypeNotActiveError, EntryNotFoundError, ForbiddenError, VersionConflictError } from "#src/features/entries/index";
import { ENTRY_LIFECYCLE_OPS, parseEntryLifecycleOp } from "#src/features/entries/index";
import { toEntryOutbox } from "#src/features/entries/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentTypesRouteDeps } from "../content-types/deps.js";

function statusFor(error: Error): { status: number; code: string } {
  if (error instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof EntryNotFoundError) return { status: 404, code: "ENTRY_NOT_FOUND" };
  if (error instanceof ContentTypeNotActiveError) return { status: 409, code: "CONTENT_TYPE_NOT_ACTIVE" };
  if (error instanceof VersionConflictError) return { status: 409, code: "VERSION_CONFLICT" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

/**
 * @file design-spec.md §1.5/§1.9 — `POST /api/admin/v1/entries/:id/lifecycle` (Publish/Unpublish,
 * REQ-28). Gated by `admin.collections.manage`.
 *
 * ADR-042 closed-union-dispatch: `op` is narrowed to {@link
 * import("../../../../features/entries/lifecycle-dispatch").EntryLifecycleOp} before lookup —
 * mirrors `routes/admin/content-types/lifecycle.ts`'s identical shape.
 */
export function registerAdminEntryLifecycleRoute(app: Express, deps: ContentTypesRouteDeps): void {
  app.post("/api/admin/v1/entries/:id/lifecycle", async (req, res) => {
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
      const op = parseEntryLifecycleOp(body.op);
      if (!op) {
        res.status(400).json({ error: "'op' must be one of 'publish', 'unpublish'", code: "VALIDATION_ERROR" });
        return;
      }
      if (typeof body.expectedVersion !== "number") {
        res.status(400).json({ error: "'expectedVersion' (number) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const handler = ENTRY_LIFECYCLE_OPS[op];
      const result = await handler({
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
