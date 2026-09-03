import assert from "node:assert/strict";
import test from "node:test";

import http from "node:http";

import { createCapturingResponse, extractRouteHandler, startTestServer } from "../helpers/http-test-server.js";

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

/**
 * A raw `node:http` POST with NO default headers at all — unlike `fetch`/undici, which always adds
 * a `User-Agent: node` header even when the caller sets none. This is the only way to exercise
 * `req.get("user-agent") ?? undefined`'s undefined side; every `fetch`-based request in this file
 * (and every other member route test) unavoidably takes the defined side.
 */
function postCompleteNoDefaultHeaders(
  baseUrl: string,
  workspaceId: string,
  token: string
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}/api/members/v1/workspaces/${workspaceId}/sign-in/complete`);
    const payload = JSON.stringify({ token });
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) }));
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
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

test("a user-agent header on the completing request is recorded on the minted session", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "user-agent-recorded@example.com");

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "regression-test-agent/1.0" },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { member: { id: string } };

  const sessions = await deps.memberSessionRepo.listByMember({
    workspaceId: deps.workspaceId,
    memberId: body.member.id,
  });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.userAgent, "regression-test-agent/1.0");
});

test("the member record backing a valid, unexpired token having vanished is refused 404 MEMBER_NOT_FOUND — a data-integrity guard, not a validation outcome", async (t) => {
  // `completeSignIn` (write-service.ts) treats this as "should not happen given
  // requestSignInLink always pre-creates the member" — defensive, not reachable through any
  // normal request. It IS reachable at this route's boundary, though: the route only depends on
  // whatever `deps.members.findById` returns, and a `MemberRepoPort` implementation that (for
  // whatever reason — a concurrent hard-delete, a backing-store inconsistency) can't find the
  // row the token points at is a real, if rare, production shape. Simulated here by wrapping the
  // real in-memory repo and making ONLY `findById` report "not found", so `requestSignInLink`
  // still pre-creates the member via `findByEmail`/`save` exactly as it always does.
  const { app, deps } = buildPublicApp();
  const realFindById = deps.memberRepo.findById.bind(deps.memberRepo);
  let suppressFindById = false;
  deps.memberRepo.findById = async (required) => {
    if (suppressFindById) return null;
    return realFindById(required);
  };
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "vanished-member@example.com");
  suppressFindById = true;

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "MEMBER_NOT_FOUND");
});

test("a session-repo failure surfaces as a 500 internal error, past a valid token", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "session-save-failure@example.com");
  deps.memberSessionRepo.save = async () => {
    throw new Error("session store unavailable");
  };

  const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${deps.workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

test("no user-agent header at all leaves the session's userAgent field unset", async (t) => {
  const { app, deps } = buildPublicApp();
  const baseUrl = await startTestServer(app, t);
  const token = await requestAndExtractToken(baseUrl, deps, "no-user-agent@example.com");

  const { status, json } = await postCompleteNoDefaultHeaders(baseUrl, deps.workspaceId, token);
  assert.equal(status, 200);
  const body = json as { member: { id: string } };

  const sessions = await deps.memberSessionRepo.listByMember({
    workspaceId: deps.workspaceId,
    memberId: body.member.id,
  });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.userAgent, undefined);
});

// The two tests below deliberately bypass real HTTP dispatch — see the identical note in
// `members-public-sign-in.test.ts`: Express guarantees `req.params.workspaceId` is always a
// populated string for any request that reaches this handler, and `body-parser`'s `express.json()`
// unconditionally sets `req.body = req.body || {}` before this handler ever runs, so neither
// fallback below is reachable through any real request.
test("req.params.workspaceId ?? \"\": an unpopulated param (impossible via real Express routing) still 404s rather than throwing", async () => {
  const { app } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in/complete");
  const { res, capture } = createCapturingResponse();
  const req = { params: { workspaceId: undefined }, body: { token: "whatever" } } as unknown as Parameters<
    typeof handler
  >[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
});

test("req.body ?? {}: an undefined body (impossible with express.json() mounted) still resolves to an invalid-token 401 rather than throwing", async () => {
  const { app, deps } = buildPublicApp();
  const handler = extractRouteHandler(app, "post", "/api/members/v1/workspaces/:workspaceId/sign-in/complete");
  const { res, capture } = createCapturingResponse();
  const req = {
    params: { workspaceId: deps.workspaceId },
    body: undefined,
    get: () => undefined,
  } as unknown as Parameters<typeof handler>[0];

  await handler(req, res);
  assert.equal(capture.statusCode, 401);
  assert.equal((capture.jsonBody as { code: string }).code, "MEMBER_AUTH_ERROR");
});
