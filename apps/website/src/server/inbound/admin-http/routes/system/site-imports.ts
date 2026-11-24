import express, { type Express, type Request, type Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { parseSiteImportInput } from "#src/features/site-backup/import-backend";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { SHARE_LIMITS } from "#src/features/site-backup/share-policy";
import { formatByteSize } from "#src/features/site-backup/sources";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import {
  importIncident, importStep as neutralImportStep, importUnavailableReply, mapImportFailure, ownerSetupBody, parseOwnerSetupBody,
  uploadBusyReply, workspaceUnavailableReply,
  type SiteImportFailureCollaborators, type SiteImportReply,
} from "@jini-ai/cms/admin-http/routes/system/site-imports";

type Deps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteImportBackend" | "tracker">;

/** Express adapter over the framework-neutral step lookup: the matched route path and method. */
function importStep({ req }: { req: Request }, _options = {}): string {
  return neutralImportStep({ method: req.method, routePath: String(req.route?.path ?? "") });
}

/** The host's refusal class and byte formatter, injected into the neutral failure mapping. */
const failureCollaborators: SiteImportFailureCollaborators = {
  asRefusal: ({ error }) => (error instanceof SiteShareRefusal ? error : undefined),
  formatByteSize,
};

function reply(res: Response, { status, body }: SiteImportReply): void {
  res.status(status).json(body);
}

/** Upload stall limits: a whole-upload deadline and a per-socket idle timeout, either of which
 * destroys the request so a stalled client cannot hold the single upload lane. */
const UPLOAD_DEADLINE_MS = 120_000;
const UPLOAD_IDLE_MS = 30_000;

function requestSignal(req: Request, res: Response) {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  return controller.signal;
}

/** What each import route registrar needs: the app, deps, mount path and the shared guards. */
interface ImportRouteContext {
  app: Express;
  deps: Deps;
  root: string;
  fail: (res: Response, error: unknown, req: Request) => void;
  gate: (req: Request, res: Response, permission: string) => Promise<false | NonNullable<Deps["siteImportBackend"]>>;
  ownerGate: (req: Request, res: Response) => Promise<false | NonNullable<Deps["siteImportBackend"]>>;
}

/** Maps a failed import step onto its HTTP answer: refusals and parser errors are 4xx, anything else is an incident. */
function importFailure(input: { deps: Deps; req: Request; res: Response; error: unknown }): void {
  const { deps, req, res, error } = input;
  const step = importStep({ req });
  const mapped = mapImportFailure({ step, error, collaborators: failureCollaborators });
  if (mapped) { reply(res, mapped); return; }
  sendAdminFailure({ res, error, tracker: deps.tracker }, importIncident({ step }));
}

/** Common headers, workspace match, authorization and backend-availability gate; returns the backend or `false` after answering. */
async function gateImport(input: { deps: Deps; req: Request; res: Response; permission: string }) {
  const { deps, req, res, permission } = input;
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
  if (req.params.workspaceId !== deps.workspaceId) { reply(res, workspaceUnavailableReply({ step: importStep({ req }) })); return false; }
  if (!await authorizeOrRespond({ res, authorize: deps.authorize, params: { principalId: getAuthedPrincipal(res).id, workspaceId: deps.workspaceId, permission, entityType: "site-registry" } })) return false;
  if (!deps.siteImportBackend) { reply(res, importUnavailableReply({ step: importStep({ req }) })); return false; }
  return deps.siteImportBackend;
}

/** Owner-setup gate: a signed-in session only, then the normal write gate and an existing-import check. */
async function gateImportOwner(input: { ctx: Pick<ImportRouteContext, "deps" | "gate">; req: Request; res: Response }) {
  const { ctx, req, res } = input;
  const { gate } = ctx;
  if (!rejectUnlessSessionCredential({ res, message: "Open owner setup in your signed-in browser; passwords are never submitted through an agent tool.", permission: "system.write" })) return false;
  const backend = await gate(req, res, "system.write");
  if (!backend) return false;
  backend.get({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId) });
  return backend;
}

function registerListAndImportRoutes({ app, root, fail, gate }: ImportRouteContext, _options = {}): void {
  app.get(root, async (req, res) => {
    try { const backend = await gate(req, res, "system.read"); if (backend) res.json({ imports: await backend.list({ principalId: getAuthedPrincipal(res).id }) }); }
    catch (error) { fail(res, error, req); }
  });
  app.post(root, async (req, res) => {
    try {
      const backend = await gate(req, res, "system.write");
      if (!backend) return;
      const input = parseSiteImportInput({ input: req.body });
      const principalId = getAuthedPrincipal(res).id;
      const imported = await backend.importBackup({ ...input, principalId }, { signal: requestSignal(req, res) });
      res.json(imported);
    } catch (error) { fail(res, error, req); }
  });
}

function registerUploadRoute({ app, deps, root, fail, gate }: ImportRouteContext, { uploadDeadlineMs, uploadIdleMs }: { uploadDeadlineMs: number; uploadIdleMs: number }): void {
  let uploadBusy = false;
  app.post(root + "/uploads", async (req, res, next) => {
    try {
      if (!await gate(req, res, "system.write")) return;
      if (uploadBusy) { reply(res, uploadBusyReply()); return; }
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
      const backend = deps.siteImportBackend;
      if (!backend) throw new Error("site import ZIP upload has no import backend");
      res.status(201).json(await backend.upload({ principalId: getAuthedPrincipal(res).id, archive: req.body }));
    } catch (error) { fail(res, error, req); }
  });
}

function registerOwnerRoutes({ app, deps, root, fail, ownerGate }: ImportRouteContext, _options = {}): void {
  app.get(root + "/:importId/owner", async (req, res) => {
    try {
      const backend = await ownerGate(req, res);
      if (!backend) return;
      const imported = backend.get({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId) });
      res.json(ownerSetupBody({ imported }));
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
      const parsed = parseOwnerSetupBody({ body: req.body });
      if ("refusal" in parsed) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: parsed.refusal });
      const backend = deps.siteImportBackend;
      if (!backend) throw new Error("site import owner setup has no import backend");
      res.json(await backend.completeOwner({ principalId: getAuthedPrincipal(res).id, importId: String(req.params.importId), ...parsed.input }, { signal: requestSignal(req, res) }));
    } catch (error) { fail(res, error, req); }
  });
}

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
  const context: ImportRouteContext = {
    app,
    deps,
    root: "/api/admin/v1/workspaces/:workspaceId/site-imports",
    fail: (res, error, req) => importFailure({ deps, req, res, error }),
    gate: (req, res, permission) => gateImport({ deps, req, res, permission }),
    ownerGate: (req, res) => gateImportOwner({ ctx: context, req, res }),
  };
  registerListAndImportRoutes(context);
  registerUploadRoute(context, { uploadDeadlineMs, uploadIdleMs });
  registerOwnerRoutes(context);
}
