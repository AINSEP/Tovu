import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { PostRecord, PostRepoPort } from "#src/features/post/index";
import { InMemoryPostRepo, ROOT_SLUG } from "#src/features/post/index";
import type { MemberSessionRecord } from "#src/features/members/index";
import { InMemoryMemberSessionRepo } from "#src/features/members/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file End-to-end coverage for the post-previews marker (2026-09-03) — the `{"type":"post-previews"}`
 * marker `features/theme/static-render.ts`'s `injectPostPreviewsEmbeds` resolves, wired through
 * `server/inbound/public-http/routes/site/pages.ts`'s `resolvePostPreviewsForRender`. Same real-HTTP,
 * in-memory-repo technique `static-menu-embed-resolution.test.ts` (this directory) already uses for
 * the sibling `{"type":"menu"}` marker.
 *
 * Covers: the marker renders real published posts; member-gated posts are excluded exactly as the
 * home listing excludes them (ADR-030 §4); a marker's own `limit` is respected; a page WITHOUT the
 * marker triggers no bounded post-previews query at all and renders unaffected; a Page claiming the
 * reserved `/` root slug never appears in a listing.
 */

const WORKSPACE_ID = createRouteDeps().workspaceId;
const RAW_MEMBER_TOKEN = "test-raw-member-session-token-for-post-previews";

