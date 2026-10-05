import assert from "node:assert/strict";
import { Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { UUID } from "@jini-ai/core/primitives";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { PostRepoPort, PostRecord } from "#src/features/post/index";
import type { RedirectRecord } from "#src/features/redirects/index";
import { registerTransform, uploadMedia } from "#src/features/media/index";
import { setPublicAssistantSettings } from "#src/assistant/index";
import { startTestServer } from "../../../server/__tests__/helpers/http-test-server.js";
import { ExportOutputNotEmptyError, exportSite, firstExportFailure, redirectOutcomeFor } from "../site-exporter.js";
import type { ExportReport } from "../site-exporter.js";

/**
 * @file Regression coverage for `exportSite` (SPEC — static site exporter, 2026-08-15).
 *
 * Runs the REAL exporter against `server/app.ts`'s own seeded demo workspace (the same fixture
 * `route-manifest.test.ts` uses), over a real in-process HTTP server — no mocked render path, per
 * this feature's own "do not write a second renderer" rule.
 */

function makeTmpOutputDir(): string {
  return mkdtempSync(path.join(tmpdir(), "tovu-export-test-"));
}

/** Delegates every `PostRepoPort` method to a real `InMemoryPostRepo` EXCEPT `findBySlug`, which
 *  throws for one chosen slug — reproducing "a route that fails to render" (`pages.ts`'s `GET
 *  /:slug` catches any non-`PostNotFoundError` into a bare 500) without corrupting the rest of the
 *  seeded fixture, so the test can assert every OTHER route still exports successfully. */
class FailingSlugPostRepo implements PostRepoPort {
  constructor(
    private readonly inner: PostRepoPort,
    private readonly failSlug: string
  ) {}
  findById(required: { workspaceId: UUID; id: UUID }): Promise<PostRecord | null> {
    return this.inner.findById(required);
  }
  findBySlug(required: { workspaceId: UUID; slug: string }): Promise<PostRecord | null> {
    if (required.slug === this.failSlug) throw new Error("forced failure for export-engine regression test");
    return this.inner.findBySlug(required);
  }
  list(required: { workspaceId: UUID }): Promise<PostRecord[]> {
    return this.inner.list(required);
  }
  listPublishedPreviews(required: { workspaceId: UUID; limit: number }): Promise<PostRecord[]> {
    return this.inner.listPublishedPreviews(required);
  }
  save(record: PostRecord): Promise<void> {
    return this.inner.save(record);
  }
  saveIfVersion(required: Parameters<PostRepoPort["saveIfVersion"]>[0]) {
    return this.inner.saveIfVersion(required);
  }
  hardDelete(required: { workspaceId: UUID; id: UUID }): Promise<void> {
    return this.inner.hardDelete(required);
  }
  softDelete(required: { workspaceId: UUID; id: UUID; deletedAt: string; updatedAt: string; version: number }): Promise<void> {
    return this.inner.softDelete(required);
  }
  readAutosave(required: { workspaceId: UUID; id: UUID }) {
    return this.inner.readAutosave(required);
  }
  writeAutosave(required: Parameters<PostRepoPort["writeAutosave"]>[0]) {
    return this.inner.writeAutosave(required);
  }
  clearAutosave(required: { workspaceId: UUID; id: UUID }) {
    return this.inner.clearAutosave(required);
  }
  appendRevision(input: Parameters<PostRepoPort["appendRevision"]>[0]) {
    return this.inner.appendRevision(input);
  }
  listRevisions(required: Parameters<PostRepoPort["listRevisions"]>[0]) {
    return this.inner.listRevisions(required);
  }
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.inner.transaction(fn);
  }
}

test("exportSite: --base-path unset leaves every written byte identical to a plain export", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  assert.equal(report.basePath, undefined);
  assert.equal(report.basePathRewriteWarning, undefined);

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /href="\/welcome"/, "an internal link must stay bare root-relative when no base path is requested");
  assert.match(home, /href="\/theme-assets\/tovu-starter\//, "a theme asset reference must stay bare root-relative when no base path is requested");

  // `createRouteDeps()` seeds a verified `dev-capability` origin (`http://localhost:3000`,
  // `pages.route.test.ts`'s own precedent) for the seeded workspace, so both <loc> (2026-09-03 fix)
  // and the Sitemap: line (2026-09-04 fix) are absolute, not the bare relative paths this assertion
  // checked before either fix landed.
  const sitemap = readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>http:\/\/localhost:3000\/welcome<\/loc>/);

  const robots = readFileSync(path.join(outputDir, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: http:\/\/localhost:3000\/sitemap\.xml$/m);

  // The RSS feed is written exactly as served: feed readers need absolute links, and the base-path
  // rewrite has nothing to add to them.
  const feed = readFileSync(path.join(outputDir, "feed.xml"), "utf8");
  assert.match(feed, /<link>http:\/\/localhost:3000\/welcome<\/link>/);
  assert.equal(feed.includes("/my-repo"), false, "the feed must not be base-path rewritten");
});

const alwaysAllowAssistantSettingsWrite = async () => ({ allowed: true, reason: "test" });

/** Turns the ADR-054 visitor-chat switch ON for `deps`'s seeded workspace — same recipe
 *  `server/__tests__/site-assistant-routes.test.ts` uses, including awaiting `siteTitleReady`
 *  first (`InMemorySettingsRepo.transaction` is not reentrant, and `createRouteDeps()`'s own
 *  boot-time settings registrations are still in flight until then). */
async function enablePublicAssistant(deps: ReturnType<typeof createRouteDeps>): Promise<void> {
  await deps.siteTitleReady;
  await setPublicAssistantSettings(
    {
      settingsRepo: deps.settingsRepo,
      getEffective: deps.getEffective,
      set: deps.set,
      clock: deps.clock,
      ids: deps.idGen,
      authorize: alwaysAllowAssistantSettingsWrite,
      principals: deps.principalRepo,
    },
    { workspaceId: deps.workspaceId, patch: { publicEnabled: true }, callerPrincipalId: "test-caller" }
  );
}

/** The seeded demo workspace has no storefront products, which would leave `products.ts`'s two
 *  handlers out of both the crawl and these widget tests — one sample-store product brings them in. */
function withOneSampleProduct(deps: ReturnType<typeof createRouteDeps>): void {
  deps.store = {
    listProducts: async () => [{ id: "prod-widget-1", slug: "widget-mug", title: "Widget Mug", price: 1200, stock: 3, version: 1 }],
    checkout: async () => ({ ok: false, reason: "not-found", retries: 0 }),
  };
}

/**
 * Static-export chat-widget gap (2026-09-27, owner decision): a static export/static-publish
 * ships no `/api/site-assistant/chat` endpoint for the visitor-chat bubble to call, so an exported
 * page must never carry the bubble's markup at all, regardless of the workspace's own
 * `site.assistant.public_enabled` setting. The LIVE server (same `deps`, same setting) is
 * asserted in the SAME test to still ship the widget — proving the omission is scoped to the
 * export path (`site-exporter.ts`'s `exportFetch` header, resolved by `routes/site/pages.ts`'s
 * `resolveSiteAssistantEnabledForRequest`) and is not a regression of the ADR-054 switch itself.
 */
