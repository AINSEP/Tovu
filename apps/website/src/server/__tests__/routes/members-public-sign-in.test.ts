import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { createRateLimiter, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { registerPublicMemberSignInRequestRoute } from "../../inbound/public-http/routes/members/sign-in.js";

/**
 * @file FEAT-013 Phase 2 (ADR-PIPE-013 Decision §2-3, ADR-030 OQ-8) —
 * `registerPublicMemberSignInRequestRoute`: the primary target of the hard
 * pre-launch precondition. Both `MAGIC_LINK_PER_EMAIL` and `MAGIC_LINK_PER_IP`
 * must be enforced (T015/W-002/W-003), and INV-06 (anti-enumeration) must
 * hold: a registered and an unregistered email both get `{delivered:true}`
 * below the limit and both get `429` identically once exceeded.
 */

function buildPublicApp(): { app: express.Express; deps: MemberPublicRouteDeps } {
  const routeDeps = createRouteDeps();
  const deps: MemberPublicRouteDeps = {
    workspaceId: routeDeps.workspaceId,
    memberRepo: routeDeps.memberRepo,
    memberTierRepo: routeDeps.memberTierRepo,
    memberSubscriptionRepo: routeDeps.memberSubscriptionRepo,
    memberSessionRepo: routeDeps.memberSessionRepo,
    magicLinkRepo: routeDeps.magicLinkRepo,
    mailer: routeDeps.mailer,
    clock: routeDeps.clock,
    idGen: routeDeps.idGen,
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: routeDeps.clock }),
    magicLinkPerIpLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_IP, clock: routeDeps.clock }),
    magicLinkCompleteAttemptLimiter: createRateLimiter({ profile: MAGIC_LINK_COMPLETE_ATTEMPT, clock: routeDeps.clock }),
  };
  const app = express();
  app.use(express.json());
  registerPublicMemberSignInRequestRoute(app, deps);
  return { app, deps };
}

