import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { MediaRecord } from "#src/features/media/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Regression (2026-10-05): the SEO image fields (per-entry `ogImage`/`twitterImage`, site
 * `defaultOgImage`) stored a VIDEO media ref, the same defect the post featured image had. Both SEO
 * write routes now run the featured image's own content-type check on a `{idOrSlug}:{transform}`
 * ref, so a known non-image asset is a 400. An absolute URL, and a ref whose asset is missing or
 * trashed, are stored as before (the head render already skips those fail-soft, EC-07).
 */

const WS = "workspace-local";
const NOW = "2026-10-05T00:00:00.000Z";

function mediaRecord(overrides: Partial<MediaRecord>): MediaRecord {
  return {
    id: "m-seo-img",
    workspaceId: WS,
    title: "Share",
    slug: "share-seo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "sha-seo-img" },
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
  await deps.mediaRepo.save(mediaRecord({ id: "m-seo-vid", slug: "clip-seo", source: { sha256: "sha-seo-vid" } }));
  await deps.mediaContentTypeStore.set({ workspaceId: WS, sha256: "sha-seo-img", contentType: "image/png" });
  await deps.mediaContentTypeStore.set({ workspaceId: WS, sha256: "sha-seo-vid", contentType: "video/mp4" });
}

type Server = { baseUrl: string; cookie: string };

async function startServer(t: { after: (fn: () => Promise<void>) => void }): Promise<Server> {
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

async function createPost(server: Server, title: string): Promise<string> {
  const res = await fetch(`${server.baseUrl}/api/admin/v1/workspaces/${WS}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: server.cookie },
    body: JSON.stringify({ title }),
  });
  const raw = await res.text();
  assert.equal(res.status, 201, `creating a post fixture failed: ${raw}`);
  return (JSON.parse(raw) as { post: { id: string } }).post.id;
}

async function put(server: Server, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${server.baseUrl}/api/admin/v1/workspaces/${WS}/seo/${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: server.cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: JSON.parse(await res.text()) as { error?: string; code?: string } };
}

test("PUT seo/entries/:entryId refuses a video as ogImage or twitterImage with a 400", async (t) => {
  const server = await startServer(t);
  const entryId = await createPost(server, "Video OG");
  const og = await put(server, `entries/${entryId}`, { ogImage: "clip-seo:og" });
  assert.equal(og.status, 400);
  assert.equal(og.body.code, "SEO_FIELD_VALIDATION_ERROR");
  assert.equal(og.body.error, "ogImage: media asset 'clip-seo' is video/mp4, not an image. A social share image must be an image.");
  const twitter = await put(server, `entries/${entryId}`, { twitterImage: "m-seo-vid:og" });
  assert.equal(twitter.status, 400);
  assert.equal(twitter.body.error, "twitterImage: media asset 'm-seo-vid' is video/mp4, not an image. A social share image must be an image.");
});

test("PUT seo/entries/:entryId still stores an image ref, an absolute URL, and a ref to a missing asset", async (t) => {
  const server = await startServer(t);
  const entryId = await createPost(server, "Image OG");
  for (const ogImage of ["share-seo:og", "https://cdn.example/og.png", "m-seo-gone:og"]) {
    const res = await put(server, `entries/${entryId}`, { ogImage });
    assert.equal(res.status, 200, `${ogImage}: ${JSON.stringify(res.body)}`);
  }
});

test("PUT seo/settings refuses a video as defaultOgImage with a 400, and still stores an image ref", async (t) => {
  const server = await startServer(t);
  const video = await put(server, "settings", { defaultOgImage: "clip-seo:og" });
  assert.equal(video.status, 400);
  assert.equal(video.body.code, "SEO_SETTINGS_VALIDATION_ERROR");
  assert.equal(video.body.error, "defaultOgImage: media asset 'clip-seo' is video/mp4, not an image. A social share image must be an image.");
  const image = await put(server, "settings", { defaultOgImage: "share-seo:og" });
  assert.equal(image.status, 200, JSON.stringify(image.body));
});
