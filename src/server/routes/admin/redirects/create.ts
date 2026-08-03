import { createRedirect } from "#src/redirects/index";
import {
  RedirectConflictError,
  RedirectLoopError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "#src/redirects/index";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/http/admin/redirects";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";

const VALID_MATCH_TYPES = new Set(["exact", "prefix", "wildcard", "regex"]);
const VALID_STATUS_CODES = new Set([301, 302, 307, 308]);

/**
 * POST a new manual redirect rule (api.spec.md `CREATE_REDIRECT`). Gated by
 * `admin.redirects.manage`. `matchType:'regex'` is a valid request shape per
 * api.spec.md but is always rejected by the chokepoint (REQ-22) — mapped to
 * `REDIRECT_VALIDATION_ERROR` here, same as any other chokepoint validation
 * failure, not a route-level shape rejection.
 */
export const registerAdminRedirectCreateRoute: RedirectRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/redirects", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    const body = req.body ?? {};
    if (!VALID_MATCH_TYPES.has(body.matchType)) {
      res.status(400).json({ error: "matchType must be one of exact/prefix/wildcard/regex", code: "VALIDATION_ERROR" });
      return;
    }
    if (typeof body.fromPattern !== "string" || typeof body.toTarget !== "string") {
      res.status(400).json({ error: "fromPattern and toTarget are required strings", code: "VALIDATION_ERROR" });
      return;
    }
    if (!VALID_STATUS_CODES.has(body.statusCode)) {
      res.status(400).json({ error: "statusCode must be one of 301/302/307/308", code: "VALIDATION_ERROR" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.redirects.manage",
        workspaceId: deps.workspaceId,
        entityType: "redirect",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.redirects.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.redirects.manage", reason: authResult.reason },
        });
        return;
      }

      const { record } = await createRedirect({
        deps: deps.redirectsWriteDeps,
        input: {
          workspaceId: deps.workspaceId,
          matchType: body.matchType,
          fromPattern: body.fromPattern,
          toTarget: body.toTarget,
          statusCode: body.statusCode,
          override: typeof body.override === "boolean" ? body.override : undefined,
          priority: typeof body.priority === "number" ? body.priority : undefined,
          actorId: principal.id,
        },
      });

      res.status(201).json(toAdminRedirectResponse(record));
    } catch (err) {
      if (err instanceof RedirectValidationError) {
        res.status(400).json({ error: err.message, code: "REDIRECT_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof RedirectTargetNotAllowedError) {
        res.status(400).json({ error: err.message, code: "REDIRECT_TARGET_NOT_ALLOWED" });
        return;
      }
      if (err instanceof RedirectConflictError) {
        res.status(409).json({ error: err.message, code: "REDIRECT_CONFLICT" });
        return;
      }
      if (err instanceof RedirectLoopError) {
        res.status(409).json({ error: err.message, code: "REDIRECT_LOOP_DETECTED" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
