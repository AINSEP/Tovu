import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file The permission gates on the Posts/Pages admin read and write routes that no other suite
 * exercised with a principal who LACKS the permission: `GET /posts`, `GET /posts/:postId`,
 * `GET /pages`, `GET /pages/:pageId` (`content.read`, 2026-07-16 authz sweep — before it these
 * routes had no check beyond session auth), and `POST /pages` / `PUT /pages/:pageId`
 * (`content.write`, enforced by the command gateway). Deleting any one `authorizeOrRespond` call, or
 * naming the wrong permission, used to ship green: every existing test of these routes signs in as
 * the wildcard owner.
 */

const WS = "workspace-local";

async function boot(t: test.TestContext): Promise<{ deps: RouteDeps; baseUrl: string; owner: string; bare: string }> {
  const deps: RouteDeps = { ...createRouteDeps() };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bare = await loginAsBarePrincipal(deps, baseUrl);
  return { deps, baseUrl, owner: cookie, bare };
}

async function createRow(baseUrl: string, cookie: string, surface: "posts" | "pages", title: string): Promise<{ id: string; slug: string }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, raw);
  return (JSON.parse(raw) as { post: { id: string; slug: string } }).post;
}

async function expectForbidden(res: Response, permission: string): Promise<void> {
  const raw = await res.text();
  assert.equal(res.status, 403, raw);
  const body = JSON.parse(raw) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, permission);
  // A refused read must not carry any row data alongside the error.
  assert.equal("posts" in body, false);
  assert.equal("post" in body, false);
}

for (const surface of ["posts", "pages"] as const) {
  test(`GET /${surface}: a signed-in principal without content.read is refused 403, and the owner still lists`, async (t) => {
    const { baseUrl, owner, bare } = await boot(t);
    const row = await createRow(baseUrl, owner, surface, `Listed ${surface} row`);

    await expectForbidden(await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, { headers: { cookie: bare } }), "content.read");

    const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, { headers: { cookie: owner } });
    assert.equal(allowed.status, 200);
    const { posts } = (await allowed.json()) as { posts: Array<{ post: { id: string } }> };
    assert.ok(posts.some((entry) => entry.post.id === row.id));
  });

  test(`GET /${surface}/:id: a signed-in principal without content.read is refused 403 for a row that exists`, async (t) => {
    const { baseUrl, owner, bare } = await boot(t);
    const row = await createRow(baseUrl, owner, surface, `Fetched ${surface} row`);

    await expectForbidden(
      await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}/${row.id}`, { headers: { cookie: bare } }),
      "content.read"
    );
    // The slug form of the same URL is gated identically (both resolve through getAdminPostByIdOrSlug).
    await expectForbidden(
      await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}/${row.slug}`, { headers: { cookie: bare } }),
      "content.read"
    );

    const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}/${row.id}`, { headers: { cookie: owner } });
    assert.equal(allowed.status, 200);
  });
}

test("POST /pages: a signed-in principal without content.write is refused 403 and no page is created", async (t) => {
  const { deps, baseUrl, bare } = await boot(t);
  const before = (await deps.postRepo.list({ workspaceId: WS })).length;

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bare },
    body: JSON.stringify({ title: "Should Not Exist" }),
  });
  await expectForbidden(res, "content.write");

  const after = await deps.postRepo.list({ workspaceId: WS });
  assert.equal(after.length, before);
  assert.equal(after.some((row) => row.title === "Should Not Exist"), false);
});

test("PUT /pages/:id: a signed-in principal without content.write is refused 403 and the page is unchanged", async (t) => {
  const { deps, baseUrl, owner, bare } = await boot(t);
  const page = await createRow(baseUrl, owner, "pages", "Untouchable Page");
  const before = await deps.postRepo.findById({ workspaceId: WS, id: page.id });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${page.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bare },
    body: JSON.stringify({ title: "Hijacked", slug: "hijacked", bodyJson: { type: "doc", content: [] }, status: "published" }),
  });
  await expectForbidden(res, "content.write");

  assert.deepEqual(await deps.postRepo.findById({ workspaceId: WS, id: page.id }), before);
});
