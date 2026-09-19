import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Round-4 dispatch, Task 1 — proves the real admin HTTP routes attribute `post_revisions`
 * rows to the actual authenticated principal rather than the `SYSTEM_ACTOR_ID` fallback
 * (`createPost`/`updatePost`/`deletePost` all default `actorId` to `"system"` when a caller omits
 * it — see `post.ts`). Before this dispatch's fix, none of the 6 admin HTTP routes forwarded
 * `principal.id`, so every real edit made through the admin UI was attributed to `"system"`.
 *
 * Also proves the human/direct side of the agent-vs-human distinguishability requirement:
 * a route-driven write's revision carries `delegatedByWorkspaceId`/`delegatedById: null` — the
 * mirror image of `tool-registrations.revisions-sink.test.ts`'s agent-path assertion (both non-null
 * there). Together the two files prove the two paths are distinguishable, not just individually
 * attributed.
 */

const WS = "workspace-local";

async function startServerWithDeps(t: { after: (fn: () => Promise<void>) => void }): Promise<{ baseUrl: string; cookie: string; deps: RouteDeps }> {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  return { baseUrl, cookie, deps };
}

/** The seeded admin's real `principals` row id — the value every revision below must carry. */
async function seededAdminPrincipalId(deps: RouteDeps): Promise<string> {
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  return ownerUser.principalId;
}

const VALID_BODY_JSON = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] };

/** Reads the response body exactly once, as raw text, then parses it — every assertion below needs
 *  either the status-on-failure message or the parsed JSON, never both off the same `Response`. */
async function createPostViaRoute(baseUrl: string, cookie: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, raw);
  return (JSON.parse(raw) as { post: { id: string } }).post;
}

test("POST posts: the create revision is attributed to the real authenticated principal, not SYSTEM_ACTOR_ID", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const principalId = await seededAdminPrincipalId(deps);

  const post = await createPostViaRoute(baseUrl, cookie, { title: "Attribution Target", slug: "attribution-target" });

  const revisions = await deps.postRepo.listRevisions({ workspaceId: WS, postId: post.id });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].actorId, principalId, "the create revision must carry the real principal, not 'system'");
  assert.notEqual(revisions[0].actorId, "system");
  // Direct human path (no agent tool involved) — the mirror image of the agent-path assertion in
  // tool-registrations.revisions-sink.test.ts.
  assert.equal(revisions[0].delegatedByWorkspaceId, null);
  assert.equal(revisions[0].delegatedById, null);
});

test("PUT posts/:postId: the update revision is attributed to the real authenticated principal", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const principalId = await seededAdminPrincipalId(deps);

  const post = await createPostViaRoute(baseUrl, cookie, { title: "Update Attribution", slug: "update-attribution" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Updated", slug: "update-attribution", bodyJson: VALID_BODY_JSON, status: "draft" }),
  });
  assert.equal(res.status, 200, await res.text());

  const revisions = await deps.postRepo.listRevisions({ workspaceId: WS, postId: post.id });
  const latest = revisions[revisions.length - 1];
  assert.equal(latest.op, "update");
  assert.equal(latest.actorId, principalId);
  assert.equal(latest.delegatedByWorkspaceId, null);
  assert.equal(latest.delegatedById, null);
});

test("DELETE posts/:postId: the delete revision is attributed to the real authenticated principal", async (t) => {
  const { baseUrl, cookie, deps } = await startServerWithDeps(t);
  const principalId = await seededAdminPrincipalId(deps);

  const post = await createPostViaRoute(baseUrl, cookie, { title: "Delete Attribution", slug: "delete-attribution" });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/posts/${post.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 200, await res.text());

  const revisions = await deps.postRepo.listRevisions({ workspaceId: WS, postId: post.id });
  const latest = revisions[revisions.length - 1];
  assert.equal(latest.op, "delete");
  assert.equal(latest.actorId, principalId);
});
