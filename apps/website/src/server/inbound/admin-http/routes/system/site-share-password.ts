import type { Request, RequestHandler, Response } from "express";
import type { SiteShareBackend } from "#src/features/site-backup/share-backend";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { sendSiteShareFailure } from "./site-share-errors.js";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { isSameOriginAdminWrite } from "#src/features/agent-plugins/admin-surfaces/same-origin";

interface SavedKeysOwnerDeps {
  workspaceId: string;
  ownerPrincipalId: PromiseLike<string> | string;
}
/** Shared by opt-in export and explicit reveal. Owner identity is stronger than general backup
 * permission; a connected-computer, tool or API credential must never reveal an archive password.
 * @complexity O(1) checks, before any share lookup or secret open.
 */
export async function requireSavedKeysOwnerSession(required: { req: Request; res: Response; deps: SavedKeysOwnerDeps }, _optional: Record<string, never> = {}): Promise<boolean> {
  const { req, res, deps } = required;
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ code: "NOT_FOUND", message: "Saved keys access failed: this workspace is not available." }); return false; }
  if (!rejectUnlessSessionCredential(res, { message: "Use the site owner's signed-in browser for saved keys.", permission: "site-backup.push" })) return false;
  if (getPublishTrustContext(res) || getAuthedPrincipal(res).id !== await deps.ownerPrincipalId) { res.status(403).json({ code: "FORBIDDEN", message: "Saved keys access requires the site owner’s signed-in browser on this Tovu site." }); return false; }
  const sameOrigin = isSameOriginAdminWrite({ origin: req.get("origin"), host: req.get("host"), fetchSite: req.get("sec-fetch-site") });
  if (!sameOrigin || req.get("origin") !== req.protocol + "://" + req.get("host")) { res.status(403).json({ code: "FORBIDDEN", message: "Saved keys access requires the site owner’s signed-in browser on this Tovu site." }); return false; }
  return true;
}

/** Register on POST …/site-shares/:shareId/password after the existing session middleware.
 * The backend owns record/workspace lookup and password opening; this boundary adds browser-only
 * owner and CSRF checks. Every outcome, including denial, remains non-cacheable.
 * @example app.post(`${root}/:shareId/password`, createSiteSharePasswordHandler({ deps }));
 */
export function createSiteSharePasswordHandler(required: { deps: SavedKeysOwnerDeps & { siteShareBackend?: Pick<SiteShareBackend, "revealPassword">; tracker?: Pick<Tracker, "error"> } }, _optional: Record<string, never> = {}): RequestHandler {
  return async (req, res) => {
    try {
      if (!await requireSavedKeysOwnerSession({ req, res, deps: required.deps })) return;
      const backend = required.deps.siteShareBackend;
      if (!backend) { res.status(503).json({ code: "UNAVAILABLE", message: "Export password lookup failed: saved keys are unavailable." }); return; }
      res.json(await backend.revealPassword({ principalId: getAuthedPrincipal(res).id, shareId: String(req.params.shareId) }));
    } catch (error) {
      sendSiteShareFailure({ res, error, tracker: required.deps.tracker }, { password: true });
    }
  };
}