test("exportSite: the site-assistant widget is OFF in a static export even when the workspace setting is enabled", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  withOneSampleProduct(deps);

  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  const liveHome = await (await fetch(`${baseUrl}/`)).text();
  assert.match(liveHome, /\/site-chat\/site-assistant\.js/, "the live server must still ship the widget when the setting is on");

  const report = await exportSite({ routeDeps: deps, outputDir });
  assert.equal(report.routes.failed.length, 0, "every route must still export successfully with the setting on");

  const exportedHome = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.doesNotMatch(
    exportedHome,
    /site-assistant/,
    "a static export must ship NO site-assistant markup at all — there is no /api/site-assistant/chat endpoint on a static host for the bubble to talk to"
  );

  // Every route family the crawl wrote, not only the home page — a render handler that resolves the
  // switch without the static-export carve-out would leak the widget into exactly its own files.
  const htmlFiles = (readdirSync(outputDir, { recursive: true }) as string[]).filter((f) => f.endsWith(".html"));
  const families = new Set(htmlFiles.map((f) => (f === "index.html" ? "home" : f.startsWith("products") ? "products" : "slug")));
  assert.deepEqual([...families].sort(), ["home", "products", "slug"], `the fixture must exercise every widget-rendering route family; wrote ${htmlFiles.join(", ")}`);
  for (const file of htmlFiles) {
    assert.doesNotMatch(readFileSync(path.join(outputDir, file), "utf8"), /site-assistant/, `${file} must ship no site-assistant markup`);
  }
});

/**
 * The static-export marker header is public: anyone can send it to the LIVE server. Honoring it is
 * harmless for that one visitor (they just don't get the bubble), but the widget-less body must never
 * be stored by a shared cache under the plain URL — every page response is otherwise `public,
 * max-age=60` with no `Vary`, so one crafted request would strip the widget from every visitor behind
 * that cache for minutes. Covers each of the four handlers that resolve the switch.
 */
test("live site: a request carrying the static-export marker gets no widget AND a never-store Cache-Control", async (t) => {
  const deps = createRouteDeps();
  await enablePublicAssistant(deps);
  withOneSampleProduct(deps);
  const baseUrl = await startTestServer(createApp(deps), t);

  const slugRoute = (await listPublishedSlugPaths(deps))[0];
  assert.ok(slugRoute, "the seeded fixture must publish at least one /:slug page");

  for (const route of ["/", slugRoute, "/products", "/products/widget-mug"]) {
    const live = await fetch(`${baseUrl}${route}`);
    assert.match(await live.text(), /\/site-chat\/site-assistant\.css[\s\S]*\/site-chat\/site-assistant\.js/, `${route}: live must ship both widget assets`);
    assert.match(live.headers.get("cache-control") ?? "", /^public/, `${route}: an ordinary live response stays publicly cacheable`);

    const marked = await fetch(`${baseUrl}${route}`, { headers: { "x-tovu-static-export": "1" } });
    assert.doesNotMatch(await marked.text(), /site-assistant/, `${route}: the marked request must carry no widget`);
    assert.equal(marked.headers.get("cache-control"), "private, no-store", `${route}: a widget-less body must never be stored by a shared cache`);
  }
});

/** The `/:slug` paths of the seeded workspace's published pages/posts (excluding the `/` home row). */
async function listPublishedSlugPaths(deps: ReturnType<typeof createRouteDeps>): Promise<string[]> {
  const rows = await deps.postRepo.list({ workspaceId: deps.workspaceId });
  return rows.filter((p) => p.status === "published" && p.slug !== "/").map((p) => `/${p.slug}`);
}

/**
 * LAN-bind plan (2026-09-23), Slice 1: the exporter's own temporary server (`site-exporter.ts:879`,
 * `server.listen(0)`) was bound to every interface for the length of an export — briefly
 * LAN-reachable on a machine without a firewall. Its own client already dials `127.0.0.1`
 * (`:882`), so binding the listener to `127.0.0.1` too costs nothing and closes the gap. Reuses the
 * `base.createSiteApp` seam the CSS-url-following test above already established: a first
 * middleware records `req.socket.localAddress` for every request the crawl makes, which is exactly
 * the peer-visible bind surface a LAN client vs. a loopback client would differ on.
 */
test("exportSite: the exporter's own temporary server is bound to 127.0.0.1, not every interface", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const boundAddresses: string[] = [];
  const address = Server.prototype.address;
  t.mock.method(Server.prototype, "address", function (this: Server) {
    const result = address.call(this);
    if (result && typeof result === "object") boundAddresses.push(result.address);
    return result;
  });
  const recordedLocalAddresses: string[] = [];
  base.createSiteApp = () => {
    const wrapper = express();
    wrapper.use((req, _res, next) => {
      recordedLocalAddresses.push(req.socket.localAddress ?? "");
      next();
    });
    wrapper.use(createApp(base));
    return wrapper;
  };

  await exportSite({ routeDeps: base, outputDir });

  assert.ok(boundAddresses.length > 0);
  assert.deepEqual([...new Set(boundAddresses)], ["127.0.0.1"], "inspect the listener bind, which differs from the accepted socket address");
  assert.ok(recordedLocalAddresses.length > 0, "the crawl must have made at least one request for this assertion to mean anything");
  for (const addr of recordedLocalAddresses) {
    assert.equal(addr, "127.0.0.1", "every request the export crawl makes must land on a listener bound to 127.0.0.1, not an every-interface bind");
  }
});

test("exportSite: --base-path rewrites HTML hrefs, leaves the already-absolute sitemap <loc> entries and robots.txt's Sitemap line untouched, and never double-prefixes anything already prefixed", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir, basePath: "my-repo" });

  assert.equal(report.basePath, "/my-repo", "a bare 'my-repo' flag value normalizes to a leading-slash, no-trailing-slash form");
  assert.ok(report.basePathRewriteWarning && report.basePathRewriteWarning.length > 0, "the disclosed limit must be reported whenever a base path is set");
  assert.deepEqual(report.assets.failed, [], "the crawl must still discover assets from the RAW (unprefixed) response the live server actually sent");

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /href="\/my-repo\/welcome"/, "an internal link must carry the base path");
  assert.match(home, /href="\/my-repo\/theme-assets\/tovu-starter\//, "a theme asset reference must carry the base path");
  assert.equal(/href="\/(?!my-repo\/)/.test(home), false, "no root-relative href may survive un-prefixed once a base path is set");

  // `<loc>`/`Sitemap:` are absolute (the seeded workspace has a verified origin, see the previous
  // test's own comment) — `prefixRootRelativePath`'s own documented contract leaves an already-
  // absolute value UNTOUCHED rather than grafting `/my-repo` onto a foreign, fully-qualified URL that
  // was never part of this static export's own relative tree in the first place.
  const sitemap = readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>http:\/\/localhost:3000\/welcome<\/loc>/);

  const robots = readFileSync(path.join(outputDir, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: http:\/\/localhost:3000\/sitemap\.xml$/m);

  // Idempotency/no-double-prefix, checked across EVERY route this export actually wrote — not one
  // hand-picked value — because a doubling bug in the shared prefixRootRelativePath helper would
  // show up identically in any of them.
  for (const route of report.routes.succeeded) {
    assert.equal(route.data.includes("/my-repo/my-repo/"), false, `${route.path}: a path must never be prefixed twice`);
  }
});

test("exportSite: --base-path 'repo', '/repo', and '/repo/' all normalize to the same '/repo' and produce byte-identical output", async (t) => {
  // Characterizes normalizeBasePath's own documented contract (its file comment names exactly these
  // three input forms) — until now only the bare no-leading-slash form ("my-repo", above) had any
  // regression coverage, so the already-has-a-leading-slash short-circuit had never actually run.
  const results: { basePath: string | undefined; home: string }[] = [];
  for (const raw of ["repo", "/repo", "/repo/"]) {
    const outputDir = makeTmpOutputDir();
    t.after(() => rmSync(outputDir, { recursive: true, force: true }));
    const report = await exportSite({ routeDeps: createRouteDeps(), outputDir, basePath: raw });
    results.push({ basePath: report.basePath, home: readFileSync(path.join(outputDir, "index.html"), "utf8") });
  }

  for (const { basePath } of results) {
    assert.equal(basePath, "/repo");
  }
  assert.equal(results[1]!.home, results[0]!.home, "'/repo' must rewrite identically to 'repo'");
  assert.equal(results[2]!.home, results[0]!.home, "'/repo/' must rewrite identically to 'repo'");
});

