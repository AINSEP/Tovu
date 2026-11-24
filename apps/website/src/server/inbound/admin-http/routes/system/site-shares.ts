import { sendSiteShareFailure } from "./site-share-password.js";
import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "#src/server/inbound/admin-http/publish-trust-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SHARE_FILE, SHARE_TOKEN } from "#src/features/site-backup/share-registry";
import { SHARE_DOWNLOAD_HEADERS, receiveSiteShareArtifact } from "#src/features/site-backup/share-service";

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
type ShareFail = (res: Response, error: unknown) => void;

/** Workspace match, session kind, RBAC and backend availability — resolves the backend or has already responded.
 * The same gate the Jini site-share specs run behind their admin mount; the download and the artifact
 * upload keep it host-side. Only the artifact route admits a connected-computer (publish-trust) session.
 * @complexity O(1) plus one authorization call. */
async function shareGate({ req, res, deps, step, artifact }: { req: Request; res: Response; deps: RouteDeps; step: string; artifact: boolean }, _optional: Record<string, never> = {}): Promise<ShareBackend | false> {
  res.set({ "Cache-Control": "no-store" });
  if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ code: "NOT_FOUND", message: `${step} failed: this workspace is not available.` }); return false; }
  const trust = getPublishTrustContext(res);
  if (trust && !artifact) { res.status(403).json({ code: "FORBIDDEN", message: `${step} requires an authorized admin session.` }); return false; }
  if (!await authorizeOrRespond({ res, authorize: trust ? publishTrustAuthorizeFor(trust) : deps.authorize, params: { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission: trust ? "publish_content.apply" : "site-backup.push", entityType: "site-backup" } })) return false;
  if (!deps.siteShareBackend) { res.status(503).json({ code: "UNAVAILABLE", message: `${step} requires a site folder and private artifact storage.` }); return false; }
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
    fail(res, error);
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
      const backend = await shareGate({ req, res, deps, step: DOWNLOAD_STEP, artifact: false });
      if (!backend) return;
      const registry = backend.registry;
      const row = await registry.get({ shareId: String(req.params.shareId), site: deps.workspaceId });
      if (!row || row.status === "revoked") { res.status(404).json({ code: "NOT_FOUND", message: "Export download failed: this export is missing or was revoked." }); return; }
      if (row.needsAcknowledgement) {
        res.status(403).json({ code: "ACKNOWLEDGE_CREDENTIALS", message: "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.", credentialWarnings: row.credentialWarnings ?? [] });
        return;
      }
      sendShareZip({ req, res, row, registry, fail });
    } catch (error) { fail(res, error); }
  });
}

/** The upload's fixed step label. */
const UPLOAD_STEP = "Share artifact upload";

/** `PUT …/site-shares/artifacts/:token/:file`, host-side: the original three-handler registration
 * (gate, `express.raw` ZIP parser, receiver) the route-table pin records. Raw ZIP parsing runs AFTER
 * authentication and authorization: a base64 JSON upload would inflate a 300 MiB cap and duplicate the
 * full buffer before it could be validated. The composition module registers it between the
 * revocation and artifact-deletion specs.
 * @complexity O(n) in the archive bytes, bounded by `SHARE_LIMITS.maxArchiveBytes`.
 */
export function registerAdminSiteShareArtifactUploadRoute(required: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const fail: ShareFail = (res, error) => sendSiteShareFailure({ res, error, tracker: deps.tracker }, { step: UPLOAD_STEP });
  app.put("/api/admin/v1/workspaces/:workspaceId/site-shares/artifacts/:token/:file", async (req, res, next) => {
    try { if (await shareGate({ req, res, deps, step: UPLOAD_STEP, artifact: true })) next(); }
    catch (error) { fail(res, error); }
  }, (req, res, next) => {
    express.raw({ type: "application/zip", limit: SHARE_LIMITS.maxArchiveBytes, inflate: false })(req, res, error => {
      if (error) fail(res, error);
      else next();
    });
  }, async (req, res) => {
    try {
      const token = String(req.params.token), file = String(req.params.file);
      const validIdentity = SHARE_TOKEN.test(token) && SHARE_FILE.test(file);
      const validArchive = validIdentity && Buffer.isBuffer(req.body) && req.body.length >= 4 && req.body.readUInt32LE(0) === 0x04034b50;
      if (!validArchive) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Expected a .tovu.zip artifact with a 16-letter token and application/zip body." });
      const backend = deps.siteShareBackend;
      if (!backend) throw new Error("site share artifact upload has no share backend");
      // Tokens are never reused, including revoked uploads. A replay may not resurrect access.
      const row = await receiveSiteShareArtifact({ registry: backend.registry, site: deps.workspaceId, token, file, archive: req.body });
      res.status(201).json({ shareId: row.shareId, bytes: row.bytes, sha256: row.sha256 });
    } catch (error) { fail(res, error); }
  });
}
