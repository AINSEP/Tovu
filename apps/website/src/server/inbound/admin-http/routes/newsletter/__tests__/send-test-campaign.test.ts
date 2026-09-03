import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import {
  createCapturingResponse,
  extractRouteHandler,
  startTestServer,
} from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminNewsletterSendTestCampaignRoute } from "../send-test-campaign.js";
import type { NewsletterRouteDeps } from "../deps.js";
import type { CampaignRecord } from "#src/features/newsletter/index";
import type { MailerPort } from "#src/platform/mail/index";

/**
 * @file Route-level tests for `SEND_TEST_CAMPAIGN` (`POST .../campaigns/:id/send-test`,
 * api.spec.md §1/§4/§5, REQ-20).
 *
 * The one thing this route MUST get right: a test send only ever reaches the caller-supplied
 * `testAddresses` — it must never touch the real subscriber list, the send ledger, or the audience
 * snapshot (AC-26). Every test below that exercises a real send asserts this by checking that no
 * `newsletterSendRepo`/`newsletterAudienceSnapshotRepo` rows were created, alongside the addresses
 * the mailer double actually received.
 */

const WORKSPACE_ID = "workspace-local";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  const now = new Date().toISOString();
  return {
    id: "camp-1",
    workspaceId: WORKSPACE_ID,
    status: "draft",
    subject: "Summer Newsletter",
    preheader: "Check out what's new",
    fromName: "Acme",
    fromEmail: "newsletter@acme.test",
    replyTo: "help@acme.test",
    listId: "list-1",
    scheduledAt: null,
    sendStartedAt: null,
    audienceSnapshotId: null,
    counters: { recipients: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, unsubscribed: 0 },
    version: 1,
    createdByPrincipal: "test-principal",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** A `MailerPort` double whose `capabilities().driver` is production-capable (`smtp`), so the
 *  Launch Readiness Gate's precondition (d) is met — the default `ConsoleMailerAdapter` this repo's
 *  hermetic `createRouteDeps()` wires is deliberately NOT production-capable (see `deps.ts`'s
 *  `toSendPipelineDeps` doc), so a real test-send success path needs this override. */
function makeMailer(sendImpl?: (email: string) => { ok: true; providerMessageId: string; acceptedAt: string } | { ok: false; retryable: boolean; errorCode: string; message: string }): MailerPort & { sentTo: string[] } {
  const sentTo: string[] = [];
  return {
    capabilities: () => ({
      driver: "smtp",
      supportsIdempotencyKey: true,
      supportsWebhookFeedback: true,
      maxBatchSize: 100,
      supportsAttachments: false,
    }),
    async send(message) {
      sentTo.push(message.to.email);
      if (sendImpl) return sendImpl(message.to.email);
      return { ok: true, providerMessageId: `pm-${sentTo.length}`, acceptedAt: new Date().toISOString() };
    },
    async sendBatch() {
      return [];
    },
    sentTo,
  } as MailerPort & { sentTo: string[] };
}

function buildApp(depsOverrides: Partial<NewsletterRouteDeps> = {}): {
  app: express.Express;
  deps: NewsletterRouteDeps;
} {
  const base = createRouteDeps();
  const deps = {
    ...base,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    ...depsOverrides,
  } as unknown as NewsletterRouteDeps;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminNewsletterSendTestCampaignRoute(app, deps);
  return { app, deps };
}

async function post(t: import("node:test").TestContext, app: express.Express, path: string, body: unknown) {
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test("send-test-campaign: mismatched workspaceId 404s (checked before body validation and auth)", async (t) => {
  const { app } = buildApp();
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/other-ws/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["a@test.com"],
  });
  assert.equal(status, 404);
  assert.deepEqual(json, { error: "workspace was not found" });
});

test("send-test-campaign: testAddresses must be an array of strings — not-an-array and mixed-type array are both 400", async (t) => {
  const { app } = buildApp();

  const notArray = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: "a@test.com",
  });
  assert.equal(notArray.status, 400);
  assert.deepEqual(notArray.json, { error: "testAddresses must be an array of email strings", code: "VALIDATION_ERROR" });

  const mixed = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["a@test.com", 12345],
  });
  assert.equal(mixed.status, 400);
  assert.deepEqual(mixed.json, { error: "testAddresses must be an array of email strings", code: "VALIDATION_ERROR" });
});

test("send-test-campaign: missing body ('req.body ?? {}') is also 400 for testAddresses, not a 500", async (t) => {
  const { app } = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    method: "POST",
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "testAddresses must be an array of email strings", code: "VALIDATION_ERROR" });
});

test("send-test-campaign: forbidden 403s when unauthorized, before the campaign is even looked up", async (t) => {
  const { app } = buildApp({ authorize: async () => ({ allowed: false, reason: "insufficient role" }) });
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["a@test.com"],
  });
  assert.equal(status, 403);
  assert.equal((json as { code?: string }).code, "FORBIDDEN");
  assert.equal((json as { details?: { reason?: string } }).details?.reason, "insufficient role");
});

