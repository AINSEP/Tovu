import type { Request, RequestHandler, Response } from "express";
import type { SiteShareBackend } from "#src/features/site-backup/share-backend";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { isSameOriginAdminWrite } from "#src/features/agent-plugins/admin-surfaces/same-origin";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SiteShareExportFailure, SITE_EXPORT_FAILURE_MESSAGES } from "#src/features/site-backup/share-export-failure";
import { sendAdminFailure, type FailureOptions } from "#src/server/inbound/shared/admin-failure";

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

/** Share and password failures must remain diagnosable even when telemetry is disabled.
 * Expected refusals keep their safe public diagnosis. The authorized export pilot discloses its
 * redacted cause; other unexpected details stay in redacted logs.
 * @complexity The shared redaction cost, with one local log and one tracker report.
 */
export function sendSiteShareFailure(
  { res, error, tracker }: { res: Response; error: unknown; tracker?: Pick<Tracker, "error"> },
  { password = false, step }: { password?: boolean; step?: string } = {},
): void {
  if (sendShareRefusal({ res, error }, { password, step })) return;
  if (sendShareUploadRefusal({ res, error }, { step })) return;
  sendAdminFailure({ res, error, tracker }, shareFailureOptions({ error, step, password }));
}

function shareFailureMessage({ step, password }: { step: string | undefined; password: boolean }): string {
  if (step) return `${step} could not finish.`;
  return password ? "Export password is unavailable for this site." : "The share operation could not finish.";
}

/** Preserve safe refusals and their established status codes without generating an incident. */
function sendShareRefusal({ res, error }: { res: Response; error: unknown }, { password, step }: { password: boolean; step: string | undefined }): boolean {
  if (!(error instanceof SiteShareRefusal)) return false;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
  const message = password ? shareFailureMessage({ step, password }) : step ? `${step} failed: ${error.message}` : error.message;
  res.status(status).json({ code: error.code, message });
  return true;
}

/** Map only export-owned stages to public explanations; never guess a provider-specific remedy. */
function shareFailureOptions({ error, step, password }: { error: unknown; step: string | undefined; password: boolean }): FailureOptions {
  const common = { operation: step ? `site-share:${step}` : "site-share", code: "SHARE_FAILED", field: "message" as const };
  const action = "Copy details and report this problem. Check export history before starting another export.";
  if (error instanceof SiteShareExportFailure) {
    const metadata = Object.fromEntries(Object.entries({ appVersion: error.appVersion, jiniVersion: error.jiniVersion, time: error.time }).filter(([, value]) => value !== undefined));
    return { ...common, message: SITE_EXPORT_FAILURE_MESSAGES[error.step], failure: { action, step: error.step, cause: error.cause, metadata } };
  }
  return { ...common, message: shareFailureMessage({ step, password }), failure: { action, step: step ?? "site-share" } };
}

/** Parser errors describe a failed upload, while unexpected storage faults remain incidents. */
function sendShareUploadRefusal({ res, error }: { res: Response; error: unknown }, { step = "Share artifact upload" }: { step?: string } = {}): boolean {
  const type = (error as { type?: string } | null)?.type;
  if (!type || !["entity.too.large", "encoding.unsupported", "entity.parse.failed", "request.aborted", "request.size.invalid"].includes(type)) return false;
  res.status(type === "entity.too.large" ? 413 : 400).json({ code: type === "entity.too.large" ? "LIMIT_EXCEEDED" : "INVALID_INPUT", message: `${step} failed: upload raw application/zip bytes within the 300 MiB cap.` });
  return true;
}
