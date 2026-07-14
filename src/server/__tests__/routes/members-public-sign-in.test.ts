import assert from "node:assert/strict";
import test from "node:test";

import { startTestServer } from "../helpers/http-test-server";

import express from "express";

import { createRouteDeps } from "../../app";
import { createRateLimiter, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP } from "../../middleware/rate-limit";
import type { MemberPublicRouteDeps } from "../../routes/members/deps";
import { registerPublicMemberSignInRequestRoute } from "../../routes/members/sign-in";

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
    magicLinkPerEmailLimiter: createRateLimiter(MAGIC_LINK_PER_EMAIL, routeDeps.clock),
    magicLinkPerIpLimiter: createRateLimiter(MAGIC_LINK_PER_IP, routeDeps.clock),
    magicLinkCompleteAttemptLimiter: createRateLimiter(MAGIC_LINK_COMPLETE_ATTEMPT, routeDeps.clock),
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