test("send-test-campaign: unknown campaign returns 404 NEWSLETTER_CAMPAIGN_NOT_FOUND", async (t) => {
  const { app } = buildApp({ mailer: makeMailer() });
  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/does-not-exist/send-test`, {
    testAddresses: ["a@test.com"],
  });
  assert.equal(status, 404);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});

test("send-test-campaign: address-count bound (1-10, REQ-20) is enforced -- 0 and 11 are both 400 NEWSLETTER_VALIDATION_ERROR", async (t) => {
  const { app, deps } = buildApp({ mailer: makeMailer() });
  await deps.newsletterCampaignRepo.saveCampaignRow(makeCampaign());

  const zero = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: [],
  });
  assert.equal(zero.status, 400);
  assert.equal((zero.json as { code?: string }).code, "NEWSLETTER_VALIDATION_ERROR");

  const eleven = Array.from({ length: 11 }, (_, i) => `t${i}@test.com`);
  const overMax = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: eleven,
  });
  assert.equal(overMax.status, 400);
  assert.equal((overMax.json as { code?: string }).code, "NEWSLETTER_VALIDATION_ERROR");
});

test("send-test-campaign: the Launch Readiness Gate's mailer precondition still applies to a test send (EC-10) -- console/memory driver is blocked", async (t) => {
  const { app, deps } = buildApp(); // default hermetic mailer is NOT production-capable
  await deps.newsletterCampaignRepo.saveCampaignRow(makeCampaign());

  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["a@test.com"],
  });
  assert.equal(status, 409);
  assert.equal((json as { code?: string }).code, "NEWSLETTER_LAUNCH_GATE_BLOCKED");
  assert.deepEqual((json as { details?: { unmetPreconditions?: string[] } }).details?.unmetPreconditions, [
    "mailer_adapter_not_production",
  ]);
});

test("send-test-campaign: a real send only reaches the given testAddresses -- no send-ledger or audience-snapshot rows are created (AC-26)", async (t) => {
  const mailer = makeMailer();
  const { app, deps } = buildApp({ mailer });
  await deps.newsletterCampaignRepo.saveCampaignRow(makeCampaign());
  // A real subscriber exists on the campaign's list -- proving the test send does NOT reach them.
  const now = new Date().toISOString();
  await deps.newsletterSubscriptionRepo.save({
    id: "sub-real-1",
    workspaceId: WORKSPACE_ID,
    listId: "list-1",
    subscriberId: "subscriber-real-1",
    status: "subscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: now,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["tester1@test.com", "tester2@test.com"],
  });
  assert.equal(status, 200);
  const body = json as { data: { results: Array<{ address: string; ok: boolean; errorCode: string | null }> } };
  assert.deepEqual(
    body.data.results.map((r) => r.address),
    ["tester1@test.com", "tester2@test.com"]
  );
  assert.ok(body.data.results.every((r) => r.ok === true && r.errorCode === null));

  // The mailer double only ever saw the two test addresses -- the real subscriber's address was
  // never even constructed, let alone sent to.
  assert.deepEqual(mailer.sentTo, ["tester1@test.com", "tester2@test.com"]);

  const sendRows = await deps.newsletterSendRepo.listByCampaign({ workspaceId: WORKSPACE_ID, campaignId: "camp-1", limit: 100 });
  assert.deepEqual(sendRows, []);
  const stored = await deps.newsletterCampaignRepo.findById({ workspaceId: WORKSPACE_ID, id: "camp-1" });
  assert.equal(stored?.audienceSnapshotId, null, "a test send must never mint an audience snapshot");
  assert.equal(stored?.status, "draft", "a test send must never transition campaign status");
});

test("send-test-campaign: a per-address mailer failure is reported with ok:false and the errorCode, without failing the whole request", async (t) => {
  const mailer = makeMailer((email) =>
    email === "bad@test.com"
      ? { ok: false, retryable: false, errorCode: "invalid_recipient", message: "rejected by provider" }
      : { ok: true, providerMessageId: "pm-good", acceptedAt: new Date().toISOString() }
  );
  const { app, deps } = buildApp({ mailer });
  await deps.newsletterCampaignRepo.saveCampaignRow(makeCampaign());

  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["good@test.com", "bad@test.com"],
  });
  assert.equal(status, 200);
  const body = json as { data: { results: Array<{ address: string; ok: boolean; errorCode: string | null }> } };
  assert.deepEqual(body.data.results, [
    { address: "good@test.com", ok: true, errorCode: null },
    { address: "bad@test.com", ok: false, errorCode: "rejected by provider" },
  ]);
});

test("send-test-campaign: a failed send with no provider message still yields a non-null errorCode (defensive '?? null' fallback, not reachable through the real MailerPort contract)", async (t) => {
  // `MailerPort.send()`'s failure shape always carries a `message: string` (see `platform/mail`'s
  // port contract) -- this route's `r.error ?? null` guards a value that can never actually be
  // nullish through any real adapter. Exercised directly with a non-compliant double, the same
  // "keep the defensive fallback, exercise it deliberately" convention this repo already uses for
  // `req.params.x ?? ""`.
  const mailer = makeMailer(() => ({ ok: false, retryable: false, errorCode: "unknown", message: undefined as unknown as string }));
  const { app, deps } = buildApp({ mailer });
  await deps.newsletterCampaignRepo.saveCampaignRow(makeCampaign());

  const { status, json } = await post(t, app, `/api/admin/v1/workspaces/${WORKSPACE_ID}/newsletter/campaigns/camp-1/send-test`, {
    testAddresses: ["a@test.com"],
  });
  assert.equal(status, 200);
  const body = json as { data: { results: Array<{ address: string; ok: boolean; errorCode: string | null }> } };
  assert.deepEqual(body.data.results, [{ address: "a@test.com", ok: false, errorCode: null }]);
});

test("send-test-campaign: undefined workspaceId fallback via direct handler invocation", async () => {
  const { app } = buildApp();
  const handler = extractRouteHandler(
    app,
    "post",
    "/api/admin/v1/workspaces/:workspaceId/newsletter/campaigns/:id/send-test"
  );

  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined, id: "camp-1" }, body: { testAddresses: ["a@test.com"] } } as unknown as Parameters<typeof handler>[0];
  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});
