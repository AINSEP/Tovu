import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { createNewsletterModule } from "../../runtime/composition/modules/newsletter.js";
import type { NewsletterRouteDeps } from "../../routes/admin/newsletter/deps.js";
import type { NewsletterPublicRouteDeps } from "../../routes/site/newsletter-deps.js";

/**
 * @file SPEC-011 (Newsletter) Stage 5 — route-level happy-path integration tests for each route
 * group (campaigns, lists, subscriptions), against the REAL SQLite adapter
 * (`createSqliteRouteDeps(":memory:")`, `server/deps.ts`), mirroring `settings-principal-check.
 * test.ts`'s real-SQLite pattern and `admin-widgets-routes.test.ts`'s create -> read -> mutate flow
 * shape. Domain-layer edge cases are already covered by `src/newsletter/__tests__/**`'s 83 tests —
 * these focus on HTTP wiring across the real chokepoints end to end.
 *
 * `SEND_CAMPAIGN`/`SEND_TEST_CAMPAIGN` are exercised for their REAL, CURRENT, by-design outcome:
 * `409 NEWSLETTER_LAUNCH_GATE_BLOCKED`. No real `MailerPort` adapter exists anywhere in this repo
 * (tasks.md's disclosed "Real Sending Is Inherently Blocked Today" flag) — `evaluateLaunchGate`'s
 * precondition (d) (mailer adapter driver) is permanently unmet, so an actual full/test send can
 * never succeed in this composition. That 409 is this feature working as designed, not a gap in
 * this test file or the routes it exercises.
 */
function buildTestApp(): { app: express.Express; deps: NewsletterRouteDeps } {
  const deps = createSqliteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  const publicDeps: NewsletterPublicRouteDeps = {
    workspaceId: deps.workspaceId,
    newsletterReady: deps.newsletterReady,
    newsletterConfirmationTokenRepo: deps.newsletterConfirmationTokenRepo,
    newsletterSubscriptionRepo: deps.newsletterSubscriptionRepo,
    newsletterKeyring: deps.newsletterKeyring,
    mailer: deps.mailer,
    membersConsentCapability: deps.membersConsentCapability,
    originRegistry: deps.originRegistry,
    clock: deps.clock,
    idGen: deps.idGen,
  };
  createNewsletterModule({ admin: deps, public: publicDeps }).registerRoutes?.(app);
  return { app, deps };
}

const BASE = (workspaceId: string) => `/api/admin/v1/workspaces/${workspaceId}/newsletter`;

