import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterSendCampaignRoute } from "../send-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord } from "#src/features/newsletter/types";
import type { MailerPort } from "#src/platform/mail/index";

/**
 * @file Route-level tests for `SEND_CAMPAIGN` (`POST .../newsletter/campaigns/:id/send`).
 *
 * The 202 path cannot be reached from this route today: `deps.ts`'s `toSendPipelineDeps` hard-wires
 * `isSendingEnabled: async () => false`, so the Launch Gate's precondition (a) is always unmet even
 * with a production-capable mailer. What IS reachable, and asserted here, is that a blocked send is
 * a 409 that leaves the campaign exactly as it was — no status flip, no audience frozen — and that
 * an unknown id is a 404 rather than a gate answer.
 */

const WORKSPACE_ID = "workspace-local";
const NOW = "2026-09-01T00:00:00.000Z";
const PATH = (id: string) => `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/${id}/send`;

function campaign(): CampaignRecord {
  return {
    id: "camp-1",
    workspaceId: WORKSPACE_ID,
    status: "scheduled",
    subject: "Autumn",
    preheader: null,
    fromName: "Acme",
    fromEmail: "news@acme.test",
    replyTo: "help@acme.test",
    listId: "list-1",
    scheduledAt: NOW,
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 3,
    createdByPrincipal: "test-principal",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const smtpMailer = {
  capabilities: () => ({
    driver: "smtp",
    supportsIdempotencyKey: true,
    supportsWebhookFeedback: true,
    maxBatchSize: 100,
    supportsAttachments: false,
  }),
  async send() {
    throw new Error("a blocked send must never reach the mailer");
  },
  async sendBatch() {
    throw new Error("a blocked send must never reach the mailer");
  },
} as unknown as MailerPort;

async function buildApp() {
  const base = createRouteDeps();
  const deps = {
    ...base,
    mailer: smtpMailer,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as NewsletterRouteDeps;
  await deps.newsletterReady;
  await deps.newsletterCampaignRepo.saveCampaignRow(campaign());

  const app = express();
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterSendCampaignRoute(app, deps);
  return { app, deps };
}

test("send-campaign: with a production mailer the gate still blocks on sending_enabled_false, and the campaign is left untouched", async (t) => {
  const { app, deps } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("camp-1")}`, { method: "POST" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; details: { unmetPreconditions: string[] } };
  assert.equal(body.code, "NEWSLETTER_LAUNCH_GATE_BLOCKED");
  assert.ok(body.details.unmetPreconditions.includes("sending_enabled_false"));
  assert.ok(!body.details.unmetPreconditions.includes("mailer_adapter_not_production"));

  const after = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "camp-1" });
  assert.equal(after?.status, "scheduled");
  assert.equal(after?.sendStartedAt, null);
  assert.equal(after?.audienceSnapshotId, null);
  assert.equal(after?.version, 3);
});

test("send-campaign: an unknown campaign id is 404 NEWSLETTER_CAMPAIGN_NOT_FOUND, not a gate answer", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("does-not-exist")}`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("send-campaign: a workspace id that is not this site's is 404", async (t) => {
  const { app } = await buildApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1/send`, { method: "POST" });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});
