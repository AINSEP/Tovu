import { createSiteSharePasswordHandler } from "./site-share-password.js";
import { sendSiteShareFailure } from "./site-share-errors.js";
import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "#src/server/inbound/admin-http/publish-trust-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { parseStaticExportInput } from "#src/features/site-backup/static-export-selection";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SHARE_TOKEN, SHARE_FILE } from "#src/features/site-backup/share-registry";
import { SHARE_DOWNLOAD_HEADERS, receiveSiteShareArtifact } from "#src/features/site-backup/share-service";

function readShareInput({ body }: { body: unknown }, _options = {}): { jobId?: string } {
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

/** Fixed route labels keep refusals and unexpected incidents specific without exposing input. */
function shareStep({ req }: { req: Request }, _options = {}): string {
  const suffix = String(req.route?.path ?? "").split("site-shares")[1] ?? "";
  const steps: Readonly<Record<string, string>> = {
    "GET ": "Export history", "POST ": "Export creation", "GET /static/options": "Static export options",
    "POST /static": "Static export creation", "POST /:shareId/acknowledge": "Export acknowledgement",
    "GET /:shareId/download": "Export download", "DELETE /:shareId": "Export revocation",
    "PUT /artifacts/:token/:file": "Share artifact upload", "DELETE /artifacts/:token/:file": "Share artifact deletion",
  };
  return steps[`${req.method} ${suffix}`] ?? "Site sharing";
}

/** Authenticated management and ZIP-only download. Mounted under the existing admin session gate. */
export function registerAdminSiteShareRoutes(required: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const root = "/api/admin/v1/workspaces/:workspaceId/site-shares";
  const gate = async (req: Request, res: Response, artifact = false) => {
    res.set({ "Cache-Control": "no-store" });
    const step = shareStep({ req });
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.status(404).json({ code: "NOT_FOUND", message: `${step} failed: this workspace is not available.` }); return false; }
    const trust = getPublishTrustContext(res);
    // Only the two artifact routes admit connected-computer sessions; admin operations keep RBAC.
    if (trust && !artifact) { res.status(403).json({ code: "FORBIDDEN", message: `${step} requires an authorized admin session.` }); return false; }
    if (!await authorizeOrRespond(res, trust ? publishTrustAuthorizeFor(trust) : deps.authorize, { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission: trust ? "publish_content.apply" : "site-backup.push", entityType: "site-backup" })) return false;
    if (!deps.siteShareBackend) { res.status(503).json({ code: "UNAVAILABLE", message: `${step} requires a site folder and private artifact storage.` }); return false; }
    return true;
  };
  const fail = (res: Response, error: unknown, req: Request) => sendSiteShareFailure({ res, error, tracker: deps.tracker }, { step: shareStep({ req }) });
  app.get(root, async (req, res) => {
    try { if (await gate(req, res)) res.json({ shares: await deps.siteShareBackend!.list({}) }); }
    catch (error) { fail(res, error, req); }
  });
  app.post(root, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      const input = readShareInput({ body: req.body });
      res.json(await deps.siteShareBackend!.create({ principalId: getAuthedPrincipal(res).id, signal: new AbortController().signal, ...input }));
    } catch (error) { fail(res, error, req); }
  });
  app.get(`${root}/static/options`, async (req, res) => {
    try { if (await gate(req, res)) res.json(await deps.siteShareBackend!.staticOptions({})); }
    catch (error) { fail(res, error, req); }
  });
  app.post(`${root}/static`, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      const input = parseStaticExportInput({ input: req.body === undefined ? {} : req.body });
      res.json(await deps.siteShareBackend!.create({ principalId: getAuthedPrincipal(res).id, signal: new AbortController().signal, format: "static", ...input }));
    } catch (error) { fail(res, error, req); }
  });
  app.post(`${root}/:shareId/password`, createSiteSharePasswordHandler({ deps }));
  app.post(`${root}/:shareId/acknowledge`, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      res.json(await deps.siteShareBackend!.acknowledge({ shareId: String(req.params.shareId) }));
    } catch (error) { fail(res, error, req); }
  });
  app.get(`${root}/:shareId/download`, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      const registry = deps.siteShareBackend!.registry;
      const row = await registry.get({ shareId: String(req.params.shareId), site: deps.workspaceId });
      if (!row || row.status === "revoked") { res.status(404).json({ code: "NOT_FOUND", message: "Export download failed: this export is missing or was revoked." }); return; }
      if (row.needsAcknowledgement) {
        res.status(409).json({ code: "ACKNOWLEDGE_CREDENTIALS", message: "This export may contain credentials. Review the warnings and acknowledge that you understand before downloading.", credentialWarnings: row.credentialWarnings ?? [] });
        return;
      }
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
    } catch (error) { fail(res, error, req); }
  });
  app.delete(`${root}/:shareId`, async (req, res) => {
    try { if (await gate(req, res)) res.json(await deps.siteShareBackend!.revoke({ shareId: String(req.params.shareId) })); }
    catch (error) { fail(res, error, req); }
  });
  // Raw ZIP parsing runs AFTER authentication and authorization. A base64 JSON upload would
  // inflate a 300 MiB cap and duplicate the full buffer before we could validate it.
  app.put(`${root}/artifacts/:token/:file`, async (req, res, next) => {
    try { if (await gate(req, res, true)) next(); }
    catch (error) { fail(res, error, req); }
  }, (req, res, next) => {
    express.raw({ type: "application/zip", limit: SHARE_LIMITS.maxArchiveBytes, inflate: false })(req, res, error => {
      if (error) fail(res, error, req);
      else next();
    });
  }, async (req, res) => {
    try {
      const token = String(req.params.token), file = String(req.params.file);
      const validIdentity = SHARE_TOKEN.test(token) && SHARE_FILE.test(file);
      const validArchive = validIdentity && Buffer.isBuffer(req.body) && req.body.length >= 4 && req.body.readUInt32LE(0) === 0x04034b50;
      if (!validArchive) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Expected a .tovu.zip artifact with a 16-letter token and application/zip body." });
      const registry = deps.siteShareBackend!.registry;
      // Tokens are never reused, including revoked uploads. A replay may not resurrect access.
      const row = await receiveSiteShareArtifact({ registry, site: deps.workspaceId, token, file, archive: req.body });
      res.status(201).json({ shareId: row.shareId, bytes: row.bytes, sha256: row.sha256 });
    } catch (error) { fail(res, error, req); }
  });
  app.delete(`${root}/artifacts/:token/:file`, async (req, res) => {
    try {
      if (!await gate(req, res, true)) return;
      const registry = deps.siteShareBackend!.registry;
      const row = (await registry.list({ site: deps.workspaceId })).find(row => row.token === req.params.token && row.file === req.params.file);
      if (!row) { res.status(404).json({ code: "NOT_FOUND", message: "Share artifact deletion failed: this export was not found." }); return; }
      await registry.disable({ shareId: row.shareId, site: deps.workspaceId });
      await registry.deleteArtifact({ shareId: row.shareId });
      res.sendStatus(204);
    } catch (error) { fail(res, error, req); }
  });
}
