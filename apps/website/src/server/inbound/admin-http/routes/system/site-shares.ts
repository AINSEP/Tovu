import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "#src/server/inbound/admin-http/publish-trust-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { SHARE_TOKEN, SHARE_FILE } from "#src/features/site-backup/share-registry";
import { SHARE_DOWNLOAD_HEADERS, receiveSiteShareArtifact } from "#src/features/site-backup/share-service";

function readShareJobId({ body }: { body: unknown }, _options = {}): string | undefined {
  const raw = body ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.keys(raw).some(key => key !== "jobId")) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Only an optional jobId is accepted." });
  const jobId = (raw as Record<string, unknown>).jobId;
  if (jobId !== undefined && (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/.test(jobId))) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "jobId must be a share job id." });
  return jobId as string | undefined;
}

/** Authenticated management and ZIP-only download. Mounted under the existing admin session gate. */
export function registerAdminSiteShareRoutes(required: { app: Express; deps: RouteDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const root = "/api/admin/v1/workspaces/:workspaceId/site-shares";
  const gate = async (req: Request, res: Response, artifact = false) => {
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.sendStatus(404); return false; }
    const trust = getPublishTrustContext(res);
    // Only the two artifact routes admit connected-computer sessions; admin operations keep RBAC.
    if (trust && !artifact) { res.sendStatus(403); return false; }
    if (!await authorizeOrRespond(res, trust ? publishTrustAuthorizeFor(trust) : deps.authorize, { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission: trust ? "publish_content.apply" : "site-backup.push", entityType: "site-backup" })) return false;
    if (!deps.siteShareBackend) { res.status(503).json({ code: "UNAVAILABLE", message: "Site sharing requires a site folder and private artifact storage." }); return false; }
    return true;
  };
  const fail = (res: Response, error: unknown) => res.status(error instanceof SiteShareRefusal && error.code === "NOT_FOUND" ? 404 : 400).json({ code: error instanceof SiteShareRefusal ? error.code : "SHARE_FAILED", message: error instanceof SiteShareRefusal ? error.message : "Share operation failed. Check storage configuration and retry." });
  app.get(root, async (req, res) => {
    try { if (await gate(req, res)) res.json({ shares: await deps.siteShareBackend!.list({}) }); }
    catch (error) { fail(res, error); }
  });
  app.post(root, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      const jobId = readShareJobId({ body: req.body });
      res.json(await deps.siteShareBackend!.create({ principalId: getAuthedPrincipal(res).id, signal: new AbortController().signal, ...(jobId ? { jobId } : {}) }));
    } catch (error) { fail(res, error); }
  });
  app.get(`${root}/:shareId/download`, async (req, res) => {
    try {
      if (!await gate(req, res)) return;
      const registry = deps.siteShareBackend!.registry;
      const row = await registry.get({ shareId: String(req.params.shareId), site: deps.workspaceId });
      if (!row || row.status === "revoked") { res.sendStatus(404); return; }
      res.set({ ...SHARE_DOWNLOAD_HEADERS, "Content-Disposition": `attachment; filename="${row.file}"` });
      res.sendFile(`${row.shareId}.tovu.zip`, { root: registry.directory, dotfiles: "deny", cacheControl: false, lastModified: false }, error => { if (error && !res.headersSent) res.sendStatus(404); });
    } catch (error) { fail(res, error); }
  });
  app.delete(`${root}/:shareId`, async (req, res) => {
    try { if (await gate(req, res)) res.json(await deps.siteShareBackend!.revoke({ shareId: String(req.params.shareId) })); }
    catch (error) { fail(res, error); }
  });
  // Raw ZIP parsing runs AFTER authentication and authorization. A base64 JSON upload would
  // inflate a 300 MiB cap and duplicate the full buffer before we could validate it.
  app.put(`${root}/artifacts/:token/:file`, async (req, res, next) => {
    try { if (await gate(req, res, true)) next(); }
    catch (error) { fail(res, error); }
  }, express.raw({ type: "application/zip", limit: SHARE_LIMITS.maxArchiveBytes }), async (req, res) => {
    try {
      const token = String(req.params.token), file = String(req.params.file);
      const validIdentity = SHARE_TOKEN.test(token) && SHARE_FILE.test(file);
      const validArchive = validIdentity && Buffer.isBuffer(req.body) && req.body.length >= 4 && req.body.readUInt32LE(0) === 0x04034b50;
      if (!validArchive) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Expected a .tovu.zip artifact with a 16-letter token and application/zip body." });
      const registry = deps.siteShareBackend!.registry;
      // Tokens are never reused, including revoked uploads. A replay may not resurrect access.
      const row = await receiveSiteShareArtifact({ registry, site: deps.workspaceId, token, file, archive: req.body });
      res.status(201).json({ shareId: row.shareId, bytes: row.bytes, sha256: row.sha256 });
    } catch (error) { fail(res, error); }
  });
  app.delete(`${root}/artifacts/:token/:file`, async (req, res) => {
    try {
      if (!await gate(req, res, true)) return;
      const registry = deps.siteShareBackend!.registry;
      const row = (await registry.list({ site: deps.workspaceId })).find(row => row.token === req.params.token && row.file === req.params.file);
      if (!row) { res.sendStatus(404); return; }
      await registry.disable({ shareId: row.shareId, site: deps.workspaceId });
      await registry.deleteArtifact({ shareId: row.shareId });
      res.sendStatus(204);
    } catch (error) { fail(res, error); }
  });
}
