import { sendSiteShareFailure } from "./site-share-password.js";
import type { Express, Request, Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SHARE_DOWNLOAD_HEADERS } from "#src/features/site-backup/share-service";

export function readShareInput({ body }: { body: unknown }, _options = {}): { jobId?: string } {
  const raw = body ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.keys(raw).some(key => key !== "jobId")) {
    throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Exports no longer include saved keys. Start an export with {}, or poll with jobId only." });
  }
  const jobId = shareInputJob({ value: (raw as Record<string, unknown>).jobId });
  return jobId ? { jobId } : {};
}

function shareInputJob(required: { value: unknown }, _options = {}): string | undefined {
  const jobId = required.value;
  if (jobId !== undefined && (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/.test(jobId))) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "jobId must be a share job id." });
  return jobId as string | undefined;
}

/** The download's fixed step label: refusals and incidents stay specific without exposing input. */
const DOWNLOAD_STEP = "Export download";

type ShareBackend = NonNullable<RouteDeps["siteShareBackend"]>;
type ShareFail = (res: Response, error: unknown, req: Request) => void;

/** Workspace match, session kind, RBAC and backend availability — resolves the backend or has already responded.
 * The same gate the Jini site-share specs run behind their admin mount; the download keeps it host-side. */
async function downloadGate({ req, res, deps }: { req: Request; res: Response; deps: RouteDeps }, _optional: Record<string, never> = {}): Promise<ShareBackend | false> {
  res.set({ "Cache-Control": "no-store" });
  if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ code: "NOT_FOUND", message: `${DOWNLOAD_STEP} failed: this workspace is not available.` }); return false; }
  // Only the two artifact routes admit connected-computer sessions; admin operations keep RBAC.
  if (getPublishTrustContext(res)) { res.status(403).json({ code: "FORBIDDEN", message: `${DOWNLOAD_STEP} requires an authorized admin session.` }); return false; }
  if (!await authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission: "site-backup.push", entityType: "site-backup" } })) return false;
  if (!deps.siteShareBackend) { res.status(503).json({ code: "UNAVAILABLE", message: `${DOWNLOAD_STEP} requires a site folder and private artifact storage.` }); return false; }
  return deps.siteShareBackend;
}

function sendShareZip({ req, res, row, registry, fail }: { req: Request; res: Response; row: { shareId: string; file: string }; registry: ShareBackend["registry"]; fail: ShareFail }): void {
  res.set({ ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": `attachment; filename="${row.file}"` });
  res.sendFile(`${row.shareId}.tovu.zip`, { root: registry.directory, dotfiles: "deny", cacheControl: false, lastModified: false }, error => {
    if (!error) return;
    if (res.headersSent) { res.destroy(); return; }
    res.removeHeader("Content-Disposition");
    res.type("application/json");
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ code: "NOT_FOUND", message: "Export download failed: the ZIP is missing from storage. Create a new export." });
      return;
    }
    fail(res, error, req);
  });
}

/** `GET …/site-shares/:shareId/download`, host-side (STAYS-HOST): it streams the stored ZIP with
 * `res.sendFile` and, when the stream fails after the head went out, destroys the socket — socket-level
 * behaviour a Jini raw spec does not express. The composition module registers it between the
 * acknowledgement and revocation specs (the pinned route order keeps `download` before `DELETE :shareId`).
 */
export function registerAdminSiteShareDownloadRoute(required: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const fail: ShareFail = (res, error) => sendSiteShareFailure({ res, error, tracker: deps.tracker }, { step: DOWNLOAD_STEP });
  app.get("/api/admin/v1/workspaces/:workspaceId/site-shares/:shareId/download", async (req, res) => {
    try {
      const backend = await downloadGate({ req, res, deps });
      if (!backend) return;
      const registry = backend.registry;
      const row = await registry.get({ shareId: String(req.params.shareId), site: deps.workspaceId });
      if (!row || row.status === "revoked") { res.status(404).json({ code: "NOT_FOUND", message: "Export download failed: this export is missing or was revoked." }); return; }
      if (row.needsAcknowledgement) {
        res.status(403).json({ code: "ACKNOWLEDGE_CREDENTIALS", message: "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.", credentialWarnings: row.credentialWarnings ?? [] });
        return;
      }
      sendShareZip({ req, res, row, registry, fail });
    } catch (error) { fail(res, error, req); }
  });
}
