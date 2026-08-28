import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

import { startTestServer } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { createNewsletterModule } from "../../runtime/composition/modules/newsletter.js";
import type { NewsletterRouteDeps } from "../../inbound/admin-http/routes/newsletter/deps.js";
import type { NewsletterPublicRouteDeps } from "../../routes/site/newsletter-deps.js";
import { buildUnsubscribeLink } from "#src/features/newsletter/unsubscribe";

/**
 * @file SPEC-011 (Newsletter) Stage 5, AC-39/INV-09 — `CONFIRM_SUBSCRIPTION`/`UNSUBSCRIBE` never
 * set or read a session cookie, even on success, and are reachable with zero cookies at all (no
 * `/api/admin` gate applies to them — they are registered at `/newsletter/*`, never under
 * `/api/admin`). Mirrors `members-public-sign-in.test.ts`'s pattern: only the module's public deps
 * object is wired into the test app — `requireAdminSession`/`registerAuthRoutes` are never even
 * registered, so there is no session machinery in this app instance at all to accidentally rely on.
 *
 * DISCLOSED (found while testing, not fixed): `CONFIRM_SUBSCRIPTION`'s real success path
 * (`consumeConfirmationToken` flipping a subscription to `subscribed`) is structurally unreachable
 * in either composition root today — `MembersConsentCapability` is always unbound (`null`,
 * ADR-PIPE-011 Risks item 3; same disclosed-by-design gap class as the Launch Gate's mailer-adapter
 * block), and `consumeConfirmationToken` throws a plain (non-`NewsletterConfirmTokenInvalidError`)
 * `Error` the instant it reaches that check — surfacing here as a 500, not the 400 "invalid token"
 * page. The test below exercises exactly that real, current behavior (a well-formed, unexpired,
 * unconsumed token still fails, honestly reported) rather than asserting a 200 this composition
 * cannot produce.
 */

function buildPublicApp(): { app: express.Express; deps: NewsletterRouteDeps } {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
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
  // Only the PUBLIC half of the module is exercised here — no admin registrar, no session
  // middleware at all exists in this app instance (unlike `newsletter-auth.test.ts`'s admin app).
  createNewsletterModule({ admin: deps, public: publicDeps }).registerRoutes?.(app);
  return { app, deps };
}

