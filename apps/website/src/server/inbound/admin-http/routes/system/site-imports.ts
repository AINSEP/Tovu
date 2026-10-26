import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { parseSiteImportInput } from "#src/features/site-backup/import-backend";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";

type Deps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteImportBackend" | "tracker">;

/** Upload stall limits: a whole-upload deadline and a per-socket idle timeout, either of which
 * destroys the request so a stalled client cannot hold the single upload lane. */
const UPLOAD_DEADLINE_MS = 120_000;
const UPLOAD_IDLE_MS = 30_000;

/** Authenticated uploads/history and principal-bound password setup, shared with tools.
 * GET returns the setup contract for the separately-owned UI; no source markup enters admin.
 * `uploadDeadlineMs`/`uploadIdleMs` default to the production stall limits; tests shorten them.
 * @complexity O(body bytes), bounded raw parsing AFTER authorization and concurrency admission.
 */
export function registerAdminSiteImportRoutes(
  required: { app: Express; deps: Deps },
  { uploadDeadlineMs = UPLOAD_DEADLINE_MS, uploadIdleMs = UPLOAD_IDLE_MS }: { uploadDeadlineMs?: number; uploadIdleMs?: number } = {},
): void {
  const { app, deps } = required;
  const root = "/api/admin/v1/workspaces/:workspaceId/site-imports";
  let uploadBusy = false;
  const fail = (res: Response, error: unknown) => {
    const known = error instanceof SiteShareRefusal;
    const tooLarge = (error as { type?: string })?.type === "entity.too.large";
    res.status(known && error.code === "NOT_FOUND" ? 404 : tooLarge ? 413 : 400).json({ code: known ? error.code : tooLarge ? "LIMIT_EXCEEDED" : "IMPORT_FAILED", message: known ? error.message : tooLarge ? "ZIP upload exceeds the v1 300 MiB cap." : "Import operation failed. No existing site was changed." });
  };
  const gate = async (req: Request, res: Response, permission: string) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    if (req.params.workspaceId !== deps.workspaceId) { res.sendStatus(404); return false; }
    if (!await authorizeOrRespond(res, deps.authorize, { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission, entityType: "site-registry" })) return false;
    if (!deps.siteImportBackend) { res.status(503).json({ code: "UNAVAILABLE", message: "Import requires local site creation and a configured sites home." }); return false; }
    return true;
  };
  const requestSignal = (req: Request, res: Response) => {
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    res.once("close", () => { if (!res.writableEnded) controller.abort(); });
    return controller.signal;
  };
  app.get(root, async (req, res) => {
    try { if (await gate(req, res, "system.read")) res.json({ imports: await deps.siteImportBackend!.list({ principalId: getAuthedPrincipal(res).id }) }); }
    catch (error) { fail(res, error); }
  });
  app.post(root, async (req, res) => {
    try {
      if (!await gate(req, res, "system.write")) return;
      const input = parseSiteImportInput({ input: req.body });
      const principalId = getAuthedPrincipal(res).id;
      const imported = await deps.siteImportBackend!.importBackup({ ...input, principalId }, { signal: requestSignal(req, res) });
      res.json(imported);
    } catch (error) { fail(res, error); }
  });
  app.post(root + "/uploads", async (req, res, next) => {
    try {
      if (!await gate(req, res, "system.write")) return;
      if (uploadBusy) { res.status(409).json({ code: "BUSY", message: "Another ZIP upload is running." }); return; }
      uploadBusy = true;
      const deadline = setTimeout(() => req.destroy(), uploadDeadlineMs);
      deadline.unref();
      req.setTimeout(uploadIdleMs, () => req.destroy());
      res.once("close", () => { clearTimeout(deadline); uploadBusy = false; });
      next();
    } catch (error) { fail(res, error); }
  }, (req, res, next) => {
    express.raw({ type: "application/zip", limit: SHARE_LIMITS.maxArchiveBytes, inflate: false })(req, res, error => { if (error) fail(res, error); else next(); });
  }, async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Upload raw application/zip bytes, not a filesystem path or base64 JSON." });
      res.status(201).json(await deps.siteImportBackend!.upload({ principalId: getAuthedPrincipal(res).id, archive: req.body }));
    } catch (error) { fail(res, error); }
  });
  const ownerGate = async (req: Request, res: Response) => {
    if (!rejectUnlessSessionCredential(res, { message: "Open owner setup in your signed-in browser; passwords are never submitted through an agent tool.", permission: "system.write" })) return false;
    if (!await gate(req, res, "system.write")) return false;
    deps.siteImportBackend!.get({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId) });
    return true;
  };
  app.get(root + "/:importId/owner", async (req, res) => {
    try {
      if (!await ownerGate(req, res)) return;
      res.json({ ...deps.siteImportBackend!.get({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId) }), ownerSetup: { method: "POST", field: "adminPassword", username: "admin", sessionRequired: true } });
    } catch (error) { fail(res, error); }
  });
  app.post(root + "/:importId/owner", async (req, res, next) => {
    try {
      if (!await ownerGate(req, res)) return;
      // Exact Origin prevents a sibling origin choosing a password with the owner's session.
      if (req.get("origin") !== req.protocol + "://" + req.get("host")) { res.sendStatus(403); return; }
      next();
    } catch (error) { fail(res, error); }
  }, express.urlencoded({ extended: false, limit: "8kb" }), async (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).some(key => key !== "adminPassword")) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Only the new owner password is accepted." });
      res.json(await deps.siteImportBackend!.completeOwner({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId), adminPassword: req.body.adminPassword }, { signal: requestSignal(req, res) }));
    } catch (error) { fail(res, error); }
  });
}
