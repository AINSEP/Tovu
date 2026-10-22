import { randomUUID } from "node:crypto";
import type { Express, Response } from "express";
import { ToolInputError } from "@jini-ai/core";

import { planMailTestSend, readTestRecipient, runMailTestSend, type MailTestSendDeps } from "#src/features/mail-status/test-send";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file `POST /api/admin/v1/workspaces/:workspaceId/system/mail-test-send` — the Email page's
 * **Send test email** button. A thin adapter over the same operation `mail_send_test` runs
 * (`features/mail-status/test-send.ts`): same recipient rules, limiter, delivery policy and
 * truthful outcome. The person's click is the confirmation here; the assistant's tool stays
 * approval-gated by its card.
 *
 * Body: `{ to?: string, requestId?: string }`. `to` defaults to the operator's account address;
 * `requestId` (8-64 of `[A-Za-z0-9_-]`, one per click) is the idempotency key, so a retried
 * request replays the ledger's answer instead of sending twice.
 *
 * 200 `{ sent, result }` for every send outcome (accepted | captured | redirected | failed),
 * 429 for the local duplicate/rate guard, 400 for bad input, 403 without `admin.forms.manage`.
 */
export type AdminMailTestSendDeps = Pick<RouteDeps, "workspaceId" | "authorize"> & MailTestSendDeps;

const PERMISSION = "admin.forms.manage";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const LOCAL_REFUSALS = new Set(["MAIL_TEST_DUPLICATE", "MAIL_TEST_RATE_LIMITED"]);

function readRequestId(value: unknown): string {
  if (value === undefined) return randomUUID();
  if (typeof value === "string" && REQUEST_ID.test(value)) return value;
  throw new ToolInputError({ message: "requestId must be 8-64 letters, digits, '-' or '_'. Nothing was sent." });
}

function readBody(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  throw new ToolInputError({ message: "the request body must be a JSON object. Nothing was sent." });
}

async function authorized(deps: AdminMailTestSendDeps, principalId: string, res: Response): Promise<boolean> {
  const auth = await deps.authorize({ principalId, permission: PERMISSION, workspaceId: deps.workspaceId, entityType: "mail" });
  if (auth.allowed) return true;
  res.status(403).json({ error: `principal '${principalId}' is not authorized for '${PERMISSION}' (${auth.reason})`, code: "FORBIDDEN", details: { permission: PERMISSION, reason: auth.reason } });
  return false;
}

/**
 * Register the test-send route.
 * @complexity One authorization, one user lookup, one settings read and at most one delivery.
 * @example registerAdminMailTestSendRoute(app, routeDeps)
 */
export function registerAdminMailTestSendRoute(app: Express, deps: AdminMailTestSendDeps): void {
  app.post("/api/admin/v1/workspaces/:workspaceId/system/mail-test-send", async (req, res) => {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }
    try {
      const body = readBody(req.body);
      const to = readTestRecipient({ value: body.to });
      const requestId = readRequestId(body.requestId);
      const principal = getAuthedPrincipal(res);
      if (!(await authorized(deps, principal.id, res))) return;
      const plan = await planMailTestSend({ ...{ principalId: principal.id, ...(to === undefined ? {} : { to }) }, deps: deps });
      const result = await runMailTestSend({ ...{ principalId: principal.id, plan, ref: `admin:${principal.id}:${requestId}` }, deps: deps });
      const refusedLocally = result.outcome === "failed" && LOCAL_REFUSALS.has(result.errorCode);
      res.status(refusedLocally ? 429 : 200).json({ sent: result.outcome === "accepted" || result.outcome === "redirected", result });
    } catch (err) {
      if (err instanceof ToolInputError) {
        res.status(400).json({ error: err.message, code: "INVALID_INPUT" });
        return;
      }
      console.error("[system/mail-test-send] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