async function seedConfirmedSubscription(deps: NewsletterRouteDeps): Promise<{ listId: string; subscriberId: string; subscriptionId: string; consentRevisionId: string }> {
  const now = deps.clock.nowIso();
  const listId = deps.idGen.newId();
  await deps.newsletterListRepo.save({
    id: listId,
    workspaceId: deps.workspaceId,
    name: "Public routes test list",
    slug: `public-test-${listId}`,
    isDefault: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const subscriberId = deps.idGen.newId();
  await deps.memberRepo.save({
    id: subscriberId,
    workspaceId: deps.workspaceId,
    email: `public-route-${subscriberId}@example.com`,
    status: "active",
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });

  const subscriptionId = deps.idGen.newId();
  const consentRevisionId = "consent-rev-1";
  await deps.newsletterSubscriptionRepo.save({
    id: subscriptionId,
    workspaceId: deps.workspaceId,
    listId,
    subscriberId,
    status: "subscribed",
    source: "admin",
    consentRevisionIdAtSubscribe: consentRevisionId,
    subscribedAt: now,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { listId, subscriberId, subscriptionId, consentRevisionId };
}

test("UNSUBSCRIBE (GET): succeeds (200, HTML) with zero cookies sent and never sets one; idempotent on repeat", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.newsletterReady;
  const { listId, subscriberId, consentRevisionId } = await seedConfirmedSubscription(deps);

  const url = await buildUnsubscribeLink({
    deps: {
      subscriptionRepo: deps.newsletterSubscriptionRepo,
      keyring: deps.newsletterKeyring,
      originRegistry: deps.originRegistry,
      consentCapability: deps.membersConsentCapability,
      clock: deps.clock,
    },
    claims: { workspaceId: deps.workspaceId, subscriberId, listId, campaignId: null, consentRevisionId },
  });
  const token = new URL(url).searchParams.get("token") ?? "";
  assert.ok(token.length > 0);

  const res = await fetch(`${baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get("set-cookie"), null, "UNSUBSCRIBE must never set a session cookie, even on success");
  assert.match(res.headers.get("content-type") ?? "", /html/);
  const body = await res.text();
  assert.match(body, /unsubscribed/i);

  const repeat = await fetch(`${baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
  assert.equal(repeat.status, 200, "REQ-15/EC-03: a repeat click of an already-processed token is idempotent success");
  assert.equal(repeat.headers.get("set-cookie"), null);
});

test("UNSUBSCRIBE (POST, RFC 8058 one-click): succeeds (200) with zero cookies sent and never sets one", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.newsletterReady;
  const { listId, subscriberId, consentRevisionId } = await seedConfirmedSubscription(deps);

  const url = await buildUnsubscribeLink({
    deps: {
      subscriptionRepo: deps.newsletterSubscriptionRepo,
      keyring: deps.newsletterKeyring,
      originRegistry: deps.originRegistry,
      consentCapability: deps.membersConsentCapability,
      clock: deps.clock,
    },
    claims: { workspaceId: deps.workspaceId, subscriberId, listId, campaignId: null, consentRevisionId },
  });
  const token = new URL(url).searchParams.get("token") ?? "";

  const res = await fetch(`${baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get("set-cookie"), null, "one-click POST must never set a session cookie either");
});

test("UNSUBSCRIBE: an admin session cookie present on the request is neither required nor consulted — same outcome, no cookie echoed back", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.newsletterReady;
  const { listId, subscriberId, consentRevisionId } = await seedConfirmedSubscription(deps);

  const url = await buildUnsubscribeLink({
    deps: {
      subscriptionRepo: deps.newsletterSubscriptionRepo,
      keyring: deps.newsletterKeyring,
      originRegistry: deps.originRegistry,
      consentCapability: deps.membersConsentCapability,
      clock: deps.clock,
    },
    claims: { workspaceId: deps.workspaceId, subscriberId, listId, campaignId: null, consentRevisionId },
  });
  const token = new URL(url).searchParams.get("token") ?? "";

  // No admin login machinery exists in this app instance at all (see `buildPublicApp`'s header) —
  // a fabricated cookie value stands in for "a caller who happens to be carrying one around,"
  // proving the route neither requires nor reads it.
  const res = await fetch(`${baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
    headers: { cookie: "tovu_session=whatever-a-caller-happened-to-send" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("UNSUBSCRIBE: an invalid/malformed token is rejected 400 (HTML), still never touching a cookie", async (t) => {
  const { app } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/newsletter/unsubscribe?token=not-a-real-token`);
  assert.equal(res.status, 400, await res.clone().text());
  assert.equal(res.headers.get("set-cookie"), null);
  assert.match(res.headers.get("content-type") ?? "", /html/);
});

test("CONFIRM_SUBSCRIPTION: an invalid/unknown token is rejected 400 (HTML), never touching a cookie", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.newsletterReady;

  const res = await fetch(`${baseUrl}/newsletter/confirm?token=not-a-real-token`);
  assert.equal(res.status, 400, await res.clone().text());
  assert.equal(res.headers.get("set-cookie"), null);
  assert.match(res.headers.get("content-type") ?? "", /html/);
  const body = await res.text();
  assert.match(body, /invalid/i);
});

test("CONFIRM_SUBSCRIPTION: a well-formed, unexpired, unconsumed token still fails today (MembersConsentCapability is unbound, disclosed gap) — but never touches a cookie either way", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.newsletterReady;

  const now = deps.clock.nowIso();
  const listId = deps.idGen.newId();
  await deps.newsletterListRepo.save({
    id: listId,
    workspaceId: deps.workspaceId,
    name: "Confirm test list",
    slug: `confirm-test-${listId}`,
    isDefault: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const subscriberId = deps.idGen.newId();
  await deps.memberRepo.save({
    id: subscriberId,
    workspaceId: deps.workspaceId,
    email: `confirm-route-${subscriberId}@example.com`,
    status: "active",
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  const subscriptionId = deps.idGen.newId();
  await deps.newsletterSubscriptionRepo.save({
    id: subscriptionId,
    workspaceId: deps.workspaceId,
    listId,
    subscriberId,
    status: "pending",
    source: "admin",
    consentRevisionIdAtSubscribe: null,
    subscribedAt: null,
    unsubscribedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await deps.newsletterConfirmationTokenRepo.save({
    id: deps.idGen.newId(),
    workspaceId: deps.workspaceId,
    subscriptionId,
    tokenHash,
    purpose: "newsletter_subscription_confirm",
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    consumedAt: null,
  });

  const res = await fetch(`${baseUrl}/newsletter/confirm?token=${rawToken}`);
  // Real, current, disclosed behavior: 500, not the 400 "invalid" page — see file header.
  assert.equal(res.status, 500, await res.clone().text());
  assert.equal(res.headers.get("set-cookie"), null, "even a 500 must never set a session cookie");
  assert.match(res.headers.get("content-type") ?? "", /html/);
});

test("both public routes are reachable directly at /newsletter/* — never under /api/admin", async (t) => {
  const { app } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const confirmRes = await fetch(`${baseUrl}/newsletter/confirm?token=whatever`);
  assert.notEqual(confirmRes.status, 404, "the route itself must exist at this path");

  const unsubRes = await fetch(`${baseUrl}/newsletter/unsubscribe?token=whatever`);
  assert.notEqual(unsubRes.status, 404, "the route itself must exist at this path");

  const underAdminGate = await fetch(`${baseUrl}/api/admin/newsletter/confirm?token=whatever`);
  assert.equal(underAdminGate.status, 404, "no route is registered under /api/admin for these public paths");
});
