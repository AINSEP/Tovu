// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the Users admin surface
 * (`routes/users/{create,list,update,assign-role,enable,reset-password,delete}.ts`) through the REAL
 * site composition on both dialects.
 *
 * Round 1's `rbac-grants-real-composition.unrun.integration.test.ts` already covers: a policy grant
 * flipping 403 → 201, the built-in viewer role, and disable → live session 401 + no re-login. This
 * file covers what it leaves: the user row round-trip and its username conflict, a ROLE change
 * reaching the next request of an already-signed-in user, re-enabling a disabled user, a password
 * reset revoking sessions (AC-29), and DELETE → Trash (sessions revoked, username held, restore).
 */

interface AdminUser {
  principalId: string;
  workspaceId: string;
  username: string;
  email: string | null;
  status: string;
  roleIds: string[];
  policyIds: string[];
}

const as = (site: BootedSite, cookie: string) => ({ baseUrl: site.baseUrl, cookie });

async function createUser(site: BootedSite, username: string, extra: Record<string, unknown> = {}): Promise<{ user: AdminUser; password: string }> {
  const password = `${username}-p4ssw0rd!`;
  const { user } = await expectJson<{ user: AdminUser }>(await send(site, "POST", `${site.ws}/users`, { username, password, ...extra }), 201);
  return { user, password };
}

