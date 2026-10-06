import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { MediaRecord } from "#src/features/media/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Regression (2026-10-05 visual check): the admin REST post/page update accepted a VIDEO
 * media id as `featuredMediaId` (the picker offered videos and the save landed), while the
 * `content_post_update` chat tool already refused it. Both arms now run the same
 * `features/post/featured-image.ts` check, so a non-image, unknown or trashed asset is a 400
 * `VALIDATION_ERROR` here.
 */

const WS = "workspace-local";
const NOW = "2026-10-05T00:00:00.000Z";
const EMPTY_DOC = { type: "doc", content: [] };

function mediaRecord(overrides: Partial<MediaRecord>): MediaRecord {
  return {
    id: "m-img",
    workspaceId: WS,
    title: "Hero",
    slug: "hero-featured",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "sha-featured-img" },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  } as MediaRecord;
}

async function seedMedia(deps: RouteDeps): Promise<void> {
  await deps.mediaRepo.save(mediaRecord({}));
  await deps.mediaRepo.save(mediaRecord({ id: "m-vid", slug: "clip-featured", source: { sha256: "sha-featured-vid" } }));
  await deps.mediaRepo.save(mediaRecord({ id: "m-trash", slug: "old-featured", status: "trashed", source: { sha256: "sha-featured-old" } }));
  await deps.mediaContentTypeStore.set({ workspaceId: WS, sha256: "sha-featured-img", contentType: "image/png" });
  await deps.mediaContentTypeStore.set({ workspaceId: WS, sha256: "sha-featured-vid", contentType: "video/mp4" });
}

async function startServer(t: { after: (fn: () => Promise<void>) => void }) {
  const deps = createRouteDeps();
  await seedMedia(deps);
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
  return { baseUrl, cookie };
}

async function createRow(server: { baseUrl: string; cookie: string }, surface: "posts" | "pages", title: string) {
  const res = await fetch(`${server.baseUrl}/api/admin/v1/workspaces/${WS}/${surface}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: server.cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, `creating a ${surface} fixture failed: ${raw}`);
  return (JSON.parse(raw) as { post: { id: string; slug: string } }).post;
}

async function putFeatured(server: { baseUrl: string; cookie: string }, surface: "posts" | "pages", row: { id: string; slug: string }, featuredMediaId: unknown) {
  const res = await fetch(`${server.baseUrl}/api/admin/v1/workspaces/${WS}/${surface}/${row.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: server.cookie },
    body: JSON.stringify({ title: "Featured", slug: row.slug, bodyJson: EMPTY_DOC, status: "draft", featuredMediaId }),
  });
  return { status: res.status, body: JSON.parse(await res.text()) as { error?: string; code?: string; post?: { featuredMediaId?: string } } };
}

test("PUT posts/:postId refuses a video as featuredMediaId with a 400 VALIDATION_ERROR", async (t) => {
  const server = await startServer(t);
  const row = await createRow(server, "posts", "Video Featured");
  const res = await putFeatured(server, "posts", row, "m-vid");
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "VALIDATION_ERROR");
  assert.equal(res.body.error, "featuredMediaId: media asset 'm-vid' is video/mp4, not an image. A featured image must be an image.");
});

test("PUT posts/:postId refuses an unknown or trashed featuredMediaId", async (t) => {
  const server = await startServer(t);
  const row = await createRow(server, "posts", "Missing Featured");
  const missing = await putFeatured(server, "posts", row, "m-nope");
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "featuredMediaId: no media asset has the id 'm-nope'.");
  const trashed = await putFeatured(server, "posts", row, "m-trash");
  assert.equal(trashed.status, 400);
  assert.equal(trashed.body.error, "featuredMediaId: media asset 'm-trash' is in Trash. Restore it first, or pick another image.");
});

test("PUT posts/:postId stores an image featuredMediaId, and null still clears it", async (t) => {
  const server = await startServer(t);
  const row = await createRow(server, "posts", "Image Featured");
  const set = await putFeatured(server, "posts", row, "m-img");
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.post?.featuredMediaId, "m-img");
  const cleared = await putFeatured(server, "posts", row, null);
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.post?.featuredMediaId, undefined);
});

test("PUT posts/:postId stores the asset id when given the media slug", async (t) => {
  const server = await startServer(t);
  const row = await createRow(server, "posts", "Slug Featured");
  const res = await putFeatured(server, "posts", row, "hero-featured");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.post?.featuredMediaId, "m-img");
});

test("PUT pages/:pageId refuses a video as featuredMediaId with a 400 VALIDATION_ERROR", async (t) => {
  const server = await startServer(t);
  const row = await createRow(server, "pages", "Video Featured Page");
  const res = await putFeatured(server, "pages", row, "m-vid");
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "featuredMediaId: media asset 'm-vid' is video/mp4, not an image. A featured image must be an image.");
});
