import assert from "node:assert/strict";
import test from "node:test";

import { startTestServer } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { createRateLimiter, MAGIC_LINK_COMPLETE_ATTEMPT, MAGIC_LINK_PER_EMAIL, MAGIC_LINK_PER_IP } from "#src/contracts/core/rate-limit/rate-limit";
import type { MemberPublicRouteDeps } from "../../inbound/public-http/routes/members/deps.js";
import { registerPublicMemberCompleteSignInRoute } from "../../inbound/public-http/routes/members/complete-sign-in.js";
import { registerPublicMemberSignInRequestRoute } from "../../inbound/public-http/routes/members/sign-in.js";

/**
 * @file FEAT-013 Phase 2 (ADR-PIPE-013 Decision §2-3) —
 * `registerPublicMemberCompleteSignInRoute`. INV-NEW-01 (cookie isolation):
 * sets ONLY `tovu_member_session`, never `tovu_session`; a request carrying
 * only the admin cookie (no token) is still treated as anonymous/rejected.
 * `MAGIC_LINK_COMPLETE_ATTEMPT` is enforced (T016/W-004).
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
  registerPublicMemberCompleteSignInRoute(app, deps);
  return { app, deps };
}

/** Requests a sign-in link and extracts the raw token straight from the console-mailer test double's outbound message. */
async function requestAndExtractToken(
  baseUrl: string,
  deps: MemberPublicRouteDeps,
  email: string
): Promise<string> {
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
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);
  } finally {
    console.log = originalLog;
  }
  const match = capturedBody.match(/token=([a-f0-9]+)/);
  assert.ok(match, "expected the console mailer to log a token= query param");
  return match![1];
}

test("T016/INV-NEW-01: complete-sign-in sets ONLY tovu_member_session, never tovu_session", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "cookie-isolation@example.com");

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^tovu_member_session=/);
  assert.equal(setCookie.includes("tovu_session="), false);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /HttpOnly/);

  const body = (await res.json()) as { member: { id: string; email: string } };
  assert.equal(body.member.email, "cookie-isolation@example.com");
});

test("INV-NEW-01: a request carrying only a tovu_session (admin) cookie, no token, is rejected — the admin cookie has zero effect here", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "tovu_session=some-admin-session-value" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "MEMBER_AUTH_ERROR");
});

test("PublicMemberResponse excludes emailVerifiedAt/workspaceId/version/note/fields", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "serializer-check@example.com");

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { member: Record<string, unknown> };
  // `name` is optional and unset for this member (never provided at signup), so JSON.stringify
  // drops it — only assert the always-present fields plus the absence of every forbidden one.
  const keys = Object.keys(body.member).sort();
  assert.deepEqual(keys, ["email", "id", "status"]);
  for (const forbidden of ["emailVerifiedAt", "workspaceId", "version", "note", "fields"]) {
    assert.equal(forbidden in body.member, false, `must not expose '${forbidden}'`);
  }
});

test("T016/W-004: MAGIC_LINK_COMPLETE_ATTEMPT — the 26th completion attempt from this IP within 60s is denied 429", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const effectiveMax = MAGIC_LINK_COMPLETE_ATTEMPT.max + MAGIC_LINK_COMPLETE_ATTEMPT.burst;
  for (let i = 0; i < effectiveMax; i++) {
    const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "bogus-token" }),
    });
    assert.equal(res.status, 401, `attempt ${i + 1} should be a 401 (invalid token), not rate-limited yet`);
  }

  const overLimit = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "bogus-token" }),
  });
  assert.equal(overLimit.status, 429);
  const body = (await overLimit.json()) as { code: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
});

test("404s on a workspace id that does not match the deployed workspace", async (t) => {
  const { app } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/some-other-workspace/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "whatever" }),
  });
  assert.equal(res.status, 404);
});