async function login(site: BootedSite, username: string, password: string): Promise<Response> {
  return fetch(`${site.baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function loginCookie(site: BootedSite, username: string, password: string): Promise<string> {
  const res = await login(site, username, password);
  await expectJson(res, 200);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function meStatus(site: BootedSite, cookie: string): Promise<number> {
  const res = await fetch(`${site.baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  await res.arrayBuffer();
  return res.status;
}

async function listedUser(site: BootedSite, principalId: string): Promise<AdminUser | undefined> {
  const { users } = await expectJson<{ users: AdminUser[] }>(await send(site, "GET", `${site.ws}/users`), 200);
  return users.find((user) => user.principalId === principalId);
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] users [${dialect}]: a created user persists and lists; a duplicate username is 409; PATCH changes the email and an omitted email is kept`, async (t) => {
    const site = await bootSite(t, dialect);
    const { user } = await createUser(site, "unrunalice", { email: "alice@example.test" });
    assert.deepEqual(
      { username: user.username, email: user.email, status: user.status, roleIds: user.roleIds, policyIds: user.policyIds, workspaceId: user.workspaceId },
      { username: "unrunalice", email: "alice@example.test", status: "active", roleIds: [], policyIds: [], workspaceId: site.deps.workspaceId }
    );
    const listed = await listedUser(site, user.principalId);
    assert.deepEqual(
      { username: listed?.username, email: listed?.email, status: listed?.status },
      { username: "unrunalice", email: "alice@example.test", status: "active" }
    );

    const duplicate = await expectJson<{ code: string; details: unknown }>(
      await send(site, "POST", `${site.ws}/users`, { username: "unrunalice", password: "another-p4ssw0rd!" }),
      409
    );
    assert.deepEqual({ code: duplicate.code, details: duplicate.details }, { code: "RESOURCE_CONFLICT", details: { field: "username" } });

    const patched = await expectJson<{ user: AdminUser }>(await send(site, "PATCH", `${site.ws}/users/${user.principalId}`, { email: "alice2@example.test" }), 200);
    assert.equal(patched.user.email, "alice2@example.test");
    const untouched = await expectJson<{ user: AdminUser }>(
      await send(site, "PATCH", `${site.ws}/users/${user.principalId}`, { username: "renamed-ignored" }),
      200
    );
    assert.deepEqual(
      { username: untouched.user.username, email: untouched.user.email },
      { username: "unrunalice", email: "alice2@example.test" },
      "AC-28: username is ignored; an omitted email is retained, not cleared"
    );
    assert.equal((await listedUser(site, user.principalId))?.email, "alice2@example.test");
  });

  test(`[unrun] users [${dialect}]: assigning the built-in editor role to a signed-in user changes what their SAME session may do; the role shows on the user row`, async (t) => {
    const site = await bootSite(t, dialect);
    const { user, password } = await createUser(site, "unruneditor");
    const cookie = await loginCookie(site, "unruneditor", password);

    const before = await expectJson<{ code: string }>(await send(as(site, cookie), "POST", `${site.ws}/posts`, { title: "Before the role" }), 403);
    assert.equal(before.code, "FORBIDDEN");

    const { roles } = await expectJson<{ roles: Array<{ id: string; name: string; isBuiltin: boolean }> }>(await send(site, "GET", `${site.ws}/roles`), 200);
    const editor = roles.find((role) => role.name === "editor");
    assert.ok(editor, `initSite seeds a built-in editor role; seeded: ${roles.map((role) => role.name).join(", ")}`);
    const { assignment } = await expectJson<{ assignment: { principalId: string; roleId: string } }>(
      await send(site, "POST", `${site.ws}/users/${user.principalId}/roles`, { roleId: editor.id }),
      201
    );
    assert.deepEqual({ principalId: assignment.principalId, roleId: assignment.roleId }, { principalId: user.principalId, roleId: editor.id });
    assert.deepEqual((await listedUser(site, user.principalId))?.roleIds, [editor.id]);

    const { post } = await expectJson<{ post: { title: string } }>(await send(as(site, cookie), "POST", `${site.ws}/posts`, { title: "After the role" }), 201);
    assert.equal(post.title, "After the role", "the persisted role link is read by the next authorize() call");
    const usersDenied = await expectJson<{ code: string }>(await send(as(site, cookie), "GET", `${site.ws}/users`), 403);
    assert.equal(usersDenied.code, "FORBIDDEN", "editor is a content role, not user management");

    const unknownRole = await send(site, "POST", `${site.ws}/users/${user.principalId}/roles`, { roleId: "00000000-0000-4000-8000-0000000000bb" });
    assert.equal(unknownRole.status, 404);
  });

  test(`[unrun] users [${dialect}]: a disabled user re-enabled through the API can sign in again`, async (t) => {
    const site = await bootSite(t, dialect);
    const { user, password } = await createUser(site, "unrunreenable");

    const disabled = await expectJson<{ user: AdminUser }>(await send(site, "POST", `${site.ws}/users/${user.principalId}/disable`), 200);
    assert.equal(disabled.user.status, "disabled");
    assert.equal((await login(site, "unrunreenable", password)).status, 401);

    const enabled = await expectJson<{ user: AdminUser }>(await send(site, "POST", `${site.ws}/users/${user.principalId}/enable`), 200);
    assert.deepEqual({ status: enabled.user.status, username: enabled.user.username }, { status: "active", username: "unrunreenable" });
    assert.equal((await listedUser(site, user.principalId))?.status, "active");
    const cookie = await loginCookie(site, "unrunreenable", password);
    assert.equal(await meStatus(site, cookie), 200);
  });

  test(`[unrun] users [${dialect}]: a password reset is 204, revokes the user's live session, and only the new password signs in`, async (t) => {
    const site = await bootSite(t, dialect);
    const { user, password } = await createUser(site, "unrunreset");
    const oldCookie = await loginCookie(site, "unrunreset", password);
    assert.equal(await meStatus(site, oldCookie), 200);

    const reset = await send(site, "POST", `${site.ws}/users/${user.principalId}/reset-password`, { password: "unrun-new-p4ssw0rd!" });
    assert.equal(reset.status, 204);
    assert.equal(await reset.text(), "", "INV-05: the new password is never echoed");

    assert.equal(await meStatus(site, oldCookie), 401, "AC-29: every session of the target is revoked");
    assert.equal((await login(site, "unrunreset", password)).status, 401, "the old password no longer works");
    const fresh = await loginCookie(site, "unrunreset", "unrun-new-p4ssw0rd!");
    assert.equal(await meStatus(site, fresh), 200);
  });

  test(`[unrun] users [${dialect}]: DELETE moves the user to the Trash — session revoked, sign-in refused, username held, edits refused — and a Trash restore brings back the account but not the old session`, async (t) => {
    const site = await bootSite(t, dialect);
    const { user, password } = await createUser(site, "unruntrashed", { email: "trashed@example.test" });
    const oldCookie = await loginCookie(site, "unruntrashed", password);

    const removed = await send(site, "DELETE", `${site.ws}/users/${user.principalId}`);
    assert.equal(removed.status, 204);
    assert.equal(await meStatus(site, oldCookie), 401, "trashing revokes every session (adapters/user.ts hide)");
    assert.equal((await login(site, "unruntrashed", password)).status, 401);

    const trash = await expectJson<{ items: Array<{ entityType: string; entityId: string; title: string }> }>(await send(site, "GET", `${site.ws}/trash`), 200);
    assert.deepEqual(
      trash.items.filter((item) => item.entityId === user.principalId).map((item) => ({ entityType: item.entityType, title: item.title })),
      [{ entityType: "user", title: "unruntrashed" }]
    );

    assert.deepEqual(
      await expectJson(await send(site, "POST", `${site.ws}/users`, { username: "unruntrashed", password: "other-p4ssw0rd!" }), 409),
      { error: "a user with this username is in the Trash; restore or delete them permanently first", code: "USERNAME_IN_TRASH" }
    );
    assert.deepEqual(await expectJson(await send(site, "PATCH", `${site.ws}/users/${user.principalId}`, { email: "x@example.test" }), 409), {
      error: "this user is in the Trash; restore them first",
      code: "USER_IN_TRASH",
    });
    assert.equal((await send(site, "DELETE", `${site.ws}/users/${user.principalId}`)).status, 204, "a second delete of a trashed user is an idempotent 204");

    const restored = await expectJson<unknown>(
      await send(site, "POST", `${site.ws}/trash/restore`, { items: [{ entityType: "user", entityId: user.principalId }] }),
      200
    );
    assert.deepEqual(restored, { restored: 1, results: [{ entityType: "user", entityId: user.principalId, outcome: "restored" }] });
    assert.equal((await listedUser(site, user.principalId))?.status, "active", "restored to the status it had before the Trash");
    assert.equal(await meStatus(site, oldCookie), 401, "a restore never revives an old session");
    const fresh = await loginCookie(site, "unruntrashed", password);
    assert.equal(await meStatus(site, fresh), 200);
  });

  test(`[unrun] users [${dialect}]: the signed-in owner cannot delete their own account (409 SELF_DELETE)`, async (t) => {
    const site = await bootSite(t, dialect);
    const me = await expectJson<{ user: { id: string } }>(await send(site, "GET", "/api/admin/v1/auth/me"), 200);
    const refused = await expectJson<{ code: string }>(await send(site, "DELETE", `${site.ws}/users/${me.user.id}`), 409);
    assert.equal(refused.code, "SELF_DELETE");
    assert.equal(await meStatus(site, site.cookie), 200, "the owner's own session is untouched");
  });
}
