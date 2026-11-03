import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { parseSiteImportInput } from "#src/features/site-backup/import-backend";
import { SHARE_LIMITS, SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { sendAdminFailure } from "./site-share-errors.js";

type Deps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteImportBackend" | "tracker">;

/** Each import boundary reports its own step while keeping provider diagnostics private. */
function importStep({ req }: { req: Request }, _options = {}): string {
  const suffix = String(req.route?.path ?? "").split("site-imports")[1] ?? "";
  const steps: Readonly<Record<string, string>> = { "GET ": "Import history", "POST ": "Archive verification", "POST /uploads": "ZIP upload", "GET /:importId/owner": "Import owner setup", "POST /:importId/owner": "Imported site creation" };
  return steps[`${req.method} ${suffix}`] ?? "Site import";
}

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
  const fail = (res: Response, error: unknown, req: Request) => {
    const step = importStep({ req });
    if (error instanceof SiteShareRefusal) {
      res.status(error.code === "NOT_FOUND" ? 404 : 400).json({ code: error.code, message: `${step} failed: ${error.message}` });
      return;
    }
    const type = (error as { type?: string })?.type;
    const tooLarge = type === "entity.too.large";
    // Parser refusals are bad uploads; a backend failure is an internal incident, never a 400.
    const refusedUpload = ["encoding.unsupported", "entity.parse.failed", "request.aborted", "request.size.invalid"].includes(type ?? "");
    if (tooLarge || refusedUpload) {
      res.status(tooLarge ? 413 : 400).json({ code: tooLarge ? "LIMIT_EXCEEDED" : "IMPORT_FAILED",
        message: tooLarge ? `${step} failed: the request exceeds the size limit for this step.` : `${step} failed: send a complete request in the format this step accepts.` });
      return;
    }
    sendAdminFailure({ res, error, tracker: deps.tracker }, { operation: `site-import:${step}`, code: "IMPORT_FAILED", message: `${step} failed. No existing site was changed.`, field: "message" });
  };
  const gate = async (req: Request, res: Response, permission: string) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
    if (req.params.workspaceId !== deps.workspaceId) { res.status(404).json({ code: "NOT_FOUND", message: `${importStep({ req })} failed: this workspace is not available.` }); return false; }
    if (!await authorizeOrRespond(res, deps.authorize, { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission, entityType: "site-registry" })) return false;
    if (!deps.siteImportBackend) { res.status(503).json({ code: "UNAVAILABLE", message: `${importStep({ req })} requires local site creation and a configured sites home.` }); return false; }
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
    catch (error) { fail(res, error, req); }
  });
  app.post(root, async (req, res) => {
    try {
      if (!await gate(req, res, "system.write")) return;
      const input = parseSiteImportInput({ input: req.body });
      const principalId = getAuthedPrincipal(res).id;
      const imported = await deps.siteImportBackend!.importBackup({ ...input, principalId }, { signal: requestSignal(req, res) });
      res.json(imported);
    } catch (error) { fail(res, error, req); }
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
    } catch (error) { fail(res, error, req); }
  }, (req, res, next) => {
    express.raw({ type: "application/zip", limit: SHARE_LIMITS.maxArchiveBytes, inflate: false })(req, res, error => { if (error) fail(res, error, req); else next(); });
  }, async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Upload raw application/zip bytes, not a filesystem path or base64 JSON." });
      res.status(201).json(await deps.siteImportBackend!.upload({ principalId: getAuthedPrincipal(res).id, archive: req.body }));
    } catch (error) { fail(res, error, req); }
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
      const imported = deps.siteImportBackend!.get({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId) });
      res.json({ ...imported, ownerSetup: { method: "POST", field: "adminPassword", username: "admin", sessionRequired: true, ...(imported.hasEncryptedKeys ? { savedKeysPasswordField: "savedKeysPassword" } : {}) } });
    } catch (error) { fail(res, error, req); }
  });
  app.post(root + "/:importId/owner", async (req, res, next) => {
    try {
      if (!await ownerGate(req, res)) return;
      // Exact Origin prevents a sibling origin choosing a password with the owner's session.
      if (req.get("origin") !== req.protocol + "://" + req.get("host")) { res.status(403).json({ code: "FORBIDDEN", message: "Import owner setup failed: submit this form from the same signed-in Tovu site." }); return; }
      next();
    } catch (error) { fail(res, error, req); }
  }, (req, res, next) => {
    express.urlencoded({ extended: false, limit: "8kb" })(req, res, error => {
      if (error) fail(res, error, req);
      else next();
    });
  }, async (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).some(key => !["adminPassword", "savedKeysPassword"].includes(key))) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Only the new owner password and optional saved keys password are accepted." });
      res.json(await deps.siteImportBackend!.completeOwner({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId), adminPassword: req.body.adminPassword, ...(req.body.savedKeysPassword === undefined ? {} : { savedKeysPassword: req.body.savedKeysPassword }) }, { signal: requestSignal(req, res) }));
    } catch (error) { fail(res, error, req); }
  });
}
