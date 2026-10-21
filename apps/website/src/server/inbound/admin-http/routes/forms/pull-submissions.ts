import { randomUUID } from "node:crypto";
import type { Response } from "express";

import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsRouteDeps, FormsRouteRegistrar } from "./deps.js";

const PERMISSION = "admin.forms.manage";

/** The optional `targetId` from the JSON body, or the reason it was refused. @complexity O(1). */
function parseTargetId(body: unknown): { ok: true; targetId?: string } | { ok: false } {
  const raw = body !== null && typeof body === "object" ? (body as Record<string, unknown>).targetId : undefined;
  if (raw === undefined) return { ok: true };
  return typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? { ok: true, targetId: raw } : { ok: false };
}

/** Keep pull failures correlated with the server log, inside the route's outer fallback. */
async function respondWithPullReport(
  { pull, workspaceId, targetId, res }: {
    pull: NonNullable<FormsRouteDeps["formSubmissionsPull"]>;
    workspaceId: string;
    targetId?: string;
    res: Response;
  },
  _options = {},
): Promise<void> {
  try {
    res.json(await pull.pull({ workspaceId }, targetId ? { targetId } : {}));
  } catch (error) {
    // One host's failure is already a per-destination report; this is a failure before any host
    // was read (the vault, the plugin registry). Log the cause under a reference the reply repeats.
    const reference = randomUUID();
    // eslint-disable-next-line no-console
    console.error(`[forms] pulling form submissions failed, reference ${reference}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    res.status(500).json({ error: `pulling form submissions failed before any host was read; try again, and if it fails again report reference ${reference} (the site's server log has the details)`, code: "INTERNAL_ERROR" });
  }
}

/**
 * POST — pull the submissions published static sites stored at their hosts into this site
 * (`FormsDeps.formSubmissionsPull`, the same composed port as the `forms_pull_submissions` tool).
 * Body: optional `{ targetId }` to pull from one hosting target only.
 */
export const registerAdminFormsPullSubmissionsRoute: FormsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/forms/submissions/pull", async (req, res) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({ principalId: principal.id, permission: PERMISSION, workspaceId: deps.workspaceId, entityType: "form_submission" });
      if (!authResult.allowed) {
        res.status(403).json({ error: `principal '${principal.id}' is not authorized for '${PERMISSION}' (${authResult.reason})`, code: "FORBIDDEN",
          details: { permission: PERMISSION, reason: authResult.reason } });
        return;
      }
      const parsed = parseTargetId(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: "targetId must be a hosting target id of 1-64 characters, or omitted to pull from every published site", code: "FORMS_FIELD_VALIDATION_ERROR",
          details: { fieldErrors: [{ field: "targetId", reason: "must be 1-64 characters" }] } });
        return;
      }
      if (!deps.formSubmissionsPull) {
        res.status(503).json({ error: "pulling form submissions is not available on this site's server; restart the site, then try again", code: "FORMS_PULL_UNAVAILABLE" });
        return;
      }
      await respondWithPullReport({ pull: deps.formSubmissionsPull, workspaceId: deps.workspaceId, targetId: parsed.targetId, res });
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