test("exportSite: writes the expected file tree for the seeded demo workspace, with zero failures", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  assert.deepEqual(report.routes.failed, []);
  // This was a bare `assert.equal(..., 19)` — route-manifest.test.ts's own count against this exact
  // fixture at the time: 1 home + 2 well-known (robots.txt/sitemap.xml) + 8 theme pages + 7 posts
  // (the seeded "about" post is shadowed by the theme's own about.html) + 1 not-found probe. Two
  // later, independent, intentional decisions moved that to 13 (net -6) — NOT the tovu-com content
  // commits from the same session (those edit `sites/tovu-com/themes/...`, a different site's own
  // theme copy; this fixture reads `content/themes/static/basic`, which none of them touch):
  //   -7  `ThemeManifest.publishedPages` (theme.ts, 2026-08-30 owner correction, quoted in that
  //       field's own doc: "The pages are not published by default... because then they would have
  //       wrong information because they're generic themes"). Applies RETROACTIVELY to every theme
  //       with no recorded `publishedPages` array — this fixture's theme.json has none — so its 7
  //       standalone candidate pages with no colliding post (pricing, docs, blog, changelog,
  //       download, signin, signup) all now 404 before ever reaching the route manifest.
  //       route-manifest.test.ts's own `withPublishedPages` helper covers this same gate. "about" is
  //       unaffected: the seeded "about" POST already wins that slug regardless of the theme's own
  //       publish state (see the shadowed-about.html assertion below).
  //   +1  `8633b4ef` ("feat(seo): serve /llms.txt for AI crawlers") added /llms.txt as an
  //       always-mounted well-known convention route, after this count was first set.
  //   +1  2026-09-27: the seed gained a `kind: "page"` Blog row at /blog (seed.ts's `page-blog`),
  //       the target of the default theme's "Read the blog"/"All posts" links.
  //   +1  2026-09-28: /feed.xml (RSS), another always-mounted well-known route.
  // 19 - 7 + 1 + 1 + 1 = 15. Asserting the actual path LIST, not a bare count, so the next drift is legible
  // instead of a mystery integer.
  assert.deepEqual(
    report.routes.succeeded.map((r) => r.path).sort(),
    [
      "/",
      "/about",
      "/blog",
      "/feed.xml",
      "/how-plugins-work",
      "/how-themes-work",
      "/llms.txt",
      "/plugin-api",
      "/robots.txt",
      "/self-hosting",
      "/sitemap.xml",
      "/slow-mornings",
      "/the-weight-of-type",
      "/tovu-export-404-check",
      "/welcome",
    ]
  );

  assert.ok(existsSync(path.join(outputDir, "index.html")), "home");
  assert.ok(existsSync(path.join(outputDir, "robots.txt")), "well-known route at its literal filename, not a subfolder");
  assert.ok(existsSync(path.join(outputDir, "sitemap.xml")), "well-known route at its literal filename, not a subfolder");
  assert.ok(existsSync(path.join(outputDir, "about", "index.html")), "theme-owned static page");
  assert.ok(existsSync(path.join(outputDir, "welcome", "index.html")), "seeded published post");
  assert.ok(existsSync(path.join(outputDir, "404.html")), "404 probe written to the output root");

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /<!doctype html>/i, "home is a full HTML document, not a fragment");
  for (const file of ["index.html", "welcome/index.html", "404.html"]) {
    assert.match(readFileSync(path.join(outputDir, file), "utf8"), /<meta name="referrer" content="strict-origin-when-cross-origin">/, file);
  }
});

test("exportSite: every succeeded route/asset carries its own bytes and content-type as data, matching what's on disk", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  const home = report.routes.succeeded.find((r) => r.path === "/");
  if (!home) throw new Error("expected a '/' route in routes.succeeded");
  assert.equal(home.data, readFileSync(path.join(outputDir, home.outputFile), "utf8"), "data must match the file actually written, not just resemble it");
  assert.match(home.contentType ?? "", /text\/html/, "expected a real Content-Type captured from the response, not a guess from the extension");

  const sitemap = report.routes.succeeded.find((r) => r.path === "/sitemap.xml");
  if (!sitemap) throw new Error("expected /sitemap.xml in routes.succeeded");
  assert.match(sitemap.contentType ?? "", /xml/);

  const notFound = report.routes.succeeded.find((r) => r.kind === "not-found");
  if (!notFound) throw new Error("expected the not-found probe in routes.succeeded");
  assert.equal(notFound.outputFile, "404.html");
  assert.ok(notFound.data.length > 0);

  if (report.assets.succeeded.length === 0) throw new Error("expected at least one asset for this to be a meaningful check");
  for (const asset of report.assets.succeeded) {
    assert.ok(Buffer.isBuffer(asset.data), `${asset.url}: data must be a Buffer, not a string — assets can be binary`);
    assert.ok(
      asset.data.equals(readFileSync(path.join(outputDir, asset.outputFile))),
      `${asset.url}: data must be byte-identical to the file actually written`
    );
  }
});

test("exportSite: reports theme files present on disk but never rendered or crawled, without flagging real ones", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  // Pinned to "tovu-theme" rather than the seeded default: every assertion below is about that
  // theme's OWN page set (its `pages-default.html` template shell, its shadowed `about`/`pricing`
  // pages) — `tovu-starter` ships neither page, having dropped them in its own de-branding pass.
  const routeDeps = createRouteDeps();
  const currentPresentation = await routeDeps.presentationRepo.findByWorkspaceId({ workspaceId: routeDeps.workspaceId });
  await routeDeps.presentationRepo.save({ ...currentPresentation!, activeThemeId: "tovu-theme" });

  routeDeps.themes = routeDeps.themes.map((theme) => theme.manifest.id === "tovu-theme"
    ? { ...theme, manifest: { ...theme.manifest, publishedPages: ["docs"] } } : theme);
  const report = await exportSite({ routeDeps, outputDir });
  assert.ok(report.routes.succeeded.some((route) => route.path === "/docs" && route.kind === "theme-page"));
  assert.equal(report.unreferencedThemeFiles.includes("render/pages/docs.html"), false, "a published ordinary theme page was rendered");

  // A content-embedding template shell (route-manifest.ts's own file header): never its own route,
  // never linked from any rendered page — genuinely unreferenced, not a false positive. `basic` is
  // schema v2 (2026-08-18 migration), so its pages live under `render/pages/`, not a theme-root
  // `pages/` — see `findUnreferencedThemeFiles`'s own v1/v2 detection. The shell is
  // `pages-default.html` since 948706418 synced the shipped catalog to the posts-*/pages-* names
  // (38e022fc7); it was `page-shell.html` before.
  assert.ok(
    report.unreferencedThemeFiles.includes("render/pages/pages-default.html"),
    "a template shell is neither a rendered route nor a crawled asset — must be named, not silently absent"
  );
  assert.ok(report.unreferencedThemeFiles.includes("theme.json"), "the manifest file itself is never independently fetched");

  // The seeded "about" post shares the theme's "about" slug, and since the slug-collision tri-state
  // default flipped to "post wins" (`route-manifest.ts:154`, `pages.ts:780`), the theme's own
  // `render/pages/about.html` is never rendered as a route for this fixture — it is genuinely
  // unreferenced, not a false positive, and must be named here rather than silently absent.
  assert.ok(
    report.unreferencedThemeFiles.includes("render/pages/about.html"),
    "the theme's shadowed 'about' page is never rendered while the colliding post wins by default — must be reported unreferenced"
  );

  // `ThemeManifest.publishedPages` (2026-08-30 owner correction, `theme.ts` — see the route-count
  // test above for the full accounting): this fixture's theme.json ships no `publishedPages` array,
  // so every standalone candidate page defaults to unpublished, "pricing" included — GET /pricing
  // 404s before ever reaching a render, so `render/pages/pricing.html` is now genuinely unreferenced
  // too, the same class of true positive as the shadowed "about" page above, not a false one.
  assert.ok(
    report.unreferencedThemeFiles.includes("render/pages/pricing.html"),
    "pricing is unpublished by default (no publishedPages array on this fixture's theme.json) and is never rendered — must be reported unreferenced"
  );

  // Files this export DID account for — real pages, real assets — must never appear in the same
  // list, or the warning would be noise instead of signal. "index"/"404" stay structurally live
  // regardless of publish state (`NON_ROUTABLE_THEME_PAGE_IDS`, `theme.ts`), and the CSS/JS are
  // crawled assets, not standalone-page candidates the publish gate applies to at all.
  for (const shouldNotAppear of [
    "render/pages/index.html",
    "render/pages/404.html",
    "css/theme.css",
    "scripts/main.js",
  ]) {
    assert.equal(
      report.unreferencedThemeFiles.includes(shouldNotAppear),
      false,
      `'${shouldNotAppear}' was rendered/crawled by this export and must not be reported as unreferenced`
    );
  }
});

