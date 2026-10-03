import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import type { OutboundEmail, MemberRecord } from "#src/features/members/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { createRateLimiter, MAGIC_LINK_PER_EMAIL } from "#src/contracts/core/rate-limit/rate-limit";
import type { MembersRouteDeps } from "../../inbound/admin-http/routes/members/deps.js";
import { registerAdminMemberDisableRoute } from "../../inbound/admin-http/routes/members/disable.js";
import { registerAdminMemberGetRoute } from "../../inbound/admin-http/routes/members/get-by-id.js";
import { registerAdminMemberListRoute } from "../../inbound/admin-http/routes/members/list.js";
import { registerAdminMemberRequestMagicLinkRoute } from "../../inbound/admin-http/routes/members/request-magic-link.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file FEAT-013 Phase 1 (ADR-PIPE-013 §1) — the live authorization gap.
 *
 * Before this remediation, `list.ts`/`get-by-id.ts`/`request-magic-link.ts` ran behind
 * session auth only (no `authorize()` call) while `disable.ts` alone was permission-gated.
 * This is byte-for-byte the same harness/pattern `analytics-recent-hits.test.ts` and
 * `settings-auth.test.ts` already established for the identical class of gap (FEAT-014):
 * a real `createRouteDeps()` composition, real login, and a "bare principal" (no
 * role/policy grants) to prove the denied side of each gate, plus the seeded owner
 * (wildcard `*` grant) to prove no regression for the only caller type that exists today.
 */

function buildTestApp(): { app: express.Express; deps: RouteDeps; membersDeps: MembersRouteDeps } {
  const deps = createRouteDeps();
  // T023/C-015: a real (non-shared-with-anything-else) MAGIC_LINK_PER_EMAIL
  // limiter instance for this test app — mirrors `app.ts`'s per-boot wiring.
  const membersDeps: MembersRouteDeps = {
    ...deps,
    magicLinkPerEmailLimiter: createRateLimiter({ profile: MAGIC_LINK_PER_EMAIL, clock: deps.clock }),
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminMemberListRoute(app, membersDeps);
  registerAdminMemberGetRoute(app, membersDeps);
  registerAdminMemberDisableRoute(app, membersDeps);
  registerAdminMemberRequestMagicLinkRoute(app, membersDeps);
  return { app, deps, membersDeps };
}

/** A principal with a login but zero role/policy grants — `authorize()` returns `no_grant` for anything. */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-members";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-members",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-members", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function seedMember(deps: RouteDeps): Promise<MemberRecord> {
  const nowIso = deps.clock.nowIso();
  const member: MemberRecord = {
    id: deps.idGen.newId(),
    workspaceId: deps.workspaceId,
    email: "seed-member@example.com",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  };
  await deps.memberRepo.save(member);
  return member;
}

test("T003: GET members list denied 403 FORBIDDEN without member.manage; carries no member data", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string }; members?: unknown };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "member.manage");
  assert.equal("members" in body, false);
});

test("T003: GET members list succeeds (200) for the seeded owner (wildcard grant) — no regression", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { members: unknown[] };
  assert.deepEqual(body.members, []);

  const nowIso = deps.clock.nowIso();
  const members: MemberRecord[] = ["pending", "active", "disabled"].map((status, index) => ({
    id: `list-member-${index}`,
    workspaceId: deps.workspaceId,
    email: `list-${status}@example.com`,
    status: status as MemberRecord["status"],
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  }));
  for (const member of members) await deps.memberRepo.save(member);
  const listUrl = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members`;
  const all = await fetch(listUrl, { headers: { cookie: ownerCookie } });
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), { members });
  const first = await fetch(`${listUrl}?limit=2`, { headers: { cookie: ownerCookie } });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { members: members.slice(0, 2) });
  const next = await fetch(`${listUrl}?limit=2&afterId=${members[1].id}`, { headers: { cookie: ownerCookie } });
  assert.equal(next.status, 200);
  assert.deepEqual(await next.json(), { members: members.slice(2) });
});

test("T004: GET member-by-id denied 403 FORBIDDEN without member.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const member = await seedMember(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/${member.id}`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string }; member?: unknown };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "member.manage");
  assert.equal("member" in body, false);
});

