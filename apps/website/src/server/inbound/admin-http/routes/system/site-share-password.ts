import type { Request, RequestHandler, Response } from "express";
import type { SiteShareBackend } from "@jini-ai/devops/backup/site/share-backend";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { savedKeysSameOrigin, requireSavedKeysOwnerSession as requireOwnerSession, sendSiteShareFailure as sendShareFailure } from "@jini-ai/cms/admin-http/routes/system/site-share-password";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SiteShareExportFailure } from "@jini-ai/devops/backup/site/share-export-failure";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";

interface SavedKeysOwnerDeps {
  workspaceId: string;
  ownerPrincipalId: PromiseLike<string> | string;
}
export const requireSavedKeysOwnerSession = ({ req, res, deps }: { req: Request; res: Response; deps: SavedKeysOwnerDeps }, _optional: Record<string, never> = {}): Promise<boolean> => requireOwnerSession({ deps: {
  noStore: () => { res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }); },
  foreignWorkspace: () => String(req.params.workspaceId) !== deps.workspaceId,
  requireSession: () => rejectUnlessSessionCredential({ res, message: "Use the site owner's signed-in browser for saved keys.", permission: "site-backup.push" }),
  publishTrustContext: () => getPublishTrustContext(res),
  principalId: () => getAuthedPrincipal(res).id,
  ownerPrincipalId: () => deps.ownerPrincipalId,
  sameOrigin: () => savedKeysSameOrigin({ origin: req.get("origin"), host: req.get("host"), fetchSite: req.get("sec-fetch-site"), protocol: req.protocol }),
  json: (body, status) => { res.status(status).json(body); },
  ownerMessage: "Saved keys access requires the site owner’s signed-in browser on this Tovu site.",
} });

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

/** Closed stage descriptions: the route never infers storage trouble from an arbitrary exception. */
export const sendSiteShareFailure = (
  { res, error, tracker }: { res: Response; error: unknown; tracker?: Pick<Tracker, "error"> },
  options: { password?: boolean; step?: string } = {},
): void => sendShareFailure({ error, deps: {
  refusal: SiteShareRefusal,
  exportFailure: SiteShareExportFailure,
  json: (body, status) => { res.status(status).json(body); },
  failure: (error, options) => sendAdminFailure({ res, error, tracker }, options),
} }, options);