test("campaigns: create -> get -> list -> update -> schedule -> send/send-test correctly blocked by the Launch Gate -> cancel", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.newsletterReady;
  const base = BASE(deps.workspaceId);

  const listRes = await fetch(`${baseUrl}${base}/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Campaign fixture list", slug: "campaign-fixture-list" }),
  });
  assert.equal(listRes.status, 201, await listRes.clone().text());
  const { data: list } = (await listRes.json()) as { data: { id: string } };

  const createRes = await fetch(`${baseUrl}${base}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      subject: "Original subject",
      preheader: "A preheader",
      fromName: "Sender Name",
      fromEmail: "sender@example.com",
      replyTo: "reply@example.com",
      listId: list.id,
      bodyJson: { type: "doc", content: [] },
    }),
  });
  assert.equal(createRes.status, 201, await createRes.clone().text());
  const created = (await createRes.json()) as { data: { id: string; status: string; version: number; subject: string } };
  assert.equal(created.data.status, "draft");
  assert.equal(created.data.version, 1);
  const campaignId = created.data.id;

  const getRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}`, { headers: { cookie } });
  assert.equal(getRes.status, 200);
  const got = (await getRes.json()) as { data: { subject: string } };
  assert.equal(got.data.subject, "Original subject");

  const listCampaignsRes = await fetch(`${baseUrl}${base}/campaigns`, { headers: { cookie } });
  assert.equal(listCampaignsRes.status, 200);
  const listedCampaigns = (await listCampaignsRes.json()) as { data: Array<{ id: string }> };
  assert.ok(listedCampaigns.data.some((c) => c.id === campaignId));

  const updateRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ subject: "Updated subject" }),
  });
  assert.equal(updateRes.status, 200, await updateRes.clone().text());
  const updated = (await updateRes.json()) as { data: { subject: string; fromEmail: string; version: number } };
  assert.equal(updated.data.subject, "Updated subject");
  assert.equal(updated.data.fromEmail, "sender@example.com", "an omitted PATCH field keeps its prior value");
  assert.equal(updated.data.version, 2);

  const scheduleRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({}),
  });
  assert.equal(scheduleRes.status, 200, await scheduleRes.clone().text());
  const scheduled = (await scheduleRes.json()) as { data: { status: string; scheduledAt: string | null } };
  assert.equal(scheduled.data.status, "scheduled");
  assert.ok(scheduled.data.scheduledAt);

  const sendRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}/send`, { method: "POST", headers: { cookie } });
  assert.equal(sendRes.status, 409, await sendRes.clone().text());
  const sendBody = (await sendRes.json()) as { code: string; details: { unmetPreconditions: string[] } };
  assert.equal(sendBody.code, "NEWSLETTER_LAUNCH_GATE_BLOCKED");
  assert.ok(sendBody.details.unmetPreconditions.includes("mailer_adapter_not_production"));

  const sendTestRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}/send-test`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ testAddresses: ["reader@example.com"] }),
  });
  assert.equal(sendTestRes.status, 409, await sendTestRes.clone().text());
  const sendTestBody = (await sendTestRes.json()) as { code: string; details: { unmetPreconditions: string[] } };
  assert.equal(sendTestBody.code, "NEWSLETTER_LAUNCH_GATE_BLOCKED");
  assert.deepEqual(
    sendTestBody.details.unmetPreconditions,
    ["mailer_adapter_not_production"],
    "a test send waives (a)/(b) — only (d) is unmet here since the dev-capability origin resolves"
  );

  const cancelRes = await fetch(`${baseUrl}${base}/campaigns/${campaignId}/cancel`, { method: "POST", headers: { cookie } });
  assert.equal(cancelRes.status, 200, await cancelRes.clone().text());
  const canceled = (await cancelRes.json()) as { data: { status: string } };
  assert.equal(canceled.data.status, "canceled");
});

test("lists: create -> list (includes the seeded default) -> archive -> default list archive is protected 409", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.newsletterReady;
  const base = BASE(deps.workspaceId);

  const createRes = await fetch(`${baseUrl}${base}/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Promotions", slug: "promotions" }),
  });
  assert.equal(createRes.status, 201, await createRes.clone().text());
  const created = (await createRes.json()) as { data: { id: string; isDefault: boolean } };
  assert.equal(created.data.isDefault, false);

  const listRes = await fetch(`${baseUrl}${base}/lists`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { data: Array<{ id: string; isDefault: boolean }> };
  assert.ok(listed.data.some((l) => l.id === created.data.id));
  const defaultList = listed.data.find((l) => l.isDefault);
  assert.ok(defaultList, "T030 seeds exactly one default list per workspace at boot");
  const defaultListId = defaultList?.id ?? "";

  const archiveRes = await fetch(`${baseUrl}${base}/lists/${created.data.id}/archive`, { method: "POST", headers: { cookie } });
  assert.equal(archiveRes.status, 200, await archiveRes.clone().text());
  const archived = (await archiveRes.json()) as { data: { status: string } };
  assert.equal(archived.data.status, "archived");

  const protectedRes = await fetch(`${baseUrl}${base}/lists/${defaultListId}/archive`, { method: "POST", headers: { cookie } });
  assert.equal(protectedRes.status, 409, await protectedRes.clone().text());
  const protectedBody = (await protectedRes.json()) as { code: string };
  assert.equal(protectedBody.code, "NEWSLETTER_DEFAULT_LIST_PROTECTED");
});

