import type { Request, RequestHandler, Response } from "express";
import type { SiteShareBackend } from "#src/features/site-backup/share-backend";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
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
  if (String(req.params.workspaceId) !== deps.workspaceId) { res.sendStatus(404); return false; }
  if (!rejectUnlessSessionCredential(res, { message: "Use the site owner's signed-in browser for saved keys.", permission: "site-backup.push" })) return false;
  if (getPublishTrustContext(res) || getAuthedPrincipal(res).id !== await deps.ownerPrincipalId) { res.sendStatus(403); return false; }
  const sameOrigin = isSameOriginAdminWrite({ origin: req.get("origin"), host: req.get("host"), fetchSite: req.get("sec-fetch-site") });
  if (!sameOrigin || req.get("origin") !== req.protocol + "://" + req.get("host")) { res.sendStatus(403); return false; }
  return true;
}

/** Register on POST …/site-shares/:shareId/password after the existing session middleware.
 * The backend owns record/workspace lookup and password opening; this boundary adds browser-only
 * owner and CSRF checks. Every outcome, including denial, remains non-cacheable.
 * @example app.post(`${root}/:shareId/password`, createSiteSharePasswordHandler({ deps }));
 */
export function createSiteSharePasswordHandler(required: { deps: SavedKeysOwnerDeps & { siteShareBackend?: Pick<SiteShareBackend, "revealPassword"> } }, _optional: Record<string, never> = {}): RequestHandler {
  return async (req, res) => {
    try {
      if (!await requireSavedKeysOwnerSession({ req, res, deps: required.deps })) return;
      const backend = required.deps.siteShareBackend;
      if (!backend) { res.status(503).json({ code: "UNAVAILABLE", message: "Saved keys are unavailable." }); return; }
      res.json(await backend.revealPassword({ principalId: getAuthedPrincipal(res).id, shareId: String(req.params.shareId) }));
    } catch (error) {
      const code = error instanceof SiteShareRefusal ? error.code : "SHARE_FAILED";
      const status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400;
      // Backend/provider errors can contain secrets. Return only the fixed public diagnosis.
      res.status(status).json({ code, message: "Export password is unavailable for this site." });
    }
  };
}
