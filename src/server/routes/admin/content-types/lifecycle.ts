import type { Express } from "express";

import { ContentTypeLifecycleError, ContentTypeNotFoundError, ForbiddenError, VersionConflictError } from "../../../../features/content-types/errors";
import { CONTENT_TYPE_LIFECYCLE_OPS, parseContentTypeLifecycleOp } from "../../../../features/content-types/lifecycle-dispatch";
import { toContentTypeOutbox } from "../../../../features/content-types/repo.memory";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { ContentTypesRouteDeps } from "./deps";

function statusFor(error: Error): { status: number; code: string } {
  if (error instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof ContentTypeNotFoundError) return { status: 404, code: "CONTENT_TYPE_NOT_FOUND" };
  if (error instanceof VersionConflictError) return { status: 409, code: "VERSION_CONFLICT" };
  if (error instanceof ContentTypeLifecycleError) return { status: 409, code: "CONTENT_TYPE_LIFECYCLE_ERROR" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

/**
 * @file design-spec.md §1.3/§1.9 — `POST /api/admin/v1/content-types/:key/lifecycle` (Deprecate /
 * Reactivate / Tombstone, ADR-043 §4/§6). Gated by `admin.collections.manage`.
 *
 * ADR-042 convention: the request body's `op` field is untrusted input routing to one of three
 * write-service functions — narrowed via `parseContentTypeLifecycleOp` to the closed
 * {@link import("../../../../features/content-types/lifecycle-dispatch").ContentTypeLifecycleOp}
 * union BEFORE any dispatch-table lookup, never a raw `Record<string, Handler>` keyed by the
 * unparsed request value (mirrors `routes/admin/settings/register-definitions.ts`'s identical
 * `NON_REGISTER_DEFINITION_OPS` shape).
 */
export function registerAdminContentTypeLifecycleRoute(app: Express, deps: ContentTypesRouteDeps): void {
  app.post("/api/admin/v1/content-types/:key/lifecycle", async (req, res) => {
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.collections.manage",
        workspaceId: deps.workspaceId,
        entityType: "content-type",
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
      const op = parseContentTypeLifecycleOp(body.op);
      if (!op) {
        res.status(400).json({ error: "'op' must be one of 'deprecate', 'reactivate', 'tombstone'", code: "VALIDATION_ERROR" });
        return;
      }
      if (typeof body.expectedVersion !== "number") {
        res.status(400).json({ error: "'expectedVersion' (number) is required", code: "VALIDATION_ERROR" });
        return;
      }

      const handler = CONTENT_TYPE_LIFECYCLE_OPS[op];
      const result = await handler(
        {
          repo: deps.contentTypeRepo,
          clock: deps.clock,
          authorize: deps.authorize,
          outbox: toContentTypeOutbox(deps),
          indexProvisioner: deps.contentTypeIndexProvisioner,
        },
        {
          workspaceId: deps.workspaceId,
          actorId: principal.id,
          principalKind: principal.kind,
          key: String(req.params.key),
          expectedVersion: body.expectedVersion,
        }
      );

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
