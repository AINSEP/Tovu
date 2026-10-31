import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { exportSite } from "#src/features/site-export/index";

/**
 * @file Bug D (2026-10-22): public post dates are the SITE's calendar day (`core.site.timezone`),
 * rendered server-side so static pages are right without JavaScript. 07:30 UTC on Mar 4 is 23:30 on
 * Mar 3 in Los Angeles; the stored instant (`<time datetime>`) never changes.
 */

const WORKSPACE_ID = createRouteDeps().workspaceId;
const LATE_EVENING_LA = "2026-03-04T07:30:00.000Z";

function theme(body: string): DiscoveredTheme {
  return {
    manifest: { id: "tz-test-theme", name: "TZ Test Theme", version: "1.0.0", tier: "static", engine: 1, templates: [], publishedPages: ["blog"] },
    dir: "/nonexistent/tz-test-theme", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { index: "<html><body><main>home</main></body></html>", blog: `<html><body>${body}</body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
}

const PREVIEWS = `<div class="grid" data-embed-config='{"type":"post-previews","limit":6}'>fallback</div>`;
const CONTENT = `<div data-embed-config='{"type":"content","id":"late"}'>fallback</div>`;

const post = {
  id: "late", workspaceId: WORKSPACE_ID, title: "Late Post", slug: "late-post", bodyJson: { type: "doc", content: [] }, bodyFormat: "doc",
  bodyHtml: null, status: "published", kind: "post", updatedAt: LATE_EVENING_LA, publishAt: LATE_EVENING_LA, version: 1,
} as unknown as PostRecord;

async function blogHtml(t: TestContext, overrides: Partial<ReturnType<typeof createRouteDeps>>, body: string): Promise<string> {
  const deps = { ...createRouteDeps(), themes: [theme(body)], postRepo: new InMemoryPostRepo([post]), ...overrides };
  await deps.siteTitleReady;
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/blog`)).text();
}

const losAngeles = { siteTimeZone: { resolveTimeZone: async () => "America/Los_Angeles" } };
const LA_TIME = `<time datetime="${LATE_EVENING_LA}">Mar 3, 2026</time>`;
const UTC_TIME = `<time datetime="${LATE_EVENING_LA}">Mar 4, 2026</time>`;

test("post-previews cards date a post by the site's calendar day", async (t) => {
  const html = await blogHtml(t, losAngeles, PREVIEWS);
  assert.ok(html.includes(LA_TIME), html);
});

test("a content marker's post header dates the post by the site's calendar day", async (t) => {
  const html = await blogHtml(t, losAngeles, CONTENT);
  assert.ok(html.includes(LA_TIME), html);
});

test("the composed app reads core.site.timezone: an owner value overrides the server's UTC zone", async (t) => {
  useProcessZone(t, "UTC");
  assert.ok((await blogHtml(t, {}, PREVIEWS)).includes(UTC_TIME));
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  await deps.set({
    deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.idGen, authorize: async () => ({ allowed: true, reason: "test" }), principals: deps.principalRepo },
    input: { namespace: "core.site", key: "timezone", scope: "workspace", workspaceId: deps.workspaceId, authWorkspaceId: deps.workspaceId, value: "America/Los_Angeles", callerPrincipalId: "owner" },
  });
  const html = await blogHtml(t, { settingsRepo: deps.settingsRepo, siteTimeZone: deps.siteTimeZone! }, PREVIEWS);
  assert.ok(html.includes(LA_TIME), html);
});

