import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server";

import express from "express";

import type { MemberRecord } from "../../../members";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { createRateLimiter, MAGIC_LINK_PER_EMAIL } from "../../middleware/rate-limit";
import type { MembersRouteDeps } from "../../routes/admin/members/deps";
import { registerAdminMemberDisableRoute } from "../../routes/admin/members/disable";
import { registerAdminMemberGetRoute } from "../../routes/admin/members/get-by-id";
import { registerAdminMemberListRoute } from "../../routes/admin/members/list";
import { registerAdminMemberRequestMagicLinkRoute } from "../../routes/admin/members/request-magic-link";
import type { RouteDeps } from "../../routes/types";

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
    magicLinkPerEmailLimiter: createRateLimiter(MAGIC_LINK_PER_EMAIL, deps.clock),
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
