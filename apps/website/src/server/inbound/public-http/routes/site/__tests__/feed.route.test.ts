import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import { registerFeedRoute } from "../feed.js";

/**
 * @file `GET /feed.xml` (RSS 2.0): the latest published, publicly visible, indexable blog posts
 * (never pages, drafts, trashed or gated posts), absolute links, XML-escaped text.
 */

function buildFeedOnlyApp(depsOverrides: Partial<SeoRouteDeps>): express.Express {
  const deps: SeoRouteDeps = { ...createRouteDeps(), ...depsOverrides };
  const app = express();
  registerFeedRoute(app, deps);
  return app;
}

function post(overrides: Partial<PostRecord>): PostRecord {
  return {
    id: "feed-post",
    workspaceId: createRouteDeps().workspaceId,
    title: "A post",
    slug: "a-post",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First paragraph text." }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-09-01T10:00:00.000Z",
    version: 1,
    seoExtJson: null,
    memberAccessJson: null,
    ...overrides,
  } as unknown as PostRecord;
}

async function fetchFeed(t: test.TestContext, posts: PostRecord[]): Promise<{ res: Response; body: string }> {
  const app = buildFeedOnlyApp({ postRepo: new InMemoryPostRepo(posts) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/feed.xml`);
  return { res, body: await res.text() };
}

test("GET /feed.xml: RSS 2.0 with the sitemap's cache header, an absolute item link, date and excerpt", async (t) => {
  const { res, body } = await fetchFeed(t, [post({})]);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/rss\+xml/);
  assert.equal(res.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
  assert.match(body, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(body, /<atom:link href="http:\/\/localhost:3000\/feed\.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(body, /<channel>\n {4}<title>[^<]+<\/title>\n {4}<link>http:\/\/localhost:3000\/<\/link>/);
  assert.match(
    body,
    /<item>\n {6}<title>A post<\/title>\n {6}<link>http:\/\/localhost:3000\/a-post<\/link>\n {6}<guid isPermaLink="true">http:\/\/localhost:3000\/a-post<\/guid>\n {6}<pubDate>Tue, 01 Sep 2026 10:00:00 GMT<\/pubDate>\n {6}<description>First paragraph text\.<\/description>\n {4}<\/item>/
  );
});

test("GET /feed.xml: & < ' in a title are XML-escaped", async (t) => {
  const { body } = await fetchFeed(t, [post({ title: "Rock & <Roll> isn't dead" })]);
  assert.match(body, /<title>Rock &amp; &lt;Roll&gt; isn&apos;t dead<\/title>/);
});

test("GET /feed.xml: drafts, pages, trashed and members-only posts are excluded", async (t) => {
  const { body } = await fetchFeed(t, [
    post({ id: "p-live", slug: "live", title: "Live post" }),
    post({ id: "p-draft", slug: "draft", title: "Draft post", status: "draft" }),
    post({ id: "p-page", slug: "about", title: "About page", kind: "page" }),
    post({ id: "p-trash", slug: "gone", title: "Trashed post", deletedAt: "2026-09-02T00:00:00.000Z" }),
    post({ id: "p-members", slug: "secret", title: "Members post", memberAccessJson: JSON.stringify({ visibility: "members" }) }),
  ]);
  assert.match(body, /<title>Live post<\/title>/);
  for (const hidden of ["Draft post", "About page", "Trashed post", "Members post"]) assert.doesNotMatch(body, new RegExp(hidden));
});

test("GET /feed.xml: newest first, at most 20 items", async (t) => {
  const posts = Array.from({ length: 25 }, (_, i) =>
    post({ id: `p-${i}`, slug: `post-${i}`, title: `Post ${i}`, updatedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() })
  );
  const { body } = await fetchFeed(t, posts);
  const titles = [...body.matchAll(/<item>\n {6}<title>([^<]+)<\/title>/g)].map((m) => m[1]);
  assert.equal(titles.length, 20);
  assert.equal(titles[0], "Post 24");
  assert.equal(titles[19], "Post 5");
});

test("GET /feed.xml: a post-read failure is a plain-text 500", async (t) => {
  const postRepo = new InMemoryPostRepo([]);
  postRepo.list = async () => {
    throw new Error("post store unavailable");
  };
  const app = buildFeedOnlyApp({ postRepo });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/feed.xml`);
  assert.equal(res.status, 500);
  assert.equal(await res.text(), "internal error");
});
