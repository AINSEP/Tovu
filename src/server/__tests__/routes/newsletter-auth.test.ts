import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { createNewsletterModule } from "../../runtime/composition/modules/newsletter.js";
import type { NewsletterRouteDeps } from "../../routes/admin/newsletter/deps.js";
import type { NewsletterPublicRouteDeps } from "../../routes/site/newsletter-deps.js";

/**
 * @file SPEC-011 (Newsletter) Stage 5, AC-42 — every one of the 19 admin routes, called by a
 * principal holding zero `admin.newsletter.*` grants, is denied `403 FORBIDDEN` naming the
 * specific permission it needed, never silently downgraded. Mirrors `admin-widgets-routes.test.ts`'s
 * `AC-28` test and `members-auth.test.ts`'s bare-principal pattern: a real `createRouteDeps()`
 * composition, real login, a "bare principal" (zero role/policy grants) to prove the denied side,
 * plus the seeded owner (wildcard grant) to create the fixtures each route needs a real id for.
 */

const BASE = (workspaceId: string) => `/api/admin/v1/workspaces/${workspaceId}/newsletter`;

function buildTestApp(): { app: express.Express; deps: NewsletterRouteDeps } {
  const deps = createRouteDeps();
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

let grantCounter = 0;
/** Registers a principal holding ZERO permission grants — mirrors `admin-widgets-routes.test.ts`'s `loginWithPermissions(deps, baseUrl, [])`. */
async function loginAsBarePrincipal(deps: NewsletterRouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `bare-principal-newsletter-${suffix}`;
  const username = `bare-newsletter-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Seed one Members principal via `memberRepo` directly (the `SubscriberDirectoryPort` real Members would resolve). */
async function seedMemberSubscriber(deps: NewsletterRouteDeps): Promise<string> {
  const id = deps.idGen.newId();
  await deps.memberRepo.save({
    id,
    workspaceId: deps.workspaceId,
    email: `subscriber-${id}@example.com`,
    status: "active",
    emailVerifiedAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });
  return id;
}

/** Build the 3 real fixtures (list, campaign, subscription) every path-param'd route needs, using the OWNER's cookie. */
async function seedFixtures(
  deps: NewsletterRouteDeps,
  baseUrl: string,
  ownerCookie: string
): Promise<{ listId: string; campaignId: string; subscriptionId: string }> {
  const base = BASE(deps.workspaceId);

  const listRes = await fetch(`${baseUrl}${base}/lists`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Fixture list", slug: `fixture-list-${grantCounter}` }),
  });
  assert.equal(listRes.status, 201, await listRes.clone().text());
  const { data: list } = (await listRes.json()) as { data: { id: string } };

  const campaignRes = await fetch(`${baseUrl}${base}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      subject: "Fixture subject",
      fromName: "Fixture Sender",
      fromEmail: "sender@example.com",
      replyTo: "reply@example.com",
      listId: list.id,
      bodyJson: { type: "doc", content: [] },
    }),
  });
  assert.equal(campaignRes.status, 201, await campaignRes.clone().text());
  const { data: campaign } = (await campaignRes.json()) as { data: { id: string } };

  const subscriberId = await seedMemberSubscriber(deps);
  const subscriptionRes = await fetch(`${baseUrl}${base}/lists/${list.id}/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ subscriberId }),
  });
  assert.equal(subscriptionRes.status, 201, await subscriptionRes.clone().text());
  const { data: subscription } = (await subscriptionRes.json()) as { data: { id: string } };

  return { listId: list.id, campaignId: campaign.id, subscriptionId: subscription.id };
}

test("AC-42: every one of the 19 admin newsletter routes is denied 403 FORBIDDEN, naming its specific admin.newsletter.* permission, for a principal with zero grants", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const { listId, campaignId, subscriptionId } = await seedFixtures(deps, baseUrl, ownerCookie);
  const base = BASE(deps.workspaceId);

  const cases: Array<{ method: string; path: string; permission: string; body?: unknown }> = [
    { method: "GET", path: `${base}/campaigns`, permission: "admin.newsletter.read" },
    { method: "GET", path: `${base}/campaigns/${campaignId}`, permission: "admin.newsletter.read" },
    {
      method: "POST",
      path: `${base}/campaigns`,
      permission: "admin.newsletter.campaign.compose",
      body: { subject: "x", fromName: "x", fromEmail: "a@example.com", replyTo: "b@example.com", listId, bodyJson: {} },
    },
    { method: "PATCH", path: `${base}/campaigns/${campaignId}`, permission: "admin.newsletter.campaign.compose", body: {} },
    { method: "POST", path: `${base}/campaigns/${campaignId}/cancel`, permission: "admin.newsletter.campaign.compose" },
    { method: "POST", path: `${base}/campaigns/${campaignId}/schedule`, permission: "admin.newsletter.campaign.schedule", body: {} },
    { method: "POST", path: `${base}/campaigns/${campaignId}/send`, permission: "admin.newsletter.campaign.send" },
    {
      method: "POST",
      path: `${base}/campaigns/${campaignId}/send-test`,
      permission: "admin.newsletter.campaign.send_test",
      body: { testAddresses: ["test@example.com"] },
    },
    { method: "POST", path: `${base}/campaigns/${campaignId}/pause`, permission: "admin.newsletter.campaign.send" },
    { method: "POST", path: `${base}/campaigns/${campaignId}/resume`, permission: "admin.newsletter.campaign.send" },
    { method: "GET", path: `${base}/lists`, permission: "admin.newsletter.read" },
    { method: "POST", path: `${base}/lists`, permission: "admin.newsletter.list.manage", body: { name: "y", slug: "y" } },
    { method: "POST", path: `${base}/lists/${listId}/archive`, permission: "admin.newsletter.list.manage" },
    { method: "GET", path: `${base}/lists/${listId}/subscriptions`, permission: "admin.newsletter.subscriber.read" },
    {
      method: "POST",
      path: `${base}/lists/${listId}/subscriptions`,
      permission: "admin.newsletter.subscriber.manage",
      body: { subscriberId: "does-not-matter" },
    },
    { method: "DELETE", path: `${base}/lists/${listId}/subscriptions/${subscriptionId}`, permission: "admin.newsletter.subscriber.manage" },
    {
      method: "POST",
      path: `${base}/lists/${listId}/subscriptions/import`,
      permission: "admin.newsletter.subscriber.manage",
      body: { subscribers: [{ subscriberId: "does-not-matter" }] },
    },
    {
      method: "POST",
      path: `${base}/subscriptions/${subscriptionId}/resend-confirmation`,
      permission: "admin.newsletter.subscriber.manage",
    },
    { method: "GET", path: `${base}/campaigns/${campaignId}/sends`, permission: "admin.newsletter.subscriber.read" },
  ];

  assert.equal(cases.length, 19, "this list must cover exactly the 19 admin routes api.spec.md registers");

  for (const c of cases) {
    const res = await fetch(`${baseUrl}${c.path}`, {
      method: c.method,
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: c.body !== undefined ? JSON.stringify(c.body) : undefined,
    });
    assert.equal(res.status, 403, `${c.method} ${c.path} should 403, got ${res.status}: ${await res.clone().text()}`);
    const responseBody = (await res.json()) as { code: string; details: { permission: string } };
    assert.equal(responseBody.code, "FORBIDDEN", `${c.method} ${c.path}`);
    assert.equal(responseBody.details.permission, c.permission, `${c.method} ${c.path}`);
  }
});

test("mismatched :workspaceId 404s before authorize() runs (newsletter campaigns list route)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/newsletter/campaigns`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(res.status, 404);
});