test("exportSite: crawls and writes theme assets referenced by rendered pages", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  assert.deepEqual(report.assets.failed, []);
  assert.ok(report.assets.succeeded.length > 0, "expected at least one asset referenced by the rendered pages");
  assert.ok(
    report.assets.succeeded.some((a) => a.url.startsWith("/theme-assets/tovu-starter/")),
    "expected the active 'basic' theme's own CSS/JS to be discovered and written"
  );
  const cssAsset = report.assets.succeeded.find((a) => a.url.endsWith(".css"));
  if (!cssAsset) throw new Error("expected at least one stylesheet asset");
  assert.ok(existsSync(path.join(outputDir, cssAsset.outputFile)));
});

test("exportSite: follows one hop out of a fetched CSS file's own url(...) reference and writes the referenced asset too", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  // The real seeded "basic" theme's own CSS ships no `url(...)` reference at all today (verified by
  // grep across every shipped theme — see this session's report), so the CSS second-hop crawl
  // (extractCssUrls/fetchAssets' cssRefs follow-up) has no real content fixture to exercise it
  // through the live app as-is. `theme-static-assets.ts` resolves a theme's on-disk folder from two
  // HARDCODED roots with no override seam reachable from RouteDeps, so a fixture theme directory
  // can't be substituted either without writing into the live `content/themes/static/` tree (shared by
  // 3 concurrent sessions tonight).
  //
  // Instead: `ExportSiteRouteDeps.createSiteApp` is itself the injectable seam — it already exists
  // for exactly this purpose (every test in this file uses `createRouteDeps()`'s real one). Here we
  // wrap the REAL app (unmodified, `createApp(base)` — the exact same composition every other test
  // exercises) with a thin Express layer, defined and torn down entirely within this test, that
  // intercepts ONLY the one real, already-linked-from-real-pages CSS request
  // (`/theme-assets/basic/css/theme.css`) and serves test-controlled bytes containing a genuine
  // relative `url(...)` reference, plus the one extra path that reference resolves to. Every other
  // request (every content route, every other real asset) falls through to the real app unchanged.
  // This is not a second renderer and not a production seam — it is the same "swap what `createSiteApp`
  // returns" pattern `FailingSlugPostRepo`/`ManifestOnlyRedirectRepo`-style tests in this file already
  // use for `postRepo`/`redirectRepo`, applied to the one remaining RouteDeps-shaped field that's
  // actually the seam for this.
  const base = createRouteDeps();
  // Also exercises extractCssUrls' three "nothing to fetch" skip conditions (a data: URI, an
  // absolute external URL — neither is a same-site path this exporter could ever fetch) and
  // fetchAssets' own already-seen dedup (the self-reference back to `theme.css` resolves to a URL
  // this queue already processed earlier in the same pass) — all in the one real CSS body, since
  // each is a genuine, independent branch this feature's own code must handle correctly.
  const CSS_WITH_URL_REFS = [
    ".icon { background-image: url(../images/coverage-test-injected-icon.svg); }",
    ".decorative { background-image: url(data:image/gif;base64,AAAA); }",
    ".external-font { src: url(https://fonts.example.com/font.woff2); }",
    ".self-reference { background-image: url(theme.css); }",
    // Also references a theme JS file that is ALREADY independently discovered by the HTML crawl
    // (queued from `initialUrls`, not yet processed when this CSS is parsed) — by the time the
    // queue reaches this pushed duplicate, main.js has already been dequeued and marked `seen` by
    // its own earlier queue entry, exercising fetchAssets' own top-of-loop dedup (a DIFFERENT branch
    // than the cssRefs-push-time filter the self-reference above exercises).
    ".already-linked { background: url(../scripts/main.js); }",
  ].join("\n");
  const INJECTED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
  base.createSiteApp = () => {
    const wrapper = express();
    wrapper.get("/theme-assets/tovu-starter/css/theme.css", (_req, res) => res.type("text/css").send(CSS_WITH_URL_REFS));
    wrapper.get("/theme-assets/tovu-starter/images/coverage-test-injected-icon.svg", (_req, res) =>
      res.type("image/svg+xml").send(INJECTED_SVG)
    );
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  assert.deepEqual(report.assets.failed, []);
  const cssAsset = report.assets.succeeded.find((a) => a.url === "/theme-assets/tovu-starter/css/theme.css");
  if (!cssAsset) throw new Error("expected the (intercepted) theme.css in assets.succeeded");
  assert.equal(cssAsset.data.toString("utf8"), CSS_WITH_URL_REFS);

  const followedAsset = report.assets.succeeded.find((a) => a.url === "/theme-assets/tovu-starter/images/coverage-test-injected-icon.svg");
  if (!followedAsset) {
    throw new Error("expected the CSS's own url(...) reference to be discovered and fetched as a second asset");
  }
  assert.equal(followedAsset.data.toString("utf8"), INJECTED_SVG);
  assert.ok(existsSync(path.join(outputDir, followedAsset.outputFile)));

  // The data:/external references must never be treated as fetchable site assets.
  assert.equal(
    report.assets.succeeded.some((a) => a.url.startsWith("data:") || a.url.startsWith("https://fonts.example.com")),
    false,
    "a data: URI or an absolute external URL must never be queued as a same-site asset fetch"
  );
  // theme.css itself must appear exactly once, even though the CSS also self-references it —
  // proving the already-seen URL was deduplicated, not fetched a second time.
  assert.equal(
    report.assets.succeeded.filter((a) => a.url === "/theme-assets/tovu-starter/css/theme.css").length,
    1,
    "a CSS file that references itself must not be queued and fetched twice"
  );
  // Same dedup guarantee for a CSS reference to an asset ALREADY independently discovered by the
  // HTML crawl (main.js is directly `<script src>`-linked from the rendered page too).
  assert.equal(
    report.assets.succeeded.filter((a) => a.url === "/theme-assets/tovu-starter/scripts/main.js").length,
    1,
    "an asset already queued from the HTML crawl must not be fetched twice just because a CSS file also references it"
  );
});

test("exportSite: an asset URL discovered via a CSS file's own url(...) reference that itself fails to fetch is reported as a failed asset", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const CSS_WITH_MISSING_REF = ".missing { background-image: url(../images/coverage-test-does-not-exist.png); }";
  base.createSiteApp = () => {
    const wrapper = express();
    wrapper.get("/theme-assets/tovu-starter/css/theme.css", (_req, res) => res.type("text/css").send(CSS_WITH_MISSING_REF));
    // Deliberately no handler for coverage-test-does-not-exist.png — falls through to the real
    // app's static-asset middleware, which 404s (the file genuinely does not exist on disk).
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  const failure = report.assets.failed.find((a) => a.url === "/theme-assets/tovu-starter/images/coverage-test-does-not-exist.png");
  if (!failure) throw new Error("expected the missing CSS-referenced asset in assets.failed");
  assert.match(failure.reason, /-> 404$/);
  assert.equal(
    report.assets.succeeded.some((a) => a.url === "/theme-assets/tovu-starter/images/coverage-test-does-not-exist.png"),
    false
  );
});