test("T004: GET member-by-id succeeds (200) for the seeded owner (wildcard grant) — no regression", async (t) => {
  const { app, deps } = buildTestApp();
  const member = await seedMember(deps);
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/${member.id}`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { member: { id: string } };
  assert.equal(body.member.id, member.id);
});

test("T005: POST request-magic-link denied 403 FORBIDDEN without member.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ email: "someone@example.com" }),
    }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string }; delivered?: unknown };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "member.manage");
  assert.equal("delivered" in body, false);
});

test("T005: POST request-magic-link succeeds (200) for the seeded owner (wildcard grant) — no regression", async (t) => {
  const { app, deps } = buildTestApp();
  const sent: OutboundEmail[] = [];
  const send = deps.mailer.send.bind(deps.mailer);
  deps.mailer.send = async (message, options) => {
    sent.push(message);
    return send(message, options);
  };
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: "someone@example.com" }),
    }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { delivered: true };
  assert.equal(body.delivered, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to.email, "someone@example.com");
  const link = sent[0].text?.match(/(?:https?:\/\/\S+|\/auth\/magic\?\S+)/)?.[0];
  assert.ok(link, "mail must contain an actionable sign-in link");
  const url = new URL(link, baseUrl);
  assert.equal(url.pathname, "/auth/magic");
  assert.match(url.searchParams.get("token") ?? "", /^[a-f0-9]{64}$/);
});

test("POST request-magic-link with redirectPath succeeds (200)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: "redirect@example.com", redirectPath: "/account" }),
    }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { delivered: true };
  assert.equal(body.delivered, true);
});

test("POST request-magic-link returns 400 for invalid email", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: "not-an-email" }),
    }
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.ok(body.error.includes("not a valid email address"));
});

test("POST request-magic-link returns 404 for mismatched workspaceId", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/other-workspace-id/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: "someone@example.com" }),
    }
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "workspace was not found");
});

test("POST request-magic-link returns 500 on unexpected internal error", async (t) => {
  const { app, deps } = buildTestApp();
  deps.memberRepo.findByEmail = async () => {
    throw new Error("unexpected db error");
  };
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: "valid@example.com" }),
    }
  );
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "internal error");
});

/**
 * REQ-10/AC-20 regression proof: `disable.ts` was already correctly gated before this
 * remediation — re-confirm no behavior change (T009's "no regression on the one route
 * that was already correct" clause).
 */
test("AC-20 (pre-existing, re-confirmed): POST disable still denied 403 FORBIDDEN without member.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const member = await seedMember(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/${member.id}/disable`,
    { method: "POST", headers: { cookie: bareCookie } }
  );
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "member.manage");
});

test("T017/INV-NEW-03: an unauthorized caller's 403 on request-magic-link does not consume the MAGIC_LINK_PER_EMAIL window for that email", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const targetEmail = "shared-budget@example.com";

  // 6 denied (403, unauthorized) requests for the same email — more than MAGIC_LINK_PER_EMAIL.max (5).
  for (let i = 0; i < 6; i++) {
    const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ email: targetEmail }),
    });
    assert.equal(denied.status, 403, `denied request ${i + 1} should be 403, not 429`);
  }

  // The owner (who IS authorized) should still have the FULL budget for this email — proving
  // the 6 prior 403s never touched the rate-limit window (authz runs before the rate-limit check).
  for (let i = 0; i < 5; i++) {
    const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: targetEmail }),
    });
    assert.equal(allowed.status, 200, `owner request ${i + 1} should succeed (200), full budget intact`);
  }

  // The 6th owner request now exceeds MAGIC_LINK_PER_EMAIL.max — proves the limiter is real,
  // not merely absent.
  const sixthOwnerRequest = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ email: targetEmail }),
    }
  );
  assert.equal(sixthOwnerRequest.status, 429);
  const body = (await sixthOwnerRequest.json()) as { code: string };
  assert.equal(body.code, "RATE_LIMIT_EXCEEDED");
});

test("mismatched :workspaceId 404s before authorize() runs (list route), matching the verified repo precedent", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-workspace/members`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(res.status, 404);
});

test("owner disable persists the disabled member and revokes an existing session", async (t) => {
  const { app, deps } = buildTestApp();
  const member = await seedMember(deps);
  const session = {
    id: "session-before-disable",
    workspaceId: deps.workspaceId,
    memberId: member.id,
    tokenHash: "session-before-disable-hash",
    createdAt: deps.clock.nowIso(),
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  await deps.memberSessionRepo.save(session);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/${member.id}/disable`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const persisted = await deps.memberRepo.findById({ workspaceId: deps.workspaceId, id: member.id });
  assert.equal(persisted?.status, "disabled");
  assert.equal(persisted?.version, member.version + 1);
  const revoked = await deps.memberSessionRepo.findByTokenHash({ workspaceId: deps.workspaceId, tokenHash: session.tokenHash });
  assert.ok(revoked?.revokedAt, "the previously live session must be revoked");
  assert.deepEqual(await res.json(), { member: persisted });
});

test("blank admin magic-link emails remain validation errors after authorization without consuming budget", async (t) => {
  const { app, deps, membersDeps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/members/request-magic-link`;
  for (const email of ["", "   "]) {
    const response = await fetch(url, {
      method: "POST",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: `'${email}' is not a valid email address` });
  }
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const denied = await fetch(url, {
    method: "POST",
    headers: { cookie: bareCookie, "content-type": "application/json" },
    body: JSON.stringify({ email: "   " }),
  });
  assert.equal(denied.status, 403, "authorization must still run before email validation or limiting");
  assert.equal(await membersDeps.magicLinkPerEmailLimiter.size!({}), 0);
});
