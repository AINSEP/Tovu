/** Bug C (2026-10-22) — a `paged` post-previews listing is served page by page: `/blog`,
 *  `/blog/page/2`, … and `/page/2` for the home page, each with a rel=prev/next nav, so posts past
 *  the first page are reachable by link instead of stopping at one batch of 24. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

type Deps = ReturnType<typeof createRouteDeps>;

const WORKSPACE_ID = createRouteDeps().workspaceId;
const PAGED = `<div class="grid" data-embed-config='{"type":"post-previews","limit":24,"paged":true}'>No posts yet.</div>`;

function theme(pages: Record<string, string>): DiscoveredTheme {
  return {
    manifest: { id: "paging-theme", name: "Paging Theme", version: "1.0.0", tier: "static", engine: 1, templates: ["listing.html"], publishedPages: ["blog", "about"] },
    dir: "/nonexistent/paging-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      blog: `<html><body>${PAGED}</body></html>`,
      about: "<html><body><main>about</main></body></html>",
      listing: `<html><body><main><div data-embed-config='{"type":"content"}'></div></main>${PAGED}</body></html>`,
      ...pages,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

/** `count` published posts, newest first (`post-0` is the newest). */
function posts(count: number): PostRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    workspaceId: WORKSPACE_ID,
    id: `p-${i}`,
    slug: `post-${i}`,
    title: `Post ${i}`,
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishAt: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
    version: 1,
  }) as PostRecord);
}

async function boot(t: TestContext, count: number, pages: Record<string, string> = {}, extra: PostRecord[] = []): Promise<string> {
  const deps: Deps = { ...createRouteDeps(), themes: [theme(pages)], postRepo: new InMemoryPostRepo([...posts(count), ...extra]) };
  return startTestServer(createApp(deps), t);
}

function cardCount(html: string): number {
  return html.match(/<article class="post-card">/g)?.length ?? 0;
}

test("GET /blog: a paged listing of 30 posts shows the first 24 and links to page 2", async (t) => {
  const baseUrl = await boot(t, 30);
  const res = await fetch(`${baseUrl}/blog`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.equal(cardCount(html), 24);
  assert.match(html, /<nav class="jini-pagination" aria-label="Pagination"><span class="jini-pagination-status">Page 1 of 2<\/span> <a class="jini-pagination-next" rel="next" href="\/blog\/page\/2">Older posts<\/a><\/nav>/);
});

test("GET /blog/page/2: serves the older posts with a link back to /blog", async (t) => {
  const baseUrl = await boot(t, 30);
  const res = await fetch(`${baseUrl}/blog/page/2`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.equal(cardCount(html), 6);
  assert.match(html, /href="\/post-24"/);
  assert.match(html, /href="\/post-29"/);
  assert.doesNotMatch(html, /href="\/post-23"/);
  assert.match(html, /<a class="jini-pagination-prev" rel="prev" href="\/blog">Newer posts<\/a> <span class="jini-pagination-status">Page 2 of 2<\/span><\/nav>/);
});

test("GET /blog/page/3: a page past the last answers 404", async (t) => {
  const baseUrl = await boot(t, 30);
  assert.equal((await fetch(`${baseUrl}/blog/page/3`)).status, 404);
});

test("GET /blog: exactly 24 posts is one page, with no nav", async (t) => {
  const baseUrl = await boot(t, 24);
  const html = await (await fetch(`${baseUrl}/blog`)).text();

  assert.equal(cardCount(html), 24);
  assert.doesNotMatch(html, /jini-pagination/);
  assert.equal((await fetch(`${baseUrl}/blog/page/2`)).status, 404);
});

test("GET /page/2: the home page's own paged listing is served at /page/2", async (t) => {
  const baseUrl = await boot(t, 25, { index: `<html><body>${PAGED}</body></html>` });
  const res = await fetch(`${baseUrl}/page/2/`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.equal(cardCount(html), 1);
  assert.match(html, /<a class="jini-pagination-prev" rel="prev" href="\/">Newer posts<\/a>/);
});

test("GET /about/page/2 and /page/2: a page with no paged listing answers 404, not a duplicate of itself", async (t) => {
  const baseUrl = await boot(t, 30);
  assert.equal((await fetch(`${baseUrl}/about/page/2`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/page/2`)).status, 404);
});

test("GET /news/page/2: a Page rendered through a template carrying a paged listing pages too", async (t) => {
  const [news] = posts(1);
  const page = { ...news, id: "news-page", slug: "news", title: "News", kind: "page", templateChoice: "listing.html", publishAt: undefined } as PostRecord;
  const baseUrl = await boot(t, 30, {}, [page]);
  const res = await fetch(`${baseUrl}/news/page/2`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.equal(cardCount(html), 6);
  assert.match(html, /rel="prev" href="\/news"/);
});
