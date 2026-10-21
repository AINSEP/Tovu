import type { Express, Request, Response } from "express";
import { ForbiddenError } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { getPublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";
import { CustomCredentialValidationError } from "#src/features/custom-credentials/index";
import { planSiteBackup, pushSiteBackup, type SiteBackupCall, type SiteBackupToolDeps } from "#src/features/site-backup/backup-service";

/**
 * @file The admin Git backup screen's two calls, `POST …/site-backups/plan` and `POST …/site-backups/push`.
 * Both run `backup-service.ts` — the same code path as `site_backup_plan`/`site_backup_push` — so the
 * permissions (`site-backup.push` AND `custom-credentials.write`, checked inside the service), the
 * private-repository rule and every refusal are the assistant's. A refusal answers 200 with the
 * service's own `{ planned|pushed: false, code, message }`, which the screen shows as is.
 */

/** How long one push POST waits on its job before answering progress. The screen re-posts the same
 *  planId at once, so this is the poll interval; re-posting waits on the SAME job (`push-jobs.ts`). */
export const PUSH_POLL_WAIT_MS = 1500;

/** The service's thrown errors as HTTP. Validation and permission errors carry no secret (see
 *  `tool-registrations.ts`'s model-facing rules); anything else gets a fixed line, never its text. */
function fail(res: Response, error: unknown): void {
  if (error instanceof ForbiddenError) { res.status(403).json({ code: "FORBIDDEN", message: "You do not have permission to back up this site." }); return; }
  if (error instanceof CustomCredentialValidationError || error instanceof ToolInputError) { res.status(400).json({ code: "INVALID_INPUT", message: error.message }); return; }
  res.status(500).json({ code: "BACKUP_FAILED", message: "Git backup failed. Try again." });
}

/**
 * Mounts the two routes under the admin session gate.
 * @complexity O(1) per request besides the service's own cost.
 */
export function registerAdminSiteBackupRoutes(required: { app: Express; deps: SiteBackupToolDeps }, _optional: Record<string, never> = {}): void {
  const { app, deps } = required;
  const root = "/api/admin/v1/workspaces/:workspaceId/site-backups";
  // A backup holds the whole database, so neither answer may be cached; a connected-computer
  // (publish-trust) session is refused outright, as on the share routes' admin operations.
  const gate = (req: Request, res: Response): SiteBackupCall | null => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    if (String(req.params.workspaceId) !== deps.workspaceId) { res.sendStatus(404); return null; }
    if (getPublishTrustContext(res)) { res.sendStatus(403); return null; }
    // Never aborted: a stopped wait stops the job (`push-jobs.ts`), and a closed tab must not cancel
    // a half-uploaded backup — the job finishes on its own, still one commit.
    return { input: req.body ?? {}, principal: { id: getAuthedPrincipal(res).id }, signal: new AbortController().signal };
  };
  app.post(`${root}/plan`, async (req, res) => {
    try { const call = gate(req, res); if (call) res.json(await planSiteBackup({ deps, call })); }
    catch (error) { fail(res, error); }
  });
  app.post(`${root}/push`, async (req, res) => {
    try { const call = gate(req, res); if (call) res.json(await pushSiteBackup({ deps, call }, { waitMs: PUSH_POLL_WAIT_MS })); }
    catch (error) { fail(res, error); }
  });
}