test("exportSite: refuses a non-empty output directory unless clean is set, and clears stale files when it is", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const staleFile = path.join(outputDir, "stale-from-a-previous-export.html");
  writeFileSync(staleFile, "leftover", "utf8");

  await assert.rejects(() => exportSite({ routeDeps: createRouteDeps(), outputDir }), ExportOutputNotEmptyError);
  assert.ok(existsSync(staleFile), "refusing must not have touched the existing contents");

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir, clean: true });
  assert.deepEqual(report.routes.failed, []);
  assert.equal(existsSync(staleFile), false, "clean:true must remove a previous export's stale files");
  assert.ok(existsSync(path.join(outputDir, "index.html")));
});

test("exportSite: creates outputDir when it does not exist yet, rather than requiring the caller to pre-create it", async (t) => {
  // Deliberately a path UNDER a real mkdtemp'd parent, but the leaf itself never created —
  // every other test in this file uses `makeTmpOutputDir()` (`mkdtempSync`), which always
  // pre-creates the directory, so `prepareOutputDir`'s "does not exist yet" branch is otherwise
  // never exercised.
  const parent = makeTmpOutputDir();
  const outputDir = path.join(parent, "not-created-yet");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  assert.equal(existsSync(outputDir), false, "precondition: the leaf directory must not already exist");

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  assert.deepEqual(report.routes.failed, []);
  assert.ok(existsSync(path.join(outputDir, "index.html")), "exportSite must create the missing directory itself");
});

test("exportSite: the non-empty-output-dir refusal message pluralizes 'entries' for more than one stale file", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  writeFileSync(path.join(outputDir, "stale-one.html"), "leftover", "utf8");
  writeFileSync(path.join(outputDir, "stale-two.html"), "leftover", "utf8");

  await assert.rejects(() => exportSite({ routeDeps: createRouteDeps(), outputDir }), (err: unknown) => {
    assert.ok(err instanceof ExportOutputNotEmptyError);
    assert.match(err.message, /\(2 existing entries\)/, "two or more stale entries must use the plural 'entries', not 'entry'");
    return true;
  });
});

test("exportSite: a route that fails to render is reported as a failure, not silently missing from the output", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const postRepo = new FailingSlugPostRepo(base.postRepo, "welcome");
  // MUTATED in place, not spread into a copy (`{ ...base, postRepo }`) — 2026-08-20 (RouteDeps-
  // narrowing pass 2): `base.createSiteApp` is a closure bound to THIS exact object identity, at
  // construction time, inside `createRouteDeps()` itself (same shape/gotcha as `RouteDeps.
  // exportSiteBound` — see that field's doc in `server/routes/types.ts`, generalized). A spread here
  // would produce a logically-overridden but DIFFERENT object identity that closure never sees, so
  // `exportSite`'s internal `routeDeps.createSiteApp()` call would boot the app against the
  // ORIGINAL, non-failing `postRepo` — the forced failure below would silently never happen, and
  // this test would fail loudly at the `welcomeFailure` assertion rather than proving anything.
  base.postRepo = postRepo;

  const report = await exportSite({ routeDeps: base, outputDir });

  const welcomeFailure = report.routes.failed.find((r) => r.path === "/welcome");
  if (!welcomeFailure) throw new Error("the forced failure must be reported in routes.failed");
  assert.match(welcomeFailure.reason, /500/);
  assert.equal(existsSync(path.join(outputDir, "welcome", "index.html")), false, "a failed route must not leave a file behind");

  // The forced failure is scoped to exactly one slug — every other route must still export.
  assert.ok(report.routes.succeeded.some((r) => r.path === "/"), "home must still succeed");
  assert.ok(report.routes.succeeded.some((r) => r.path === "/about"), "an unrelated theme page must still succeed");
});

test("exportSite: a post embedding a media image exports it under its readable /m/<slug>/... URL, not the id (readable-slugs S4/P7)", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const routeDeps = createRouteDeps();
  const { media } = await uploadMedia({
    deps: {
      clock: routeDeps.clock,
      idGen: routeDeps.idGen,
      mediaRepo: routeDeps.mediaRepo,
      blobRepo: routeDeps.assetBlobRepo,
      renditionRepo: routeDeps.assetRenditionRepo,
      blobStore: routeDeps.blobStore,
    },
    input: {
      workspaceId: routeDeps.workspaceId,
      bytes: new TextEncoder().encode("export-slugs-test-image-bytes"),
      filename: "export-test-cover.png",
      contentType: "image/png",
      createdByPrincipal: "user-1",
    },
  });
  // Registered explicitly, same as `seo-og-image-crawlability.test.ts`'s own `registerOgTransform` —
  // `ensureCoreMediaTransform`'s real boot registration is fire-and-forget (`composition/deps.ts`),
  // so a test that needs the "public" transform present registers it itself rather than racing boot.
  await registerTransform({
    deps: { clock: routeDeps.clock, idGen: routeDeps.idGen, transformRepo: routeDeps.transformDefinitionRepo },
    input: { workspaceId: routeDeps.workspaceId, name: "public", params: { format: "webp" }, owner: "core" },
  });
  await routeDeps.postRepo.save({
    id: randomUUID(),
    workspaceId: routeDeps.workspaceId,
    title: "Media Export Test",
    slug: "media-export-test",
    bodyJson: { type: "doc", content: [{ type: "image", attrs: { assetId: media.id, transformName: "public" } }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
  } as unknown as PostRecord);

  const report = await exportSite({ routeDeps, outputDir });

  assert.ok(
    report.routes.succeeded.some((r) => r.path === "/media-export-test"),
    "the post embedding the image must itself export successfully"
  );

  const imageAsset = report.assets.succeeded.find((a) => a.url.startsWith(`/m/${media.slug}/`));
  assert.ok(
    imageAsset,
    `expected a slug-keyed /m/${media.slug}/... asset among: ${report.assets.succeeded.map((a) => a.url).join(", ")}`
  );
  assert.ok(
    !report.assets.succeeded.some((a) => a.url.startsWith(`/m/${media.id}/`)),
    "the SAME asset must not ALSO be fetched/written under its id-keyed URL"
  );
  assert.ok(
    existsSync(path.join(outputDir, imageAsset!.outputFile)),
    "the exported image file must actually exist on disk, not just be reported as succeeded"
  );
});

test("exportSite: a route whose render hangs past the fetch timeout is recorded as a timed-out failure, not a crashed export", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  // `AbortSignal.timeout` is replaced with a deadline the TEST fires, never the wall clock: each
  // call records the requested duration and hands back a controller-owned signal that stays
  // pending. Only the `/welcome` interceptor below fires its deadline (with the same
  // `TimeoutError` a real `AbortSignal.timeout` raises), so every other route has no timer to
  // race, however slow its render is under load. `capturedMs` proves the production duration.
  const originalAbortTimeout = AbortSignal.timeout;
  const deadlines = new WeakMap<AbortSignal, AbortController>();
  let capturedMs: number | undefined;
  AbortSignal.timeout = ((ms: number) => {
    capturedMs = ms;
    const controller = new AbortController();
    deadlines.set(controller.signal, controller);
    return controller.signal;
  }) as typeof AbortSignal.timeout;

  // Only the `/welcome` request is ever intercepted — every other fetch (including the crawl's own
  // asset requests) goes through the REAL exporter over REAL HTTP, exactly like every other test in
  // this file, so this proves ONE hung route degrades in isolation rather than the whole export.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/welcome")) {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // no signal means pre-fix code: hang forever, matching the real bug.
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason));
        // The request hangs; its deadline expires. A signal the stub did not mint is never fired.
        deadlines.get(signal)?.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

    const welcomeFailure = report.routes.failed.find((r) => r.path === "/welcome");
    if (!welcomeFailure) throw new Error("the hung route must be reported in routes.failed, not silently dropped or left to crash the whole export");
    assert.match(welcomeFailure.reason, /timed out/);
    assert.equal(existsSync(path.join(outputDir, "welcome", "index.html")), false, "a timed-out route must not leave a file behind");

    // The hang is scoped to exactly one route — every other route must still export normally.
    assert.ok(report.routes.succeeded.some((r) => r.path === "/"), "home must still succeed");
    assert.ok(report.routes.succeeded.some((r) => r.path === "/about"), "an unrelated theme page must still succeed");

    assert.equal(capturedMs, 30_000, "the export fetch timeout must be a real, generous production duration — only its firing is driven by this test");
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalAbortTimeout;
  }
});

