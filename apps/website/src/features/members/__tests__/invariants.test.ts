/**
 * ADR-030 §2 hard invariant, enforced: a site member (a public-site sign-up) can never use an admin
 * feature. OWNER DECISION 2026-10-04 (F3144): sign-up gives the member a `kind: "member"` principal,
 * and `@jini-ai/user-management`'s `authorize()` denies that kind every operator permission through
 * one rule, `principalKindMayExercisePermission` — relaxing it later is a change to that function.
 *
 * The first test drives the real composition (`createApp(createRouteDeps())`): the member signs up
 * and signs in through the public member routes, is then handed the owner wildcard directly (so a
 * denial cannot be explained by a missing grant), and must still be refused every permission in the
 * catalog plus `*`, and every gated `/api/admin` route even with an operator session minted for it.
 * The seeded owner, asked the same questions, is allowed — the control that keeps the test honest.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { listPermissions } from "@jini-ai/user-management";
import type express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { MemberContext, MemberRecord } from "../types.js";

const EMAIL = "signup@example.com";

/** Request a sign-in link through the public route and read the raw token the console mailer logs. */
async function signUpAndSignIn(required: { baseUrl: string; workspaceId: string }): Promise<void> {
  const { baseUrl, workspaceId } = required;
  const originalLog = console.log;
  let logged = "";
  console.log = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (text.includes("token=")) logged = text;
  };
  try {
    const res = await fetch(`${baseUrl}/api/members/v1/workspaces/${workspaceId}/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL }),
    });
    assert.equal(res.status, 200, "public sign-in request must succeed without an admin session");
  } finally {
    console.log = originalLog;
  }
  const token = logged.match(/token=([a-f0-9]+)/)?.[1];
  assert.ok(token, "the console mailer logs the sign-in link");
  const complete = await fetch(`${baseUrl}/api/members/v1/workspaces/${workspaceId}/sign-in/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(complete.status, 200, "public sign-in completion must accept the delivered magic-link token");
}

/** Every route registered directly on the app under `/api/admin`, with path params filled in. */
function adminRoutes(required: { app: express.Express; workspaceId: string }): Array<{ method: string; url: string }> {
  const stack = (required.app as unknown as { _router: { stack: Array<{ route?: { path: unknown; methods: Record<string, boolean> } }> } })._router.stack;
  const routes: Array<{ method: string; url: string }> = [];
  for (const layer of stack) {
    const path = layer.route?.path;
    if (typeof path !== "string" || !path.startsWith("/api/admin")) continue;
    const url = path
      .replace(/:workspaceId(\([^)]*\))?\??/g, required.workspaceId)
      .replace(/:\w+(\([^)]*\))?\??/g, "f3144")
      .replace(/\*/g, "f3144");
    for (const method of Object.keys(layer.route!.methods)) routes.push({ method: method.toUpperCase(), url });
  }
  return routes;
}

async function status(required: { baseUrl: string; method: string; url: string }, optional: { cookie?: string } = {}): Promise<number> {
  const res = await fetch(`${required.baseUrl}${required.url}`, {
    method: required.method,
    headers: optional.cookie ? { cookie: `tovu_session=${optional.cookie}` } : {},
  });
  await res.arrayBuffer();
  return res.status;
}

test("a member who signs up through the public routes is denied every admin capability and every admin route (F3144)", async (t) => {
  const routeDeps = createRouteDeps();
  const app = createApp(routeDeps);
  const baseUrl = await startTestServer(app, t);
  const { workspaceId } = routeDeps;
  await routeDeps.identityReady;

  await signUpAndSignIn({ baseUrl, workspaceId });
  const member = await routeDeps.memberRepo.findByEmail({ workspaceId, email: EMAIL });
  assert.equal(member?.status, "active");
  const principal = await routeDeps.principalRepo.findById({ workspaceId, id: member!.id });
  assert.equal(principal?.kind, "member", "sign-up writes the member's principal with kind 'member'");

  // Hand the member the owner wildcard straight through the repos (no grant service allows it), so
  // only the member's kind can explain the denials below.
  await routeDeps.policyPermissionRepo.save({ id: "pp-f3144", workspaceId, policyId: "policy-f3144", permission: "*", resourceType: null, constraintJson: null });
  await routeDeps.principalPolicyRepo.save({ id: "link-f3144", workspaceId, principalId: member!.id, policyId: "policy-f3144" });

  const ownerId = await routeDeps.ownerPrincipalId;
  const permissions = [...listPermissions({}).map((descriptor) => descriptor.id), "*"];
  assert.ok(permissions.length > 20, "the permission catalog is populated");
  for (const permission of permissions) {
    assert.deepEqual(
      await routeDeps.authorize({ principalId: member!.id, permission, workspaceId }),
      { allowed: false, reason: "principal_kind_denied" },
      permission
    );
    assert.equal((await routeDeps.authorize({ principalId: ownerId, permission, workspaceId })).allowed, true, `owner control: ${permission}`);
  }

  // An operator session for the member can only come from a hand-made row; the admin gate must
  // still treat it exactly like no session on every gated route. The owner's session is the control.
  const mint = async (principalId: string): Promise<string> => {
    const rawToken = routeDeps.tokens.newToken({});
    await routeDeps.sessionRepo.save({ id: `session-${principalId}`, workspaceId, principalId, tokenHash: routeDeps.tokens.hashToken({ rawToken }), createdAt: new Date().toISOString(), expiresAt: "2999-01-01T00:00:00.000Z" });
    return rawToken;
  };
  const memberCookie = await mint(member!.id);
  const ownerCookie = await mint(ownerId);
  assert.equal(await status({ baseUrl, method: "GET", url: `/api/admin/v1/workspaces/${workspaceId}/users` }, { cookie: ownerCookie }), 200);

  let gated = 0;
  for (const route of adminRoutes({ app, workspaceId })) {
    if ((await status({ baseUrl, ...route })) !== 401) continue; // ungated, e.g. login
    gated += 1;
    assert.equal(await status({ baseUrl, ...route }, { cookie: memberCookie }), 401, `${route.method} ${route.url}`);
  }
  assert.ok(gated > 50, `expected the admin surface to be enumerated, got ${gated} gated routes`);
});

test("representative MemberRecord and MemberContext fixtures carry no role/permission field", () => {
  // These fixtures document the intended shape; they cannot prohibit optional type keys.
  // The sibling write-service tests inspect real sign-in and resolver outputs.
  const member: MemberRecord = {
    id: "member-1",
    workspaceId: "ws-1",
    email: "member@example.com",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  };
  const context: MemberContext = { isAuthenticated: true, activeTierIds: [], isPaid: false };

  assert.ok(!("role" in member) && !("permissions" in member));
  assert.ok(!("role" in context) && !("permissions" in context));
});
