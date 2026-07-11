import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../app";

test("packet-one admin and content routes expose the seeded post loop", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Admin routes are gated by requireAdminSession — establish a session first.
  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const postResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts/post-home`, {
    headers: { cookie },
  });
  assert.equal(postResponse.status, 200);
  const postPayload = (await postResponse.json()) as {
    post: { id: string; slug: string; title: string };
  };
  assert.equal(postPayload.post.id, "post-home");
  assert.equal(postPayload.post.slug, "welcome");

  const themeUpdate = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/presentation`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ activeThemeId: "column" }),
  });
  assert.equal(themeUpdate.status, 200);
  const themePayload = (await themeUpdate.json()) as {
    settings: { activeThemeId: string };
  };
  assert.equal(themePayload.settings.activeThemeId, "column");

  const saveResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts/post-home`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Welcome to Tovu",
      slug: "welcome",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Packet one is alive." }],
          },
        ],
      },
      status: "published",
    }),
  });
  assert.equal(saveResponse.status, 200);

  const contentResponse = await fetch(`${baseUrl}/api/content/v1/workspaces/workspace-local/posts/welcome`);
  assert.equal(contentResponse.status, 200);
  const contentPayload = (await contentResponse.json()) as {
    post: { title: string; workspaceId?: string; version?: number; status?: string };
    presentation: { activeThemeId: string };
  };
  assert.equal(contentPayload.post.title, "Welcome to Tovu");
  assert.equal(contentPayload.post.workspaceId, undefined);
  assert.equal(contentPayload.post.version, undefined);
  assert.equal(contentPayload.post.status, undefined);
  assert.equal(contentPayload.presentation.activeThemeId, "column");
});

test("POST posts creates a blank draft and it's immediately listed", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Draft Idea" }),
  });
  assert.equal(createResponse.status, 201);
  const createPayload = (await createResponse.json()) as {
    post: { id: string; slug: string; title: string; status: string; version: number };
  };
  assert.equal(createPayload.post.title, "Draft Idea");
  assert.equal(createPayload.post.slug, "draft-idea");
  assert.equal(createPayload.post.status, "draft");
  assert.equal(createPayload.post.version, 1);

  const listResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    headers: { cookie },
  });
  const listPayload = (await listResponse.json()) as { posts: Array<{ post: { id: string } }> };
  assert.ok(listPayload.posts.some((entry) => entry.post.id === createPayload.post.id));
});

test("POST pages creates a blank draft with kind 'page', it's listed under pages but not posts", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/pages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "About Us" }),
  });
  assert.equal(createResponse.status, 201);
  const createPayload = (await createResponse.json()) as {
    post: { id: string; slug: string; title: string; status: string; version: number };
  };
  assert.equal(createPayload.post.title, "About Us");
  assert.equal(createPayload.post.slug, "about-us");
  assert.equal(createPayload.post.status, "draft");
  assert.equal(createPayload.post.version, 1);

  const pagesListResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/pages`, {
    headers: { cookie },
  });
  const pagesListPayload = (await pagesListResponse.json()) as {
    posts: Array<{ post: { id: string } }>;
  };
  assert.ok(pagesListPayload.posts.some((entry) => entry.post.id === createPayload.post.id));

  // The new page must NOT show up on the posts list.
  const postsListResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    headers: { cookie },
  });
  const postsListPayload = (await postsListResponse.json()) as {
    posts: Array<{ post: { id: string } }>;
  };
  assert.ok(!postsListPayload.posts.some((entry) => entry.post.id === createPayload.post.id));

  // The generic posts/:id GET route still works for a page — same table, same editor.
  const getResponse = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/posts/${createPayload.post.id}`,
    { headers: { cookie } }
  );
  assert.equal(getResponse.status, 200);
});

test("pages routes 404 for an unknown workspace id", async (t) => {
  const server = createServer(createApp());
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  const listResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/pages`, {
    headers: { cookie },
  });
  assert.equal(listResponse.status, 404);

  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/pages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Nope" }),
  });
  assert.equal(createResponse.status, 404);
});

/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it's checked against (mirrors `identity-routes.test.ts`'s viewer
 * construction, minus the role assignment). Used below to prove the denied side of `theme.set` /
 * `changeset.read` / `changeset.revert`.
 */
async function loginAsBarePrincipal(
  deps: ReturnType<typeof createRouteDeps>,
  baseUrl: string,
  usernameSuffix: string
): Promise<string> {
  await deps.identityReady;
  const bareId = `bare-principal-${usernameSuffix}`;
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
    username: `bare-${usernameSuffix}`,
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: `bare-${usernameSuffix}`, password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("SPEC-006 REQ-05: presentation routes are gated by theme.set — a principal without it is denied 403, the owner still succeeds", async (t) => {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const ownerCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, "presentation");

  const getDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/presentation`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(getDenied.status, 403);
  const getDeniedBody = (await getDenied.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(getDeniedBody.code, "FORBIDDEN");
  assert.equal(getDeniedBody.details.permission, "theme.set");
  assert.equal(getDeniedBody.details.reason, "no_grant");

  const patchDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/presentation`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ activeThemeId: "column" }),
  });
  assert.equal(patchDenied.status, 403);

  const getAllowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/presentation`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(getAllowed.status, 200);
});

test("SPEC-006 REQ-05: change-set routes are gated by changeset.read/changeset.revert — a principal without them is denied 403, the owner still succeeds", async (t) => {
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  const ownerCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, "changesets");

  // Owner creates a post — the command gateway auto-records a change set to revert.
  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ title: "Revert Me" }),
  });
  assert.equal(createResponse.status, 201);

  const listAllowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/change-sets`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(listAllowed.status, 200);
  const { changeSets } = (await listAllowed.json()) as { changeSets: Array<{ id: string }> };
  assert.ok(changeSets.length > 0, "the post create recorded a change set");
  const changeSetId = changeSets[0].id;

  const listDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/change-sets`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(listDenied.status, 403);
  const listDeniedBody = (await listDenied.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(listDeniedBody.code, "FORBIDDEN");
  assert.equal(listDeniedBody.details.permission, "changeset.read");
  assert.equal(listDeniedBody.details.reason, "no_grant");

  const getDenied = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/change-sets/${changeSetId}`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(getDenied.status, 403);

  const revertDenied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/change-sets/${changeSetId}/revert`,
    { method: "POST", headers: { cookie: bareCookie } }
  );
  assert.equal(revertDenied.status, 403);
  const revertDeniedBody = (await revertDenied.json()) as {
    code: string;
    details: { permission: string; reason: string };
  };
  assert.equal(revertDeniedBody.details.permission, "changeset.revert");

  // The change set survives the denied revert attempt untouched (still "applied").
  const getAllowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/change-sets/${changeSetId}`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(getAllowed.status, 200);
  const getAllowedBody = (await getAllowed.json()) as { changeSet: { status: string } };
  assert.equal(getAllowedBody.changeSet.status, "applied", "the denied revert must not have applied");
});
