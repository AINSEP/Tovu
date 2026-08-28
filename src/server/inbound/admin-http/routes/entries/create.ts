import type { Express } from "express";

import {
  ContentTypeNotActiveError,
  ContentTypeNotFoundError,
  EntryFieldValidationError,
  EntrySlugConflictError,
  ForbiddenError,
} from "#src/features/entries/index";
import { toEntryOutbox } from "#src/features/entries/index";
import { createEntry } from "#src/features/entries/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentTypesRouteDeps } from "../content-types/deps.js";

function statusFor(error: Error): { status: number; code: string } {
  if (error instanceof ForbiddenError) return { status: 403, code: "FORBIDDEN" };
  if (error instanceof ContentTypeNotFoundError) return { status: 404, code: "CONTENT_TYPE_NOT_FOUND" };
  if (error instanceof ContentTypeNotActiveError) return { status: 409, code: "CONTENT_TYPE_NOT_ACTIVE" };
  if (error instanceof EntrySlugConflictError) return { status: 409, code: "ENTRY_SLUG_CONFLICT" };
  if (error instanceof EntryFieldValidationError) return { status: 400, code: "VALIDATION_ERROR" };
  return { status: 500, code: "INTERNAL_ERROR" };
}

/** This route's required `type`/`slug`/`title` (strings) plus the optional `fieldsJson`/`bodyJson`
 *  fields, read off an untyped body in one place. `null` means the required strings failed
 *  validation. @complexity O(1). */
function parseCreateEntryBody(
  rawBody: unknown
): { type: string; slug: string; title: string; fieldsJson: unknown; bodyJson: unknown } | null {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  if (typeof body.type !== "string" || typeof body.slug !== "string" || typeof body.title !== "string") return null;
  return {
    type: body.type,
    slug: body.slug,
    title: body.title,
    fieldsJson: body.fieldsJson ?? { ext: { site: {} } },
    bodyJson: body.bodyJson,
  };
}

/**
 * @file design-spec.md §1.5/§1.9 — `POST /api/admin/v1/entries` (creates a Collection entry,
 * REQ-13/14/19). Gated by `admin.collections.manage`.
 */
export function registerAdminEntryCreateRoute(app: Express, deps: ContentTypesRouteDeps): void {
  app.post("/api/admin/v1/entries", async (req, res) => {
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

      const parsedBody = parseCreateEntryBody(req.body);
      if (!parsedBody) {
        res.status(400).json({ error: "'type', 'slug', and 'title' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const result = await createEntry({
        deps: {
          entryRepo: deps.entryRepo,
          contentTypeRepo: deps.contentTypeRepo,
          clock: deps.clock,
          ids: deps.idGen,
          authorize: deps.authorize,
          outbox: toEntryOutbox(deps),
        },
        input: {
          actorId: principal.id,
          workspaceId: deps.workspaceId,
          ...parsedBody,
        },
      });

      if (!result.ok) {
        const { status, code } = statusFor(result.error);
        res.status(status).json({ error: result.error.message, code });
        return;
      }
      res.status(201).json(result.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
    }
  });
}
