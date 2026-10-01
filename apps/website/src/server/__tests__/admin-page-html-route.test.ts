import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { loginAsBarePrincipal } from "./helpers/http-test-server.js";

/**
 * @file SPEC-047 — `PUT /pages/:pageId/html`, the write path a bespoke-HTML Page is authored
 * through, exercised over real HTTP against the real composition root (same harness as
 * `admin-post-page-delete-routes.test.ts`, no route-stack mocking).
 *
 * What is certified here is the whole chain the Pages editor depends on and that nothing else in
 * the codebase could previously reach: a Page is created `doc`-format by the ordinary create route,
 * the first html write converts it, later writes are ordinary updates, a metadata edit through the
 * SEPARATE `PUT /pages/:pageId` route leaves the html body untouched, and a Post cannot be dragged
 * onto this surface at all.
 */

const WS = "workspace-local";

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const originalPassword = process.env.TOVU_ADMIN_PASSWORD;
  delete process.env.TOVU_ADMIN_PASSWORD;
  t.after(async () => {
    if (originalPassword === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = originalPassword;
  });
  const deps = createRouteDeps();
  const server = createServer(createApp(deps));
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

async function createRow(baseUrl: string, cookie: string, surface: "posts" | "pages", title: string) {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await response.text();
  assert.equal(response.status, 201, `creating a ${surface} fixture failed: ${raw}`);
  return (JSON.parse(raw) as { post: { id: string } }).post.id;
}

async function putHtml(baseUrl: string, cookie: string, id: string, html: string) {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${id}/html`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ html }),
  });
  return { status: response.status, body: await response.text() };
}

test("PUT /pages/:id/html converts a doc-format Page to html on the first write and returns the html body", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const pageId = await createRow(baseUrl, cookie, "pages", "Pricing");

  const generated = `<section data-agent-element="page-hero" data-agent-role="region"><h1>Pricing</h1></section>`;
  const { status, body } = await putHtml(baseUrl, cookie, pageId, generated);

  assert.equal(status, 200, body);
  const { post } = JSON.parse(body) as { post: { bodyFormat: string; bodyHtml: string; bodyJson: unknown } };
  assert.equal(post.bodyFormat, "html", "the first write must birth the html row");
  assert.equal(post.bodyHtml, generated);
  assert.equal(post.bodyJson, null, "the discriminated response must not carry both bodies");
  const readback = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${pageId}`, { headers: { cookie } });
  assert.equal(readback.status, 200);
  const saved = await readback.json() as { post: { bodyFormat: string; bodyHtml: string } };
  assert.equal(saved.post.bodyFormat, "html");
  assert.equal(saved.post.bodyHtml, generated);
});

test("HTML writes require pages.edit_html even when the caller holds content.write", async (t) => {
  const { baseUrl, cookie, deps } = await startServer(t);
  const pageId = await createRow(baseUrl, cookie, "pages", "Restricted HTML");
  const before = await deps.postRepo.findById({ workspaceId: WS, id: pageId });
  const restricted = await loginAsBarePrincipal(deps, baseUrl, { username: "html-editor" });
  const principal = await deps.userRepo.findByUsername({ workspaceId: WS, username: "html-editor" });
  assert.ok(principal);
  const policyId = "html-editor-policy";
  await deps.policyRepo.save({ id: policyId, workspaceId: WS, name: policyId, isBuiltin: false, isFrozen: false });
  await deps.principalPolicyRepo.save({ id: "html-editor-link", workspaceId: WS, principalId: principal.principalId, policyId });
  await deps.policyPermissionRepo.save({ id: "html-editor-write", workspaceId: WS, policyId, permission: "content.write", resourceType: null, constraintJson: null });
  assert.equal((await deps.authorize({ principalId: principal.principalId, workspaceId: WS, permission: "content.write" })).allowed, true);
  const anonymous = await putHtml(baseUrl, "", pageId, "<script>attack()</script>");
  assert.equal(anonymous.status, 401);
  const denied = await putHtml(baseUrl, restricted, pageId, "<script>attack()</script>");
  assert.equal(denied.status, 403);
  const error = JSON.parse(denied.body) as { code: string; details: { permission: string } };
  assert.equal(error.code, "FORBIDDEN");
  assert.equal(error.details.permission, "pages.edit_html");
  assert.deepEqual(await deps.postRepo.findById({ workspaceId: WS, id: pageId }), before);
  await deps.policyPermissionRepo.save({ id: "html-editor-html", workspaceId: WS, policyId, permission: "pages.edit_html", resourceType: null, constraintJson: null });
  assert.equal((await putHtml(baseUrl, restricted, pageId, "<p>permitted</p>")).status, 200);
});

test("PUT /pages/:id/html is repeatable — a second write replaces the body without re-seeding the skeleton", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const pageId = await createRow(baseUrl, cookie, "pages", "Pricing");

  await putHtml(baseUrl, cookie, pageId, "<p>first</p>");
  const { status, body } = await putHtml(baseUrl, cookie, pageId, "<p>second</p>");

  assert.equal(status, 200, body);
  const { post } = JSON.parse(body) as { post: { bodyFormat: string; bodyHtml: string } };
  assert.equal(post.bodyFormat, "html");
  assert.equal(post.bodyHtml, "<p>second</p>");
});

test("editing a bespoke-HTML Page's title through PUT /pages/:id leaves its html body intact", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const pageId = await createRow(baseUrl, cookie, "pages", "Pricing");
  const generated = `<section data-agent-element="page-body" data-agent-role="region"><p>Real content</p></section>`;
  await putHtml(baseUrl, cookie, pageId, generated);

  // The metadata route — a genuinely different server-side write path from the html one above.
  // This is the exact sequence that used to destroy the generated page.
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${pageId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Pricing and plans", slug: "pricing-and-plans", status: "published" }),
  });
  const raw = await response.text();
  assert.equal(response.status, 200, raw);

  const { post } = JSON.parse(raw) as { post: { title: string; bodyFormat: string; bodyHtml: string } };
  assert.equal(post.title, "Pricing and plans");
  assert.equal(post.bodyFormat, "html", "a title edit must not convert the Page back to doc format");
  assert.equal(post.bodyHtml, generated, "the generated body must survive a metadata edit verbatim");
});

test("PUT /pages/:id/html refuses a Post id — a Post is never bespoke HTML", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const postId = await createRow(baseUrl, cookie, "posts", "A blog post");

  const { status, body } = await putHtml(baseUrl, cookie, postId, "<p>nope</p>");

  assert.equal(status, 400, body);
  assert.equal((JSON.parse(body) as { code: string }).code, "KIND_MISMATCH");
});

test("PUT /pages/:id/html 404s for an id that does not exist, and 400s a non-string html", async (t) => {
  const { baseUrl, cookie } = await startServer(t);

  const missing = await putHtml(baseUrl, cookie, "no-such-page", "<p>x</p>");
  assert.equal(missing.status, 404, missing.body);

  const pageId = await createRow(baseUrl, cookie, "pages", "Pricing");
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${pageId}/html`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ html: { not: "a string" } }),
  });
  assert.equal(response.status, 400);
  const oversized = await putHtml(baseUrl, cookie, pageId, "x".repeat(2 * 1024 * 1024));
  assert.equal(oversized.status, 413);
});