test("subscriptions: create -> list -> import (partial success, 207) -> remove -> resend-confirmation", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.newsletterReady;
  const base = BASE(deps.workspaceId);

  const listRes = await fetch(`${baseUrl}${base}/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Subscribers fixture list", slug: "subscribers-fixture-list" }),
  });
  const { data: list } = (await listRes.json()) as { data: { id: string } };

  const memberId = deps.idGen.newId();
  await deps.memberRepo.save({
    id: memberId,
    workspaceId: deps.workspaceId,
    email: `real-subscriber-${memberId}@example.com`,
    status: "active",
    emailVerifiedAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const createSubRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ subscriberId: memberId }),
  });
  assert.equal(createSubRes.status, 201, await createSubRes.clone().text());
  const createdSub = (await createSubRes.json()) as { data: { id: string; status: string; subscriberId: string } };
  assert.equal(createdSub.data.status, "pending");
  assert.equal(createdSub.data.subscriberId, memberId);

  const listSubsRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions`, { headers: { cookie } });
  assert.equal(listSubsRes.status, 200);
  const listedSubs = (await listSubsRes.json()) as { data: Array<{ id: string }> };
  assert.ok(listedSubs.data.some((s) => s.id === createdSub.data.id));

  const secondMemberId = deps.idGen.newId();
  await deps.memberRepo.save({
    id: secondMemberId,
    workspaceId: deps.workspaceId,
    email: `real-subscriber-2-${secondMemberId}@example.com`,
    status: "active",
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });
  const importRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions/import`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ subscribers: [{ subscriberId: secondMemberId }, { subscriberId: "does-not-exist" }] }),
  });
  assert.equal(importRes.status, 207, await importRes.clone().text());
  const imported = (await importRes.json()) as { created: unknown[]; failed: Array<{ code: string }> };
  assert.equal(imported.created.length, 1);
  assert.equal(imported.failed.length, 1);
  assert.equal(imported.failed[0].code, "NEWSLETTER_SUBSCRIBER_NOT_FOUND");

  const resendRes = await fetch(`${baseUrl}${base}/subscriptions/${createdSub.data.id}/resend-confirmation`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(resendRes.status, 200, await resendRes.clone().text());
  assert.deepEqual(await resendRes.json(), { delivered: true });

  const removeRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions/${createdSub.data.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(removeRes.status, 200, await removeRes.clone().text());
  const removed = (await removeRes.json()) as { data: { status: string; unsubscribedAt: string | null } };
  assert.equal(removed.data.status, "unsubscribed");
  assert.ok(removed.data.unsubscribedAt);

  // Idempotent repeat.
  const removeAgainRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions/${createdSub.data.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(removeAgainRes.status, 200);
  const removedAgain = (await removeAgainRes.json()) as { data: { status: string } };
  assert.equal(removedAgain.data.status, "unsubscribed");
});

test("send-log: an empty (never-sent) campaign's send log is a 200 empty array, not a 404/500", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.newsletterReady;
  const base = BASE(deps.workspaceId);

  const listRes = await fetch(`${baseUrl}${base}/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Send log fixture list", slug: "send-log-fixture-list" }),
  });
  const { data: list } = (await listRes.json()) as { data: { id: string } };
  const createRes = await fetch(`${baseUrl}${base}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      subject: "Send-log fixture",
      fromName: "Sender",
      fromEmail: "sender@example.com",
      replyTo: "reply@example.com",
      listId: list.id,
      bodyJson: {},
    }),
  });
  const { data: campaign } = (await createRes.json()) as { data: { id: string } };

  const sendLogRes = await fetch(`${baseUrl}${base}/campaigns/${campaign.id}/sends`, { headers: { cookie } });
  assert.equal(sendLogRes.status, 200, await sendLogRes.clone().text());
  const sendLog = (await sendLogRes.json()) as { data: unknown[] };
  assert.deepEqual(sendLog.data, []);
});

test("404s for unknown workspace and unknown campaign id", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const wrongWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/newsletter/campaigns`, {
    headers: { cookie },
  });
  assert.equal(wrongWorkspace.status, 404);

  const missingCampaign = await fetch(`${baseUrl}${BASE(deps.workspaceId)}/campaigns/does-not-exist`, { headers: { cookie } });
  assert.equal(missingCampaign.status, 404);
  const body = (await missingCampaign.json()) as { code: string };
  assert.equal(body.code, "NEWSLETTER_CAMPAIGN_NOT_FOUND");
});