/** Change the actual Intl timezone boundary without mocking the date resolver or renderer. */
function useProcessZone(t: TestContext, zone: string): void {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

const OCTOBER_INSTANT = "2026-10-31T03:30:00.000Z";
const octoberPost = { ...post, publishAt: OCTOBER_INSTANT, updatedAt: OCTOBER_INSTANT };
const OCTOBER_TIME = `<time datetime="${OCTOBER_INSTANT}">Oct 30, 2026</time>`;

test("an unconfigured Pacific site's content and preview markers show Oct 30 without browser JavaScript", async (t) => {
  useProcessZone(t, "America/Los_Angeles");
  for (const marker of [CONTENT, PREVIEWS]) {
    const html = await blogHtml(t, { postRepo: new InMemoryPostRepo([octoberPost]) }, marker);
    assert.ok(html.includes(OCTOBER_TIME), html);
  }
});

test("an unconfigured Pacific site's page content marker uses the same local date", async (t) => {
  useProcessZone(t, "America/Los_Angeles");
  const page = { ...octoberPost, kind: "page" as const };
  const html = await blogHtml(t, { postRepo: new InMemoryPostRepo([page]) }, CONTENT);
  assert.ok(html.includes(OCTOBER_TIME), html);
});

test("an unconfigured Pacific site's Liquid article and listing use the same local date", async (t) => {
  useProcessZone(t, "America/Los_Angeles");
  for (const route of ["/", "/late-post"]) {
    assert.equal(await liquidPageText(t, { postRepo: new InMemoryPostRepo([octoberPost]) }, route),
      `2026-10-30|2026-10-30|${OCTOBER_INSTANT}`);
  }
});

test("static export writes the Pacific date into article and listing HTML with unchanged ISO instants", async (t) => {
  useProcessZone(t, "America/Los_Angeles");
  const deps = createRouteDeps();
  await deps.siteTitleReady;
  const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-date-export-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const staticTheme = theme(CONTENT + PREVIEWS);
  // The export copies the theme directory, so it must exist; an empty one is enough here.
  staticTheme.dir = mkdtempSync(path.join(tmpdir(), "tovu-date-theme-"));
  t.after(() => rmSync(staticTheme.dir, { recursive: true, force: true }));
  staticTheme.manifest.templates = ["article.html"];
  staticTheme.pages.article = `<html><body>${CONTENT}</body></html>`;
  deps.themes = [staticTheme];
  deps.postRepo = new InMemoryPostRepo([{ ...octoberPost, templateChoice: "article.html" }]);
  const report = await exportSite({ routeDeps: deps, outputDir, includeThemePreviews: false });
  for (const routePath of ["/blog", "/late-post"]) {
    const route = report.routes.succeeded.find(item => item.path === routePath);
    assert.ok(route, JSON.stringify(report.routes));
    const html = readFileSync(path.join(outputDir, route.outputFile), "utf8");
    assert.ok(html.includes(OCTOBER_TIME), html);
  }
});

/** A templated (Liquid) theme whose home and post templates print `dateShort` and the `| date:` filter. */
function liquidTheme(): DiscoveredTheme {
  const dates = "@@{{ p.dateShort }}|{{ p.date | date: '%Y-%m-%d' }}|{{ p.date }}@@";
  return {
    manifest: { id: "tz-liquid", name: "TZ Liquid", version: "1.0.0", tier: "templated", engine: 1, templates: [] },
    dir: "/nonexistent/tz-liquid", tokens: {}, tokensLight: {}, templates: {}, handlebarsTemplates: {}, pages: {}, partials: {}, css: "",
    liquidTemplates: { home: `{% for p in posts %}${dates}{% endfor %}`, post: `{% assign p = post %}${dates}` },
    source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
}

async function liquidPageText(t: TestContext, overrides: Partial<ReturnType<typeof createRouteDeps>>, path: string): Promise<string> {
  const deps = { ...createRouteDeps(), themes: [liquidTheme()], postRepo: new InMemoryPostRepo([post]), ...overrides };
  await deps.siteTitleReady;
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const html = await (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`)).text();
  return html.slice(html.indexOf("@@") + 2, html.lastIndexOf("@@"));
}

test("a Liquid theme's home list and post page show dateShort and | date: in the site's zone; post.date stays the instant", async (t) => {
  useProcessZone(t, "UTC"); // "without a zone" now means the server's zone; pin it as the UTC case.
  for (const path of ["/", "/late-post"]) {
    assert.equal(await liquidPageText(t, losAngeles, path), `2026-03-03|2026-03-03|${LATE_EVENING_LA}`, path);
    assert.equal(await liquidPageText(t, {}, path), `2026-03-04|2026-03-04|${LATE_EVENING_LA}`, `${path} without a zone`);
  }
});
