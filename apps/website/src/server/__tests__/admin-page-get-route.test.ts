import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../runtime/composition/app.js";

/**
 * @file `GET /pages/:pageId` (`src/server/routes/admin/pages/get-by-id.ts`) — certifies the
 * id-or-slug lookup the admin Pages editor's URL now depends on
 * (`getAdminPostByIdOrSlug`, `src/features/post/post.ts`): a Page resolves by its slug (the new
 * URL shape) or by its real id (an old bookmark, kept working for free by the same lookup trying
 * id first), and a Post can be dragged onto this surface through neither identifier — same
 * real-HTTP-against-the-real-composition-root harness as `admin-page-html-route.test.ts`.
 */

const WS = "workspace-local";

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const server = createServer(createApp());
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

  return { baseUrl, cookie };
}

async function createRow(baseUrl: string, cookie: string, surface: "posts" | "pages", title: string) {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await response.text();
  assert.equal(response.status, 201, `creating a ${surface} fixture failed: ${raw}`);
  return (JSON.parse(raw) as { post: { id: string; slug: string } }).post;
}

async function getPage(baseUrl: string, cookie: string, idOrSlug: string) {
  const response = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WS}/pages/${idOrSlug}`, {
    headers: { cookie },
  });
  return { status: response.status, body: await response.text() };
}

test("GET /pages/:idOrSlug resolves a Page by its slug", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createRow(baseUrl, cookie, "pages", "Pricing");

  const { status, body } = await getPage(baseUrl, cookie, page.slug);

  assert.equal(status, 200, body);
  assert.equal((JSON.parse(body) as { post: { id: string } }).post.id, page.id);
});

test("GET /pages/:idOrSlug still resolves a Page by its real id (bookmark compatibility)", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const page = await createRow(baseUrl, cookie, "pages", "Pricing");

  const { status, body } = await getPage(baseUrl, cookie, page.id);

  assert.equal(status, 200, body);
  assert.equal((JSON.parse(body) as { post: { slug: string } }).post.slug, page.slug);
});

test("GET /pages/:idOrSlug 404s a Post's slug — kind mismatch, indistinguishable from not-found", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createRow(baseUrl, cookie, "posts", "A blog post");

  const { status, body } = await getPage(baseUrl, cookie, post.slug);

  assert.equal(status, 404, body);
  assert.equal((JSON.parse(body) as { code: string }).code, "ENTRY_NOT_FOUND");
});

test("GET /pages/:idOrSlug 404s a Post's id too", async (t) => {
  const { baseUrl, cookie } = await startServer(t);
  const post = await createRow(baseUrl, cookie, "posts", "A blog post");

  const { status, body } = await getPage(baseUrl, cookie, post.id);

  assert.equal(status, 404, body);
  assert.equal((JSON.parse(body) as { code: string }).code, "ENTRY_NOT_FOUND");
});

test("GET /pages/:idOrSlug 404s a value that matches neither an id nor a slug", async (t) => {
  const { baseUrl, cookie } = await startServer(t);

  const { status, body } = await getPage(baseUrl, cookie, "no-such-page");

  assert.equal(status, 404, body);
  assert.equal((JSON.parse(body) as { code: string }).code, "ENTRY_NOT_FOUND");
});
