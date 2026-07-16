import type { Express } from "express";

import { toContentTypeOutbox } from "../../../../features/content-types/repo.memory";
import {
  ContentTypeNotFoundError,
  ForbiddenError,
  InvalidFieldKindError,
  InvalidFieldNameGrammarError,
  QueryableFieldCapExceededError,
  ValidationError,
  VersionConflictError,
} from "../../../../features/content-types/errors";
import { updateContentTypeFields } from "../../../../features/content-types/write-service";
import { getAuthedPrincipal } from "../../../middleware/dev-auth";
import type { RouteDeps } from "../../types";

function statusFor(error: Error): { status: number; code: string } {
  if (error instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof ContentTypeNotFoundError) return { status: 404, code: "CONTENT_TYPE_NOT_FOUND" };
  if (error instanceof VersionConflictError) return { status: 409, code: "VERSION_CONFLICT" };
  if (
    error instanceof ValidationError ||
    error instanceof InvalidFieldNameGrammarError ||
    error instanceof InvalidFieldKindError ||
    error instanceof QueryableFieldCapExceededError
  ) {
    return { status: 400, code: "VALIDATION_ERROR" };
  }
  return { status: 500, code: "INTERNAL_ERROR" };
}

/**
 * @file design-spec.md §1.9 — `PUT /api/admin/v1/content-types/:key/fields` (full-replace of a
 * content type's field schema, REQ-26/ADR-043 §4). Gated by `admin.collections.manage`.
 */
export function registerAdminContentTypeUpdateFieldsRoute(app: Express, deps: RouteDeps): void {
  app.put("/api/admin/v1/content-types/:key/fields", async (req, res) => {
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
      if (!Array.isArray(body.fields) || typeof body.expectedVersion !== "number") {
        res.status(400).json({ error: "'fields' (array) and 'expectedVersion' (number) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await updateContentTypeFields({
        deps: {
          repo: deps.contentTypeRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          indexProvisioner: deps.contentTypeIndexProvisioner,
          outbox: toContentTypeOutbox(deps),
        },
        input: {
          actorId: principal.id,
          workspaceId: deps.workspaceId,
          key: String(req.params.key),
          fields: body.fields,
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
