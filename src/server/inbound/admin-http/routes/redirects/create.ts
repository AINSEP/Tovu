import { createRedirect, type RedirectMatchType, type RedirectStatusCode } from "#src/features/redirects/index";
import { toAdminRedirectResponse, type RedirectRouteRegistrar } from "#src/server/inbound/admin-http/http/redirects";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { REDIRECT_WRITE_ERROR_MAPPINGS, respondToRedirectError } from "./shared.js";

const VALID_MATCH_TYPES = new Set(["exact", "prefix", "wildcard", "regex"]);
const VALID_STATUS_CODES = new Set([301, 302, 307, 308]);

/** This route's five body fields, validated and read off an untyped body in one place, or the 400
 *  message for the first violation.
 *  @complexity O(1). */
function parseRedirectCreateBody(rawBody: unknown):
  | {
      ok: true;
      matchType: RedirectMatchType;
      fromPattern: string;
      toTarget: string;
      statusCode: RedirectStatusCode;
      override: boolean | undefined;
      priority: number | undefined;
    }
  | { ok: false; error: string } {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  if (!VALID_MATCH_TYPES.has(body.matchType as string)) {
    return { ok: false, error: "matchType must be one of exact/prefix/wildcard/regex" };
  }
  if (typeof body.fromPattern !== "string" || typeof body.toTarget !== "string") {
    return { ok: false, error: "fromPattern and toTarget are required strings" };
  }
  if (!VALID_STATUS_CODES.has(body.statusCode as number)) {
    return { ok: false, error: "statusCode must be one of 301/302/307/308" };
  }
  return {
    ok: true,
    matchType: body.matchType as RedirectMatchType,
    fromPattern: body.fromPattern,
    toTarget: body.toTarget,
    statusCode: body.statusCode as RedirectStatusCode,
    override: typeof body.override === "boolean" ? body.override : undefined,
    priority: typeof body.priority === "number" ? body.priority : undefined,
  };
}

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

    const parsedBody = parseRedirectCreateBody(req.body);
    if (!parsedBody.ok) {
      res.status(400).json({ error: parsedBody.error, code: "VALIDATION_ERROR" });
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
          matchType: parsedBody.matchType,
          fromPattern: parsedBody.fromPattern,
          toTarget: parsedBody.toTarget,
          statusCode: parsedBody.statusCode,
          override: parsedBody.override,
          priority: parsedBody.priority,
          actorId: principal.id,
        },
      });

      res.status(201).json(toAdminRedirectResponse(record));
    } catch (err) {
      respondToRedirectError(res, err, REDIRECT_WRITE_ERROR_MAPPINGS);
    }
  });
};
