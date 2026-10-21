import type { Express } from "express";

import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { toContentTypeOutbox } from "#src/features/content-types/index";
import { parseContentTypeFieldDefs } from "#src/features/content-types/index";
import { registerContentType } from "#src/features/content-types/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { ContentTypesRouteDeps } from "./deps.js";
import { contentTypeWriteErrorStatus } from "./write-error-status.js";

/**
 * @file design-spec.md §1.3/§1.9 — `POST /api/admin/v1/content-types` (creates a Collection's
 * content type, ADR-043 §4). Gated by `admin.collections.manage`; the write-service's own
 * `registerContentType` re-checks the same permission internally (chokepoint discipline) — this
 * route's own pre-check exists only for a fast, structured 403 before touching the body at all,
 * mirroring `routes/admin/settings/register-definitions.ts`'s identical pattern.
 */
export function registerAdminContentTypeRegisterRoute(app: Express, deps: ContentTypesRouteDeps): void {
  app.post("/api/admin/v1/content-types", async (req, res) => {
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
      if (typeof body.key !== "string" || typeof body.label !== "string") {
        res.status(400).json({ error: "'key' (string) and 'label' (string) are required", code: "VALIDATION_ERROR" });
        return;
      }
      // Shape-validated here rather than cast: an `Array.isArray` check alone let a non-boolean
      // `required`/`queryable` persist verbatim and let a non-object element throw a TypeError
      // inside the domain's field-name grammar guard. Shared with the agent-tool path so the two
      // boundaries cannot drift. Domain rules (grammar, reserved key, kind enum, queryable cap)
      // stay in `write-service.ts`'s CIC U-002-B1 chain — see `field-defs.ts`'s header.
      const fields = parseContentTypeFieldDefs({ value: body.fields });
      if (!fields.ok) {
        const { status, code } = contentTypeWriteErrorStatus(fields.error);
        res.status(status).json({ error: fields.error.message, code });
        return;
      }

      const result = await registerContentType({
        deps: {
          repo: deps.contentTypeRepo,
          clock: deps.clock,
          ids: deps.idGen,
          // Jini passes entity scope separately; merge it into the host evaluator's request.
          authorize: adaptLegacyAuthorize({ authorize: deps.authorize }),
          indexProvisioner: deps.contentTypeIndexProvisioner,
          outbox: toContentTypeOutbox(deps),
        },
        input: {
          actorId: principal.id,
          principalKind: principal.kind,
          workspaceId: deps.workspaceId,
          key: body.key,
          label: body.label,
          fields: fields.value,
        },
      });

      if (!result.ok) {
        const { status, code } = contentTypeWriteErrorStatus(result.error);
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