test("exportSite: an exact-match active redirect rule is exported as a static meta-refresh stub", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const now = new Date().toISOString();
  const rule: RedirectRecord = {
    id: "redir-export-test",
    workspaceId: base.workspaceId,
    matchType: "exact",
    fromPattern: "/old-page",
    // Deliberately carries an `&` so the written stub proves escapeHtmlAttr actually ran, not just
    // that some location string got embedded verbatim.
    toTarget: "/welcome?ref=export&utm_source=redirect-test",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  // Written via `save()` directly into the EXISTING `base.redirectRepo` instance — NOT
  // `base.redirectRepo = new InMemoryRedirectRepo([rule])`. `createRouteDeps()` wires the live app's
  // redirect-serving phase handler (`RedirectPhaseHandlerResolver`) to this exact repo OBJECT at
  // construction time (`server/app.ts`'s `registerRedirectsPhaseHandlers({ resolver: new
  // RedirectPhaseHandlerResolver({ repo: redirectRepo, ... }) })`) — a module-level registration, not
  // something `RouteDeps.redirectRepo` re-reads per request. Swapping the field to a fresh repo
  // instance (first attempt at this test) orphans it from that resolver: `buildRouteManifest` would
  // still enumerate the rule fine (it reads `deps.redirectRepo` fresh), but the live server never
  // actually serves the 3xx, so `writeRedirectRoute` observed a 404 instead.
  await base.redirectRepo.save({
    record: rule,
    revision: {
      redirectId: rule.id,
      workspaceId: rule.workspaceId,
      seq: 1,
      state: rule,
      tombstoned: false,
      actorId: "system",
      recordedAt: now,
    },
  });

  const report = await exportSite({ routeDeps: base, outputDir });

  const redirectFailure = report.routes.failed.find((r) => r.path === "/old-page");
  assert.equal(redirectFailure, undefined, `redirect route must not fail: ${JSON.stringify(redirectFailure)}`);
  const redirectSucceeded = report.routes.succeeded.find((r) => r.path === "/old-page");
  if (!redirectSucceeded) throw new Error("expected /old-page in routes.succeeded");
  assert.equal(redirectSucceeded.kind, "redirect");
  assert.equal(redirectSucceeded.outputFile, path.join("old-page", "index.html"));
  assert.equal(redirectSucceeded.contentType, "text/html; charset=utf-8", "an exporter-authored stub has no real response header to read, so this is a fixed value");

  const stub = readFileSync(path.join(outputDir, "old-page", "index.html"), "utf8");
  assert.match(stub, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  assert.equal(stub, redirectSucceeded.data, "the succeeded entry's data must match the bytes actually written");
  assert.match(stub, /<meta http-equiv="refresh" content="0; url=\/welcome\?ref=export&amp;utm_source=redirect-test">/, "the redirect target must be HTML-escaped (& -> &amp;) into the meta refresh");
  assert.match(stub, /<link rel="canonical" href="\/welcome\?ref=export&amp;utm_source=redirect-test">/);
  assert.match(stub, /Redirecting to <a href="\/welcome\?ref=export&amp;utm_source=redirect-test">/);
});

/**
 * Regression for the disclosed-but-unfixed `renderRedirectStub` XSS gap
 * (`ADS-memory/reports/2026-09-01-to-03-review-bugs.md` Finding 2): the same
 * `javascript:`-scheme class of stored XSS `a69f5892`/`0a41515c` (09-03) fixed
 * everywhere else `safeHref` now guards, left open here.
 *
 * A `javascript:` `toTarget` can never survive a REAL redirect rule's own
 * lifecycle: `createRedirect`/`updateRedirect`'s `assertTargetAllowed`
 * chokepoint (`features/redirects/redirects.ts`) and the live read-path
 * open-redirect oracle (`features/redirects/phase-handler.ts`'s
 * `RedirectPhaseHandlerResolver`) both reject any non-http(s) scheme via the
 * same `OriginRegistry.isAllowedRedirectTarget` — verified empirically: a real
 * end-to-end export of such a rule 404s (the live app never actually issues
 * the 3xx), so `writeRedirectRoute` never even reaches `renderRedirectStub`
 * with it. Written directly into `redirectRepo` below — bypassing both
 * chokepoints, the same "write straight into the repo instance" technique the
 * shadowing-prefix-rule test already uses — to reach the one branch that DOES
 * still carry an unvetted target into `renderRedirectStub` unfiltered:
 * `redirectOutcomeFor`'s own manifest-fallback, taken whenever a live response
 * is a real 3xx with no `Location` header (mocked below, mirroring the
 * crashed-404-page test's own fetch-interception technique) — the
 * `redirectTarget` this exporter then trusts verbatim as the manifest's hint.
 */
for (const target of ["javascript:alert(document.cookie)", "data:text/html,unsafe", "vbscript:msgbox(1)"]) {
test(`exportSite: a redirect stub safely renders ${target}`, async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const now = new Date().toISOString();
  const rule: RedirectRecord = {
    id: "redir-xss-fallback",
    workspaceId: base.workspaceId,
    matchType: "exact",
    fromPattern: "/xss-fallback-probe",
    toTarget: target,
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await base.redirectRepo.save({
    record: rule,
    revision: {
      redirectId: rule.id,
      workspaceId: rule.workspaceId,
      seq: 1,
      state: rule,
      tombstoned: false,
      actorId: "system",
      recordedAt: now,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/xss-fallback-probe")) {
      // A real 3xx with NO Location header — forces redirectOutcomeFor's manifest-fallback branch.
      return new Response("", { status: 301 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const report = await exportSite({ routeDeps: base, outputDir });

    const succeeded = report.routes.succeeded.find((r) => r.path === "/xss-fallback-probe");
    if (!succeeded) throw new Error(`expected /xss-fallback-probe in routes.succeeded: ${JSON.stringify(report.routes.failed)}`);

    const stub = readFileSync(path.join(outputDir, "xss-fallback-probe", "index.html"), "utf8");
    assert.equal(stub, `<!doctype html><html lang="en"><head><meta name="referrer" content="strict-origin-when-cross-origin"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=#"><link rel="canonical" href="#"><title>Redirecting…</title></head><body>Redirecting to <a href="#">${target}</a>.</body></html>\n`);
    assert.doesNotMatch(stub, /url=javascript:/i, "a javascript: target must never reach the meta-refresh url=");
    assert.doesNotMatch(stub, /href="javascript:/i, "a javascript: target must never reach a raw href attribute");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
}

test("exportSite: a prefix redirect rule shadowing the 404 probe's own path makes the probe fetch return <400, reported as a route failure", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const now = new Date().toISOString();
  // A `prefix` rule is skipped by route-manifest.ts (`buildRedirectRoutes` only enumerates
  // `exact` rules — see route-manifest.test.ts), so it never appears as a "redirect" kind route
  // in the manifest — but it is still LIVE on the real server (`lookupLongestPrefix`), and its
  // pattern is exactly the not-found probe's own base slug (`NOT_FOUND_PROBE_BASE`,
  // `route-manifest.ts`), so the probe's own fetch gets intercepted as a 3xx instead of a 404.
  const shadowingPrefixRule: RedirectRecord = {
    id: "redir-shadows-404-probe",
    workspaceId: base.workspaceId,
    matchType: "prefix",
    fromPattern: "/tovu-export-404-check",
    toTarget: "/welcome",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await base.redirectRepo.save({
    record: shadowingPrefixRule,
    revision: {
      redirectId: shadowingPrefixRule.id,
      workspaceId: shadowingPrefixRule.workspaceId,
      seq: 1,
      state: shadowingPrefixRule,
      tombstoned: false,
      actorId: "system",
      recordedAt: now,
    },
  });

  const report = await exportSite({ routeDeps: base, outputDir });

  const probeFailure = report.routes.failed.find((r) => r.kind === "not-found");
  if (!probeFailure) throw new Error("expected the not-found probe in routes.failed");
  assert.match(probeFailure.reason, /expected a 4xx response for the 404 probe, got \d+/);
  assert.equal(
    report.routes.succeeded.some((r) => r.kind === "not-found"),
    false,
    "a shadowed probe must never be reported as a succeeded 404 page"
  );
});

/** `writeNotFoundRoute`'s status check only ever rejected `< 400` — unbounded above, so a 500 from a
 *  crashed 404-page render was ACCEPTED, its body written verbatim to `<outputDir>/404.html` and the
 *  route reported as `succeeded`: a broken 404 page shipped as the site's production one, with the
 *  export reporting clean. Only the not-found probe's own request is intercepted here — every other
 *  fetch goes through the REAL exporter over REAL HTTP, exactly like every other test in this file. */
test("exportSite: a crashed 404-page render (500) is rejected as a route failure, never written as the site's production 404.html", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("tovu-export-404-check")) {
      return new Response("Internal Server Error", { status: 500 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

    const probeFailure = report.routes.failed.find((r) => r.kind === "not-found");
    if (!probeFailure) throw new Error("expected the not-found probe in routes.failed");
    assert.match(probeFailure.reason, /expected a 4xx response for the 404 probe, got 500/);
    assert.equal(
      report.routes.succeeded.some((r) => r.kind === "not-found"),
      false,
      "a crashed 404-page render must never be reported as a succeeded 404 page"
    );
    assert.equal(existsSync(path.join(outputDir, "404.html")), false, "a rejected 404 probe must not leave a broken 404.html behind");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("exportSite: --base-path does not double-prefix a redirect target that already carries the base path", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const now = new Date().toISOString();
  const rule: RedirectRecord = {
    id: "redir-already-prefixed-target",
    workspaceId: base.workspaceId,
    matchType: "exact",
    fromPattern: "/already-prefixed-redirect",
    // Deliberately already carries the SAME base path this test requests below.
    toTarget: "/my-repo/welcome",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await base.redirectRepo.save({
    record: rule,
    revision: {
      redirectId: rule.id,
      workspaceId: rule.workspaceId,
      seq: 1,
      state: rule,
      tombstoned: false,
      actorId: "system",
      recordedAt: now,
    },
  });

  const report = await exportSite({ routeDeps: base, outputDir, basePath: "my-repo" });

  const succeeded = report.routes.succeeded.find((r) => r.path === "/already-prefixed-redirect");
  if (!succeeded) throw new Error("expected /already-prefixed-redirect in routes.succeeded");
  assert.match(succeeded.data, /content="0; url=\/my-repo\/welcome"/, "a target already carrying the base path must be left as-is");
  assert.equal(succeeded.data.includes("/my-repo/my-repo/"), false, "must never double-prefix a value that already starts with the base path");
});

test("exportSite: unreferencedThemeFiles is empty when no active theme was resolved", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  base.themes = [];

  const report = await exportSite({ routeDeps: base, outputDir });

  assert.deepEqual(report.unreferencedThemeFiles, [], "nothing to diff against — must not throw or guess");
  // The live app's own home renderer genuinely needs a resolvable theme (unlike buildRouteManifest,
  // which only records the gap in `skipped` — see route-manifest.ts's own "no-theme" test); without
  // one it 500s, so home is correctly a REPORTED failure here, not a crash and not a silent success.
  const homeFailure = report.routes.failed.find((r) => r.path === "/");
  if (!homeFailure) throw new Error("expected '/' in routes.failed when no theme is active");
  assert.match(homeFailure.reason, /500/);
  assert.equal(existsSync(path.join(outputDir, "index.html")), false, "a failed route must not leave a file behind");
  // Convention routes are theme-independent and must still succeed.
  assert.ok(report.routes.succeeded.some((r) => r.path === "/robots.txt"));
});

test("firstExportFailure: undefined when nothing failed", () => {
  const report = makeEmptyReport();
  assert.equal(firstExportFailure(report), undefined);
});

test("firstExportFailure: reports the first route failure, with the route collection's own count", () => {
  const report = makeEmptyReport();
  report.routes.failed = [
    { path: "/a", kind: "post", reason: "expected 200, got 500" },
    { path: "/b", kind: "post", reason: "expected 200, got 404" },
  ];

  assert.deepEqual(firstExportFailure(report), {
    kind: "route",
    identifier: "/a",
    reason: "expected 200, got 500",
    count: 2,
  });
});

test("firstExportFailure: reports the first asset failure when there are no route failures", () => {
  const report = makeEmptyReport();
  report.assets.failed = [{ url: "/theme-assets/tovu-theme/style.css", reason: "GET -> 404" }];

  assert.deepEqual(firstExportFailure(report), {
    kind: "asset",
    identifier: "/theme-assets/tovu-theme/style.css",
    reason: "GET -> 404",
    count: 1,
  });
});

test("firstExportFailure: checks routes before assets when both have failures", () => {
  const report = makeEmptyReport();
  report.routes.failed = [{ path: "/a", kind: "post", reason: "route reason" }];
  report.assets.failed = [{ url: "/theme-assets/tovu-theme/style.css", reason: "asset reason" }];

  const result = firstExportFailure(report);
  assert.equal(result?.kind, "route", "routes must be checked before assets, per this function's own doc");
  assert.equal(result?.identifier, "/a");
});

/**
 * Direct coverage for `redirectOutcomeFor`'s own four outcomes — including "no Location AND no
 * redirectTarget", which `route-manifest.ts` never produces from a real rule (it only ever builds a
 * `kind: "redirect"` route with a non-empty `redirectTarget`), so this pure function is the only way
 * to exercise that combination at all.
 */
test("redirectOutcomeFor: a non-3xx status is not a redirect", () => {
  assert.deepEqual(redirectOutcomeFor(200, null, undefined), { kind: "failed", reason: "expected a 3xx redirect response, got 200" });
});

/** Branch-coverage fill (2026-09-04): `status < 300 || status >= 400` — the test above only ever
 *  proves the LOW side of this OR (200). This proves the HIGH side independently. */
test("redirectOutcomeFor: a status of 400 or above is ALSO not a redirect, independent of the below-300 case", () => {
  assert.deepEqual(redirectOutcomeFor(500, null, undefined), { kind: "failed", reason: "expected a 3xx redirect response, got 500" });
});

test("redirectOutcomeFor: a 3xx with a Location header redirects to it, even when a manifest fallback is also present", () => {
  assert.deepEqual(redirectOutcomeFor(302, "/from-header", "/fallback-target"), { kind: "redirect-to", location: "/from-header" });
});

test("redirectOutcomeFor: a 3xx with no Location header falls back to the manifest's redirectTarget", () => {
  assert.deepEqual(redirectOutcomeFor(302, null, "/fallback-target"), { kind: "redirect-to", location: "/fallback-target" });
});

test("redirectOutcomeFor: a 3xx with neither a Location header nor a manifest redirectTarget fails", () => {
  assert.deepEqual(redirectOutcomeFor(302, null, undefined), { kind: "failed", reason: "redirect response carried no Location header" });
});

test("exportSite: a redirect-kind route whose live response is intercepted into a non-3xx is reported as a route failure", async (t) => {
  // route-manifest.ts always builds a redirect route from a rule the live redirect-serving
  // middleware really does redirect, so the only way to drive writeRedirectRoute's "not a 3xx"
  // branch is to intercept that exact path in the booted app, the same createSiteApp-wrapping
  // technique the CSS url(...) tests above already use.
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const now = new Date().toISOString();
  const rule: RedirectRecord = {
    id: "redir-intercepted-non-3xx",
    workspaceId: base.workspaceId,
    matchType: "exact",
    fromPattern: "/intercepted-non-redirect",
    toTarget: "/welcome",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "system",
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  await base.redirectRepo.save({
    record: rule,
    revision: {
      redirectId: rule.id,
      workspaceId: rule.workspaceId,
      seq: 1,
      state: rule,
      tombstoned: false,
      actorId: "system",
      recordedAt: now,
    },
  });
  base.createSiteApp = () => {
    const wrapper = express();
    wrapper.get("/intercepted-non-redirect", (_req, res) => res.status(200).send("not a redirect"));
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  const failure = report.routes.failed.find((r) => r.path === "/intercepted-non-redirect");
  if (!failure) throw new Error("expected the intercepted non-redirect response to be reported as a route failure");
  assert.equal(failure.reason, "expected a 3xx redirect response, got 200");
});

test("exportSite: a hostile asset reference embedded in rendered HTML that would resolve outside outputDir is refused as a failed asset, never fetched or written", async (t) => {
  // extractAssetUrls is a raw string-prefix scan with NO URL normalization (see its own doc) — a
  // rendered page that literally embeds a traversal payload under a real asset prefix passes that
  // filter and is queued for fetch, so this is the crawl-reachable way to drive
  // resolveAssetPathWithinOutputDir's containment refusal through the real exportSite pipeline,
  // rather than a synthetic direct call to the (now private) fetchOneAsset transport.
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const TRAVERSAL_URL = "/theme-assets/../../../../../../tmp/tovu-export-traversal-canary";
  const base = createRouteDeps();
  base.createSiteApp = () => {
    const wrapper = express();
    wrapper.get("/about", (_req, res) => res.type("html").send(`<!doctype html><html><body><img src="${TRAVERSAL_URL}"></body></html>`));
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  const failure = report.assets.failed.find((a) => a.url === TRAVERSAL_URL);
  if (!failure) throw new Error("expected the traversal payload to be reported as a failed asset");
  assert.equal(failure.reason, "asset URL resolved outside the output directory — refused");
  assert.equal(
    report.assets.succeeded.some((a) => a.url === TRAVERSAL_URL),
    false
  );
});

function makeEmptyReport(): ExportReport {
  return {
    outputDir: "/tmp/unused",
    routes: { succeeded: [], failed: [] },
    assets: { succeeded: [], failed: [] },
    skippedManifestEntries: [],
    unreferencedThemeFiles: [],
  };
}

test("exportSite: base-path rewrites script/image src and both attribute quote styles exactly", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const deps = createRouteDeps();
  deps.createSiteApp = () => {
    const app = express();
    app.get("/about", (_req, res) => res.type("html").send(`<html><head></head><body><script src="/scripts/app.js"></script><img src='/images/photo.png'><a href='/welcome'>Welcome</a><img src="/my-repo/already.png"><img src="https://other.test/x.png"></body></html>`));
    app.use(createApp(deps));
    return app;
  };
  const report = await exportSite({ routeDeps: deps, outputDir, basePath: "my-repo" });
  const html = readFileSync(path.join(outputDir, "about/index.html"), "utf8");
  assert.deepEqual([...html.matchAll(/\b(href|src)=(["'])(.*?)\2/g)].map((match) => [match[1], match[3]]), [
    ["src", "/my-repo/scripts/app.js"], ["src", "/my-repo/images/photo.png"], ["href", "/my-repo/welcome"],
    ["src", "/my-repo/already.png"], ["src", "https://other.test/x.png"],
  ]);
  for (const route of report.routes.succeeded.filter((route) => /^text\/html/.test(route.contentType ?? ""))) {
    assert.doesNotMatch(route.data, /\bsrc=(["'])\/(?!my-repo(?:\/|["']))/, route.path);
  }
});

for (const boundary of ["network", "body"] as const) {
  test(`exportSite: ${boundary} failures are isolated to affected routes/assets and close the server`, async (t) => {
    const outputDir = makeTmpOutputDir();
    t.after(() => rmSync(outputDir, { recursive: true, force: true }));
    const deps = createRouteDeps();
    const now = new Date().toISOString();
    const rule: RedirectRecord = { id: "transport-redirect", workspaceId: deps.workspaceId, matchType: "exact", fromPattern: "/transport-redirect", toTarget: "/welcome", statusCode: 301, status: "active", override: false, priority: 0, source: "manual", createdByPrincipal: "system", createdAt: now, updatedAt: now, version: 1 };
    await deps.redirectRepo.save({ record: rule, revision: { redirectId: rule.id, workspaceId: rule.workspaceId, seq: 1, state: rule, tombstoned: false, actorId: "system", recordedAt: now } });
    // A controlled transport fixture also works where the test runner cannot bind sockets.
    // The response streams are real Web Streams; only the ephemeral listener is substituted.
    t.mock.method(Server.prototype, "listen", function (this: Server) { queueMicrotask(() => this.emit("listening")); return this; });
    t.mock.method(Server.prototype, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 43210 }));
    const close = t.mock.method(Server.prototype, "close", function (this: Server, callback: () => void) { callback(); return this; });
    t.mock.method(Server.prototype, "closeAllConnections", () => {});
    let baseUrl = "";
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      baseUrl = url.origin;
      if (url.pathname === "/") return new Response('<html><head></head><body><img src="/agent-icons/transport.bin"><img src="/agent-icons/good.bin"></body></html>', { headers: { "content-type": "text/html" } });
      if (url.pathname === "/agent-icons/good.bin") return new Response(new Uint8Array([1, 2, 3]));
      if (["/welcome", "/tovu-export-404-check", "/agent-icons/transport.bin", ...(boundary === "network" ? ["/transport-redirect"] : [])].includes(url.pathname)) {
        if (boundary === "network") throw new TypeError("transport canary");
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([42])); controller.error(new Error("body canary")); } }), { status: url.pathname === "/tovu-export-404-check" ? 404 : 200 });
      }
      if (url.pathname === "/transport-redirect") return new Response(null, { status: 301, headers: { location: "/welcome" } });
      return new Response("<html><head></head><body>unrelated route</body></html>", { status: url.pathname === "/tovu-export-404-check" ? 404 : 200, headers: { "content-type": "text/html" } });
    });
    const report = await exportSite({ routeDeps: deps, outputDir });
    assert.deepEqual(report.routes.failed.map((route) => route.path).sort(), ["/welcome", "/tovu-export-404-check", ...(boundary === "network" ? ["/transport-redirect"] : [])].sort());
    for (const failure of report.routes.failed) assert.match(failure.reason, boundary === "network" ? /transport canary/ : /body canary/);
    assert.deepEqual(report.assets.failed.map((asset) => asset.url), ["/agent-icons/transport.bin"]);
    assert.match(report.assets.failed[0]!.reason, boundary === "network" ? /transport canary/ : /body canary/);
    assert.ok(report.routes.succeeded.some((route) => route.path === "/about"));
    assert.deepEqual(report.assets.succeeded.find((asset) => asset.url === "/agent-icons/good.bin")?.data, Buffer.from([1, 2, 3]));
    for (const file of ["welcome/index.html", "404.html", "agent-icons/transport.bin", ...(boundary === "network" ? ["transport-redirect/index.html"] : [])]) assert.equal(existsSync(path.join(outputDir, file)), false, file);
    assert.equal(baseUrl, "http://127.0.0.1:43210");
    assert.equal(close.mock.calls.length, 1, "the temporary server must close even when body reading fails");
  });
}