async function postSignIn(baseUrl: string, workspaceId: string, email: string) {
  return fetch(`${baseUrl}/api/members/v1/workspaces/${workspaceId}/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

test("T015/W-002: MAGIC_LINK_PER_EMAIL — the 6th sign-in request for the same email is denied 429; a different email is unaffected", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    const res = await postSignIn(baseUrl, deps.workspaceId, "budget-a@example.com");
    assert.equal(res.status, 200, `request ${i + 1} for budget-a should succeed`);
  }
  const sixth = await postSignIn(baseUrl, deps.workspaceId, "budget-a@example.com");
  assert.equal(sixth.status, 429);
  const sixthBody = (await sixth.json()) as { code: string };
  assert.equal(sixthBody.code, "RATE_LIMIT_EXCEEDED");

  // A DIFFERENT email has its own independent counter — unaffected by budget-a's exhaustion.
  const otherEmail = await postSignIn(baseUrl, deps.workspaceId, "budget-b@example.com");
  assert.equal(otherEmail.status, 200);
});

test("T015/W-003: MAGIC_LINK_PER_IP — the 21st sign-in request from this IP (across distinct emails) is denied 429", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  for (let i = 0; i < MAGIC_LINK_PER_IP.max; i++) {
    const res = await postSignIn(baseUrl, deps.workspaceId, `distinct-${i}@example.com`);
    assert.equal(res.status, 200, `request ${i + 1} (distinct email, same IP) should succeed`);
  }

  const twentyFirst = await postSignIn(baseUrl, deps.workspaceId, "distinct-final@example.com");
  assert.equal(twentyFirst.status, 429);
  const body = (await twentyFirst.json()) as { code: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
});

test("INV-06: a registered and an unregistered email both get {delivered:true} below the limit, identically", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.memberRepo.save({
    id: "existing-member",
    workspaceId: deps.workspaceId,
    email: "registered@example.com",
    status: "active",
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  const registered = await postSignIn(baseUrl, deps.workspaceId, "registered@example.com");
  const unregistered = await postSignIn(baseUrl, deps.workspaceId, "never-seen@example.com");
  assert.equal(registered.status, 200);
  assert.equal(unregistered.status, 200);
  assert.deepEqual(await registered.json(), { delivered: true });
  assert.deepEqual(await unregistered.json(), { delivered: true });
});

test("INV-06: a registered and an unregistered email both get 429 identically once exceeded", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  await deps.memberRepo.save({
    id: "existing-member-2",
    workspaceId: deps.workspaceId,
    email: "registered2@example.com",
    status: "active",
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
    version: 1,
  });

  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    await postSignIn(baseUrl, deps.workspaceId, "registered2@example.com");
  }
  for (let i = 0; i < MAGIC_LINK_PER_EMAIL.max; i++) {
    await postSignIn(baseUrl, deps.workspaceId, "unregistered2@example.com");
  }

  const registeredDenied = await postSignIn(baseUrl, deps.workspaceId, "registered2@example.com");
  const unregisteredDenied = await postSignIn(baseUrl, deps.workspaceId, "unregistered2@example.com");
  assert.equal(registeredDenied.status, 429);
  assert.equal(unregisteredDenied.status, 429);
  const registeredBody = (await registeredDenied.json()) as { code: string; error: string };
  const unregisteredBody = (await unregisteredDenied.json()) as { code: string; error: string };
  assert.equal(registeredBody.code, unregisteredBody.code);
  assert.equal(registeredBody.error, unregisteredBody.error);
});

test("404s on a workspace id that does not match the deployed workspace", async (t) => {
  const { app } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, "some-other-workspace", "whoever@example.com");
  assert.equal(res.status, 404);
});

test("a malformed email is rejected 400 with the MemberValidationError message, below any rate limit", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, deps.workspaceId, "not-an-email");
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /is not a valid email address/);
});

test("a redirectPath is carried into the minted sign-in link", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const originalLog = console.log;
  let capturedBody = "";
  console.log = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (text.includes("token=")) capturedBody = text;
  };
  try {
    const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "redirect-path@example.com", redirectPath: "/welcome" }),
    });
    assert.equal(res.status, 200);
  } finally {
    console.log = originalLog;
  }
  assert.match(capturedBody, /&redirect=%2Fwelcome/);
});

test("a mailer failure surfaces as a 500 internal error, past both rate-limit checks", async (t) => {
  const { app, deps } = buildPublicApp();
  deps.mailer.send = async () => {
    throw new Error("smtp exploded");
  };
  const baseUrl = await startTestServer(app, t);

  const res = await postSignIn(baseUrl, deps.workspaceId, "mailer-failure@example.com");
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("an email-less JSON body ({}) is treated as an empty, invalid email — not a crash", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /is not a valid email address/);
});

// The two tests below deliberately bypass real HTTP dispatch, the same technique
// `export-site-route.test.ts` uses and `extractRouteHandler`'s own doc describes: Express
// guarantees `req.params.workspaceId` is always a populated string for any request that reaches
// this handler at all (an unfilled `:workspaceId` segment simply never matches the route), and
// `body-parser`'s `express.json()` unconditionally sets `req.body = req.body || {}` before this
// handler ever runs (`node_modules/body-parser/lib/types/json.js`) — so neither `?? ""` nor `?? {}`
// fallback below is reachable through any real request. Calling the handler directly is the only
// way to exercise them, exactly as the exhaustiveness-guard case that helper's doc describes.
test("req.params.workspaceId ?? \"\": an unpopulated param (impossible via real Express routing) still 404s rather than throwing", async () => {
  const { app } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined }, body: { email: "whoever@example.com" } } as unknown as Parameters<
    typeof handler
  >[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("req.body ?? {}: an undefined body (impossible with express.json() mounted) still resolves to an empty-email 400 rather than throwing", async () => {
  const { app, deps } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: deps.workspaceId }, body: undefined } as unknown as Parameters<typeof handler>[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 400);
  assert.match((capture.jsonBody as { error: string }).error, /is not a valid email address/);
});
