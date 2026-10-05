// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #9 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — RBAC grants actually gating
 * a real route, through the REAL site composition on both dialects.
 *
 * `identity-crud-routes.test.ts` proves each identity route returns the right envelope (create user,
 * assign role, attach policy, write permission) over the hermetic `createRouteDeps()` root — but never
 * then signs in AS that user and checks the grant changes what a gated route answers. The identity
 * repos are dialect-tested alone (`features/identity/__tests__/repo.contract.test.ts`); the chain
 * route → persisted grant rows → `authorize()` → 403/201 on another feature's route is not.
 */

type Booted = BootedSite;

async function createUser(site: Booted, username: string): Promise<{ principalId: string; password: string }> {
  const password = `${username}-p4ssw0rd!`;
  const { user } = await expectJson<{ user: { principalId: string } }>(await send(site, "POST", `${site.ws}/users`, { username, password }), 201);
  return { principalId: user.principalId, password };
}

async function loginAs(site: Booted, username: string, password: string): Promise<string> {
  const res = await fetch(`${site.baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await expectJson(res, 200);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function createPostAs(site: Booted, cookie: string, title: string): Promise<Response> {
  return send({ baseUrl: site.baseUrl, cookie }, "POST", `${site.ws}/posts`, { title, status: "draft" });
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] rbac [${dialect}]: a user with no grants is 403 on post create; attaching a policy holding content.write makes the same request 201`, async (t) => {
    const site = await bootSite(t, dialect);
    const writer = await createUser(site, "unrunwriter");
    const writerCookie = await loginAs(site, "unrunwriter", writer.password);

    const denied = await expectJson<{ code: string }>(await createPostAs(site, writerCookie, "Before the grant"), 403);
    assert.equal(denied.code, "FORBIDDEN");

    const { policy } = await expectJson<{ policy: { id: string } }>(await send(site, "POST", `${site.ws}/policies`, { name: "unrun-writers" }), 201);
    await expectJson(await send(site, "POST", `${site.ws}/policies/${policy.id}/permissions`, { permission: "content.write" }), 201);
    await expectJson(await send(site, "POST", `${site.ws}/users/${writer.principalId}/policies`, { policyId: policy.id }), 201);

    const { post } = await expectJson<{ post: { title: string } }>(await createPostAs(site, writerCookie, "After the grant"), 201);
    assert.equal(post.title, "After the grant", "the persisted grant is read by the next authorize() call, same session");

    const referenced = await expectJson<{ code: string }>(await send(site, "DELETE", `${site.ws}/policies/${policy.id}`), 409);
    assert.equal(referenced.code, "RESOURCE_CONFLICT", "a policy still attached to a user cannot be deleted");
  });

  test(`[unrun] rbac [${dialect}]: the built-in viewer role can list posts but not create one`, async (t) => {
    const site = await bootSite(t, dialect);
    const viewer = await createUser(site, "unrunviewer");
    const { roles } = await expectJson<{ roles: Array<{ id: string; name: string }> }>(await send(site, "GET", `${site.ws}/roles`), 200);
    const viewerRole = roles.find((role) => role.name === "viewer");
    assert.ok(viewerRole, "initSite seeds the built-in viewer role on this dialect too");
    const { assignment } = await expectJson<{ assignment: { principalId: string; roleId: string } }>(
      await send(site, "POST", `${site.ws}/users/${viewer.principalId}/roles`, { roleId: viewerRole.id }),
      201
    );
    assert.deepEqual(assignment, { ...assignment, principalId: viewer.principalId, roleId: viewerRole.id });

    const viewerCookie = await loginAs(site, "unrunviewer", viewer.password);
    await expectJson(await send({ baseUrl: site.baseUrl, cookie: viewerCookie }, "GET", `${site.ws}/posts`), 200);
    const denied = await expectJson<{ code: string }>(await createPostAs(site, viewerCookie, "Viewer write"), 403);
    assert.equal(denied.code, "FORBIDDEN");
  });

  test(`[unrun] rbac [${dialect}]: disabling a user ends their live session — the next request with their cookie is 401`, async (t) => {
    const site = await bootSite(t, dialect);
    const target = await createUser(site, "unrundisabled");
    const targetCookie = await loginAs(site, "unrundisabled", target.password);
    await expectJson(await fetch(`${site.baseUrl}/api/admin/v1/auth/me`, { headers: { cookie: targetCookie } }), 200);

    await expectJson(await send(site, "POST", `${site.ws}/users/${target.principalId}/disable`), 200);

    const after = await expectJson<unknown>(await fetch(`${site.baseUrl}/api/admin/v1/auth/me`, { headers: { cookie: targetCookie } }), 401);
    assert.deepEqual(after, { error: "unauthenticated", code: "UNAUTHENTICATED" });
    const relogin = await fetch(`${site.baseUrl}/api/admin/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "unrundisabled", password: target.password }),
    });
    assert.equal(relogin.status, 401, "a disabled user cannot sign back in");
  });
}