function themeWithPostPreviewsMarker(markerConfig = '{"type":"post-previews","limit":6}'): DiscoveredTheme {
  const marker = `<div class="grid" data-embed-config='${markerConfig}'>fallback card</div>`;
  return {
    manifest: {
      id: "static-post-previews-test-theme",
      name: "Static Post Previews Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
      // Off by default (2026-08-30 owner decision) — opt the two pages under test in explicitly.
      publishedPages: ["blog", "about"],
    },
    dir: "/nonexistent/post-previews-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      blog: `<html><body>${marker}<main>blog</main></body></html>`,
      // Deliberately carries NO post-previews marker — the "pay for the query only when present"
      // control page.
      about: "<html><body><main>about, no marker here</main></body></html>",
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function publishedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "A real published post",
    slug: "a-real-published-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

function activeMemberSession(): MemberSessionRecord {
  return {
    id: "session-post-previews-test",
    workspaceId: WORKSPACE_ID,
    memberId: "member-post-previews-test-1",
    tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"),
    createdAt: "2026-09-02T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

/** Wraps a real `PostRepoPort`, counting `listPublishedPreviews` calls — the observable proof that
 *  the route layer skips the bounded post-previews query entirely for a page carrying no marker
 *  (REQ 2), rather than merely asserting on rendered output. */
class CountingPostRepo implements PostRepoPort {
  listPublishedPreviewsCalls = 0;
  constructor(private readonly inner: PostRepoPort) {}
  findById(required: { workspaceId: string; id: string }) {
    return this.inner.findById(required);
  }
  findBySlug(required: { workspaceId: string; slug: string }) {
    return this.inner.findBySlug(required);
  }
  list(required: { workspaceId: string }) {
    return this.inner.list(required);
  }
  listPublishedPreviews(required: { workspaceId: string; limit: number }) {
    this.listPublishedPreviewsCalls += 1;
    return this.inner.listPublishedPreviews(required);
  }
  save(record: PostRecord) {
    return this.inner.save(record);
  }
  softDelete(required: { workspaceId: string; id: string; deletedAt: string; updatedAt: string; version: number }) {
    return this.inner.softDelete(required);
  }
}

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /blog: the post-previews marker renders real published posts, replacing the theme's authored fallback", async (t) => {
  const posts = [
    publishedPost({ id: "post-a", slug: "post-a", title: "Post A", updatedAt: "2026-09-01T00:00:00.000Z" }),
    publishedPost({ id: "post-b", slug: "post-b", title: "Post B", updatedAt: "2026-08-01T00:00:00.000Z" }),
  ];
  const { server, baseUrl } = await startServer({ themes: [themeWithPostPreviewsMarker()], postRepo: new InMemoryPostRepo(posts) });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/blog`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Post A/, "a real published post must appear in the marker's output");
  assert.match(html, /Post B/);
  assert.match(html, /href="\/post-a"/, "a preview must link to the post's real public path");
  assert.doesNotMatch(html, /fallback card/, "real posts must replace the theme's authored fallback, not sit alongside it");
});

test("GET /blog: a draft post never appears in the marker's output", async (t) => {
  const posts = [
    publishedPost({ id: "published", slug: "published", title: "Published Title" }),
    publishedPost({ id: "draft", slug: "draft", title: "Draft Title", status: "draft" }),
  ];
  const { server, baseUrl } = await startServer({ themes: [themeWithPostPreviewsMarker()], postRepo: new InMemoryPostRepo(posts) });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/blog`);
  const html = await res.text();
  assert.match(html, /Published Title/);
  assert.doesNotMatch(html, /Draft Title/, "a draft must never reach a public listing");
});

test("GET /blog: a members-only post is excluded from an anonymous visitor's previews, exactly like the home listing", async (t) => {
  const gated = publishedPost({
    id: "gated",
    slug: "gated-post",
    title: "Members Only Preview Post",
    memberAccessJson: JSON.stringify({ visibility: "members" }),
  });
  const publicPost = publishedPost({ id: "public", slug: "public-post", title: "Public Preview Post" });
  const { server, baseUrl } = await startServer({ themes: [themeWithPostPreviewsMarker()], postRepo: new InMemoryPostRepo([gated, publicPost]) });
  t.after(() => closeServer(server));

  const anonRes = await fetch(`${baseUrl}/blog`);
  const anonHtml = await anonRes.text();
  assert.match(anonHtml, /Public Preview Post/, "positive control: a public post must still render");
  assert.doesNotMatch(anonHtml, /Members Only Preview Post/, "a gated post must not advertise its title to an anonymous visitor");

  const { server: memberServer, baseUrl: memberBaseUrl } = await startServer({
    themes: [themeWithPostPreviewsMarker()],
    postRepo: new InMemoryPostRepo([gated, publicPost]),
    memberSessionRepo: new InMemoryMemberSessionRepo([activeMemberSession()]),
  });
  t.after(() => closeServer(memberServer));
  const memberRes = await fetch(`${memberBaseUrl}/blog`, { headers: { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` } });
  const memberHtml = await memberRes.text();
  assert.match(memberHtml, /Members Only Preview Post/, "an entitled, signed-in member DOES see the gated post in previews");
});

test("GET /blog: the marker's own limit bounds how many posts render", async (t) => {
  const posts = [1, 2, 3].map((n) =>
    publishedPost({ id: `post-${n}`, slug: `post-${n}`, title: `Limit Test Post ${n}`, updatedAt: `2026-0${n}-01T00:00:00.000Z` })
  );
  const { server, baseUrl } = await startServer({
    themes: [themeWithPostPreviewsMarker('{"type":"post-previews","limit":2}')],
    postRepo: new InMemoryPostRepo(posts),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/blog`);
  const html = await res.text();
  // Newest updatedAt first (post-3, post-2); the oldest (post-1) must be excluded by the limit.
  assert.match(html, /Limit Test Post 3/);
  assert.match(html, /Limit Test Post 2/);
  assert.doesNotMatch(html, /Limit Test Post 1/, "a marker with limit=2 must show only its two most recent posts");
});

test("GET /about: a page WITHOUT the post-previews marker triggers NO bounded query and renders unaffected", async (t) => {
  const countingRepo = new CountingPostRepo(new InMemoryPostRepo([publishedPost()]));
  const { server, baseUrl } = await startServer({ themes: [themeWithPostPreviewsMarker()], postRepo: countingRepo });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/about`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /about, no marker here/, "the page must render exactly as authored");
  assert.equal(countingRepo.listPublishedPreviewsCalls, 0, "a page carrying no post-previews marker must never trigger the bounded posts query");
});

test("GET /blog: a Page claiming the reserved '/' root slug never appears in the previews listing", async (t) => {
  const rootPage = publishedPost({
    id: "root-page",
    slug: ROOT_SLUG,
    title: "Root Page Title Must Never Appear In Previews",
    kind: "page",
  });
  const realPost = publishedPost({ id: "real-post", slug: "real-post", title: "Real Post Title" });
  const { server, baseUrl } = await startServer({ themes: [themeWithPostPreviewsMarker()], postRepo: new InMemoryPostRepo([rootPage, realPost]) });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/blog`);
  const html = await res.text();
  assert.match(html, /Real Post Title/, "positive control: a real post still renders");
  assert.doesNotMatch(html, /Root Page Title Must Never Appear In Previews/, "a Page (kind: \"page\"), including the one claiming '/', must never appear in a post-previews listing");
});
