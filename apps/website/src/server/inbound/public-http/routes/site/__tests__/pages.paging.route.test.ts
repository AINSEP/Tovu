/** Bug C (2026-10-22) — a `paged` post-previews listing is served page by page: `/blog`,
 *  `/blog/page/2`, … and `/page/2` for the home page, each with a rel=prev/next nav, so posts past
 *  the first page are reachable by link instead of stopping at one batch of 24. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express, { type NextFunction, type Request, type Response } from "express";

import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { registerResolvePhase } from "#src/platform/routing/adapter";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerSiteRoutes } from "../pages.js";

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

// --- redirect rules see the numbered page's own URL (A-1, 2026-10-22) ----------------------------
// The `/page/<n>` rewrite points the request at its parent page; redirect rules must still be
// matched against the URL the visitor asked for, never the parent's.

/** Registers a `phase` redirect rule for exactly `from`, revoked when the test ends. */
function redirectRule(t: TestContext, phase: "pre_content" | "post_content", from: string, location: string): void {
  t.after(registerResolvePhase({ phase, resolver: async (path) => (path === from ? { kind: "redirect", location, statusCode: 301 } : null) }));
}

async function redirectOf(url: string): Promise<{ status: number; location: string | null }> {
  const res = await fetch(url, { redirect: "manual" });
  await res.arrayBuffer();
  return { status: res.status, location: res.headers.get("location") };
}

test("GET /old-slug/page/3: a redirect rule on the numbered URL fires when its parent page does not exist", async (t) => {
  const baseUrl = await boot(t, 30);
  redirectRule(t, "post_content", "/old-slug/page/3", "/blog/page/2");

  assert.deepEqual(await redirectOf(`${baseUrl}/old-slug/page/3`), { status: 301, location: "/blog/page/2" });
});

test("GET /blog/page/3: a redirect rule on a numbered page past the last fires instead of the 404", async (t) => {
  const baseUrl = await boot(t, 30);
  redirectRule(t, "post_content", "/blog/page/3", "/blog");

  assert.deepEqual(await redirectOf(`${baseUrl}/blog/page/3`), { status: 301, location: "/blog" });
});

test("GET /blog/page/2: an override rule on the numbered URL fires; one on /blog does not catch /blog/page/2", async (t) => {
  const baseUrl = await boot(t, 30);
  redirectRule(t, "pre_content", "/blog/page/2", "/archive");
  redirectRule(t, "pre_content", "/blog", "/elsewhere");

  assert.deepEqual(await redirectOf(`${baseUrl}/blog/page/2`), { status: 301, location: "/archive" });
  assert.deepEqual(await redirectOf(`${baseUrl}/blog`), { status: 301, location: "/elsewhere" });
});

test("GET /about-old/page/2: a not-found rule on the missing parent does not catch its numbered pages", async (t) => {
  const baseUrl = await boot(t, 30);
  redirectRule(t, "post_content", "/about-old", "/about");

  assert.deepEqual(await redirectOf(`${baseUrl}/about-old/page/2`), { status: 404, location: null });
  assert.deepEqual(await redirectOf(`${baseUrl}/about-old`), { status: 301, location: "/about" });
});

test("GET /page/2: an override rule on / does not catch the home page's numbered pages", async (t) => {
  const baseUrl = await boot(t, 25, { index: `<html><body>${PAGED}</body></html>` });
  redirectRule(t, "pre_content", "/", "/welcome");

  assert.deepEqual(await redirectOf(`${baseUrl}/page/2`), { status: 200, location: null });
  assert.deepEqual(await redirectOf(`${baseUrl}/`), { status: 301, location: "/welcome" });
});

test("GET /about/page/2: a redirect lookup that throws on a numbered page with no listing is handed to Express's error handling", async (t) => {
  const failure = new Error("redirect phase down");
  const seen: unknown[] = [];
  const app = express();
  registerSiteRoutes(app, { ...createRouteDeps(), themes: [theme({})], postRepo: new InMemoryPostRepo(posts(30)) });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    seen.push(err);
    res.status(500).send("error handler");
  });
  const baseUrl = await startTestServer(app, t);
  t.after(registerResolvePhase({ phase: "post_content", resolver: async () => { throw failure; } }));

  const res = await fetch(`${baseUrl}/about/page/2`);

  assert.equal(res.status, 500);
  assert.equal(await res.text(), "error handler");
  assert.deepEqual(seen, [failure]);
});
