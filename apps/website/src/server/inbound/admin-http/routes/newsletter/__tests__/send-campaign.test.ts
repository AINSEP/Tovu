import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createAdminNewsletterSendCampaignRoute, registerAdminNewsletterSendCampaignRoute } from "../send-campaign.js";
import { toSendPipelineDeps, type NewsletterRouteDeps } from "../deps.js";
import type { SendPipelineDeps } from "#src/features/newsletter/send-pipeline";
import type { RouteRegistrar } from "#src/server/routes/types";
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

async function buildApp(register: RouteRegistrar = registerAdminNewsletterSendCampaignRoute) {
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
  register(app, deps);
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

/**
 * A pipeline-deps builder whose Launch Gate is fully satisfied: (a) enabled, (b) a bound consent
 * seam, (c) a verified origin — (d) is the route deps' own smtp mailer. `overrides` replaces
 * top-level pipeline deps (e.g. a failing subscriber directory).
 */
function gateOpenBuilder(overrides: Partial<SendPipelineDeps> = {}) {
  return (deps: NewsletterRouteDeps): SendPipelineDeps => {
    const real = toSendPipelineDeps(deps);
    return {
      ...real,
      ...overrides,
      launchGateDeps: {
        ...real.launchGateDeps,
        isSendingEnabled: async () => true,
        consentCapability: { request: async () => ({ requested: true }) } as unknown as SendPipelineDeps["launchGateDeps"]["consentCapability"],
        originRegistry: {
          canonicalOrigin: async () => ({ scheme: "https", host: "acme.test", verifiedAt: NOW, source: "workspace-setting" }),
        } as unknown as SendPipelineDeps["launchGateDeps"]["originRegistry"],
      },
    };
  };
}

/** Polls (bounded) until the post-202 background work has settled the campaign row. */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let value = await read();
  for (let i = 0; i < 200 && !done(value); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    value = await read();
  }
  return value;
}

test("send-campaign: once the Launch Gate is met the route answers 202 with the campaign now sending, then freezes its audience", async (t) => {
  const { app, deps } = await buildApp(createAdminNewsletterSendCampaignRoute({ buildSendPipelineDeps: gateOpenBuilder() }));
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("camp-1")}`, { method: "POST" });
  assert.equal(res.status, 202);
  const body = (await res.json()) as { data: CampaignRecord };
  assert.equal(body.data.id, "camp-1");
  assert.equal(body.data.status, "sending");
  assert.equal(typeof body.data.sendStartedAt, "string");

  const after = await waitFor(
    () => deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "camp-1" }),
    (row) => row?.audienceSnapshotId != null
  );
  assert.equal(after?.status, "sending");
  assert.ok(after?.audienceSnapshotId, "freezeAudience ran after the 202 and attached a snapshot");
  const snapshot = await deps.newsletterAudienceSnapshotRepo.findById({ workspaceId: WORKSPACE_ID, id: after?.audienceSnapshotId ?? "" });
  assert.equal(snapshot?.recipientCount, 0, "list-1 has no subscribers, so the frozen audience is empty");
});

test("send-campaign: a freezeAudience failure after the 202 is logged, not turned into an error response, and leaves the campaign sending without a snapshot", async (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (message: string) => {
    logged.push(message);
  });
  const failingDirectory = {
    getContact: async () => null,
    getContacts: async () => {
      throw new Error("members directory offline");
    },
  } as unknown as SendPipelineDeps["subscriberDirectory"];
  const { app, deps } = await buildApp(
    createAdminNewsletterSendCampaignRoute({ buildSendPipelineDeps: gateOpenBuilder({ subscriberDirectory: failingDirectory }) })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PATH("camp-1")}`, { method: "POST" });
  assert.equal(res.status, 202);
  assert.equal(((await res.json()) as { data: CampaignRecord }).data.status, "sending");

  await waitFor(async () => logged.length, (count) => count > 0);
  assert.deepEqual(logged, ["freezeAudience/claimBatch failed after authorizeSend for campaign camp-1: members directory offline"]);
  const after = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "camp-1" });
  assert.equal(after?.status, "sending");
  assert.equal(after?.audienceSnapshotId, null);
});
