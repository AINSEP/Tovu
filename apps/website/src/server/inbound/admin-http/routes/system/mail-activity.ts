import type { Express, Request, Response } from "express";
import { ToolInputError } from "@jini-ai/core";

import { getMailActivity, listMailActivity, MailActivityForbiddenError, MailActivityUnavailableError, readMailActivityId, readMailActivityQuery } from "#src/features/mail-status/activity";
import type { MailDeliveryToolDeps } from "#src/features/mail-status/delivery-tool-registrations";
import { readMailFeedbackSetup } from "#src/features/mail-status/feedback-setup";
import { MAIL_STATUS_PERMISSION } from "#src/features/mail-status/permissions";
import {
  listMailSuppressions, MailSuppressionsUnavailableError, planMailSuppressionRemoval, readMailSuppressionQuery, readMailSuppressionRemoval, runMailSuppressionRemoval,
} from "#src/features/mail-status/suppressions";
import { mailUseReadinessDepsFrom, readMailUseReadiness } from "#src/features/mail-status/use-readiness";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

/**
 * @file The Email page's **What uses email** and **Recent sends and failures** (email phase 4):
 * thin adapters over the operations `mail_get_readiness`, `mail_list_activity` and
 * `mail_get_activity` run (`features/mail-status/{use-readiness,activity}.ts`).
 *
 * - `GET  .../system/mail-uses` (admin.forms.manage) -> `{ checkedAt, uses: MailUseRow[] }`.
 * - `GET  .../system/mail-activity?outcome=&use=&recipient=&limit=&cursor=` (mail.activity.read
 *   for full recipients; admin.forms.manage alone gets masked rows) -> `MailActivityPage`.
 * - `GET  .../system/mail-activity/:activityId` (mail.activity.read) -> `MailActivityDetail`, 404
 *   when no such send exists here.
 *
 *
 * Phase 5 (same file, same envelopes; operations in `features/mail-status/{suppressions,feedback-setup}.ts`):
 *
 * - `GET  .../system/mail-suppressions?search=&scope=&reason=&limit=&cursor=` (mail.activity.read)
 *   -> `{ items: [{ address, scope, reason, createdAt }], nextCursor, empty }`.
 * - `POST .../system/mail-suppressions/remove` (mail.suppressions.manage) body
 *   `{ address, scope: "all"|"bulk", reason, confirmed?: true }`. Without `confirmed: true` it only
 *   previews: `{ removed: false, confirmationRequired: true, plan }` (what was blocked, why, and
 *   the warnings). With it: `{ removed, removal? }`, the reason recorded in the removal audit. Every
 *   removal is a fresh confirmation; nothing about it is remembered.
 * - `GET  .../system/mail-feedback` (admin.forms.manage) -> `MailFeedbackSetupReport`.
 *
 * 400 for malformed input, 403 without the permission, 503 when this root has no activity or
 * suppression repo.
 */
export type AdminMailActivityDeps = MailDeliveryToolDeps;

const BASE = "/api/admin/v1/workspaces/:workspaceId/system";

function forbidden(res: Response, permission: string, reason: string): void {
  res.status(403).json({ error: `not authorized for '${permission}' (${reason})`, code: "FORBIDDEN", details: { permission, reason } });
}

/** The Email page's status permission (uses, feedback setup); answers the 403 itself. */
async function statusAllowed(deps: AdminMailActivityDeps, principalId: string, res: Response): Promise<boolean> {
  const auth = await deps.authorize({ principalId, permission: MAIL_STATUS_PERMISSION, workspaceId: deps.workspaceId, entityType: "mail" });
  if (!auth.allowed) forbidden(res, MAIL_STATUS_PERMISSION, auth.reason);
  return auth.allowed;
}

/** One error ladder for every route here; anything unexpected is a 500 without its text. */
function fail(res: Response, err: unknown): void {
  if (err instanceof ToolInputError) {
    res.status(400).json({ error: err.message, code: "INVALID_INPUT" });
  } else if (err instanceof MailActivityForbiddenError) {
    forbidden(res, err.permission, "no_grant");
  } else if (err instanceof MailActivityUnavailableError || err instanceof MailSuppressionsUnavailableError) {
    res.status(503).json({ error: err.message, code: "MAIL_ACTIVITY_UNAVAILABLE" });
  } else {
    console.error("[system/mail-activity] unexpected error", err);
    res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
  }
}

function handle(deps: AdminMailActivityDeps, run: (req: Request, res: Response, principalId: string) => Promise<void>) {
  return async (req: Request, res: Response) => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      await run(req, res, getAuthedPrincipal(res).id);
    } catch (err) {
      fail(res, err);
    }
  };
}

/**
 * Register the readiness and activity routes.
 * @complexity One readiness pass or one activity read per request.
 * @example registerAdminMailActivityRoutes(app, routeDeps)
 */
export function registerAdminMailActivityRoutes(app: Express, deps: AdminMailActivityDeps): void {
  app.get(`${BASE}/mail-uses`, handle(deps, async (_req, res, principalId) => {
    if (await statusAllowed(deps, principalId, res)) res.json(await readMailUseReadiness(mailUseReadinessDepsFrom(deps)));
  }));
  app.get(`${BASE}/mail-activity`, handle(deps, async (req, res, principalId) => {
    const query = readMailActivityQuery({ input: req.query as Record<string, unknown> });
    res.json(await listMailActivity({ principalId, query }, deps));
  }));
  app.get(`${BASE}/mail-activity/:activityId`, handle(deps, async (req, res, principalId) => {
    const found = await getMailActivity({ principalId, activityId: readMailActivityId({ value: req.params.activityId }) }, deps);
    if (found) res.json(found);
    else res.status(404).json({ error: "no such email send", code: "NOT_FOUND" });
  }));
  app.get(`${BASE}/mail-suppressions`, handle(deps, async (req, res, principalId) => {
    res.json(await listMailSuppressions({ principalId, query: readMailSuppressionQuery({ input: req.query as Record<string, unknown> }) }, deps));
  }));
  app.post(`${BASE}/mail-suppressions/remove`, handle(deps, async (req, res, principalId) => {
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;
    const plan = await planMailSuppressionRemoval({ principalId, input: readMailSuppressionRemoval({ input: body }) }, deps);
    if (body.confirmed !== true) {
      res.json({ removed: false, confirmationRequired: true, plan });
      return;
    }
    res.json(await runMailSuppressionRemoval({ principalId, plan }, deps));
  }));
  app.get(`${BASE}/mail-feedback`, handle(deps, async (_req, res, principalId) => {
    if (await statusAllowed(deps, principalId, res)) res.json(await readMailFeedbackSetup(deps));
  }));
}
