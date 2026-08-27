import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import type { UUID } from "@jini-ai/cms/core";
import { createApp, createRouteDeps } from "../../server/app.js";
import type { PostRepoPort, PostRecord } from "../../features/post/index.js";
import type { RedirectRecord } from "../../features/redirects/index.js";
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
  save(record: PostRecord): Promise<void> {
    return this.inner.save(record);
  }
  softDelete(required: { workspaceId: UUID; id: UUID; deletedAt: string; updatedAt: string; version: number }): Promise<void> {
    return this.inner.softDelete(required);
  }
}

test("exportSite: --base-path unset leaves every written byte identical to a plain export", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  assert.equal(report.basePath, undefined);
  assert.equal(report.basePathRewriteWarning, undefined);

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /href="\/about"/, "an internal link must stay bare root-relative when no base path is requested");
  assert.match(home, /href="\/theme-assets\/basic\//, "a theme asset reference must stay bare root-relative when no base path is requested");

  const sitemap = readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>\/welcome<\/loc>/);

  const robots = readFileSync(path.join(outputDir, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: \/sitemap\.xml$/m);
});

test("exportSite: --base-path rewrites HTML hrefs, sitemap <loc> entries, and robots.txt's Sitemap line, without double-prefixing anything already prefixed", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir, basePath: "my-repo" });

  assert.equal(report.basePath, "/my-repo", "a bare 'my-repo' flag value normalizes to a leading-slash, no-trailing-slash form");
  assert.ok(report.basePathRewriteWarning && report.basePathRewriteWarning.length > 0, "the disclosed limit must be reported whenever a base path is set");
  assert.deepEqual(report.assets.failed, [], "the crawl must still discover assets from the RAW (unprefixed) response the live server actually sent");

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /href="\/my-repo\/about"/, "an internal link must carry the base path");
  assert.match(home, /href="\/my-repo\/theme-assets\/basic\//, "a theme asset reference must carry the base path");
  assert.equal(/href="\/(?!my-repo\/)/.test(home), false, "no root-relative href may survive un-prefixed once a base path is set");

  const sitemap = readFileSync(path.join(outputDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>\/my-repo\/welcome<\/loc>/);

  const robots = readFileSync(path.join(outputDir, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: \/my-repo\/sitemap\.xml$/m);

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
  // route-manifest.test.ts's own count against this exact fixture: 1 home + 2 well-known
  // (robots.txt/sitemap.xml) + 8 theme pages + 7 posts (the seeded "about" post is shadowed by the
  // theme's own about.html) + 1 not-found probe.
  assert.equal(report.routes.succeeded.length, 19);

  assert.ok(existsSync(path.join(outputDir, "index.html")), "home");
  assert.ok(existsSync(path.join(outputDir, "robots.txt")), "well-known route at its literal filename, not a subfolder");
  assert.ok(existsSync(path.join(outputDir, "sitemap.xml")), "well-known route at its literal filename, not a subfolder");
  assert.ok(existsSync(path.join(outputDir, "about", "index.html")), "theme-owned static page");
  assert.ok(existsSync(path.join(outputDir, "welcome", "index.html")), "seeded published post");
  assert.ok(existsSync(path.join(outputDir, "404.html")), "404 probe written to the output root");

  const home = readFileSync(path.join(outputDir, "index.html"), "utf8");
  assert.match(home, /<!doctype html>/i, "home is a full HTML document, not a fragment");
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

  const report = await exportSite({ routeDeps: createRouteDeps(), outputDir });

  // A content-embedding template shell (route-manifest.ts's own file header): never its own route,
  // never linked from any rendered page — genuinely unreferenced, not a false positive. `basic` is
  // schema v2 (2026-08-18 migration), so its pages live under `render/pages/`, not a theme-root
  // `pages/` — see `findUnreferencedThemeFiles`'s own v1/v2 detection.
  assert.ok(
    report.unreferencedThemeFiles.includes("render/pages/page-shell.html"),
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

  // Files this export DID account for — real pages, real assets — must never appear in the same
  // list, or the warning would be noise instead of signal. "pricing" has no colliding post in this
  // fixture (see route-manifest.test.ts's own use of it as the canonical un-shadowed theme page), so
  // it is the one still genuinely rendered from the theme.
  for (const shouldNotAppear of [
    "render/pages/pricing.html",
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
    report.assets.succeeded.some((a) => a.url.startsWith("/theme-assets/basic/")),
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
    wrapper.get("/theme-assets/basic/css/theme.css", (_req, res) => res.type("text/css").send(CSS_WITH_URL_REFS));
    wrapper.get("/theme-assets/basic/images/coverage-test-injected-icon.svg", (_req, res) =>
      res.type("image/svg+xml").send(INJECTED_SVG)
    );
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  assert.deepEqual(report.assets.failed, []);
  const cssAsset = report.assets.succeeded.find((a) => a.url === "/theme-assets/basic/css/theme.css");
  if (!cssAsset) throw new Error("expected the (intercepted) theme.css in assets.succeeded");
  assert.equal(cssAsset.data.toString("utf8"), CSS_WITH_URL_REFS);

  const followedAsset = report.assets.succeeded.find((a) => a.url === "/theme-assets/basic/images/coverage-test-injected-icon.svg");
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
    report.assets.succeeded.filter((a) => a.url === "/theme-assets/basic/css/theme.css").length,
    1,
    "a CSS file that references itself must not be queued and fetched twice"
  );
  // Same dedup guarantee for a CSS reference to an asset ALREADY independently discovered by the
  // HTML crawl (main.js is directly `<script src>`-linked from the rendered page too).
  assert.equal(
    report.assets.succeeded.filter((a) => a.url === "/theme-assets/basic/scripts/main.js").length,
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
    wrapper.get("/theme-assets/basic/css/theme.css", (_req, res) => res.type("text/css").send(CSS_WITH_MISSING_REF));
    // Deliberately no handler for coverage-test-does-not-exist.png — falls through to the real
    // app's static-asset middleware, which 404s (the file genuinely does not exist on disk).
    wrapper.use(createApp(base));
    return wrapper;
  };

  const report = await exportSite({ routeDeps: base, outputDir });

  const failure = report.assets.failed.find((a) => a.url === "/theme-assets/basic/images/coverage-test-does-not-exist.png");
  if (!failure) throw new Error("expected the missing CSS-referenced asset in assets.failed");
  assert.match(failure.reason, /-> 404$/);
  assert.equal(
    report.assets.succeeded.some((a) => a.url === "/theme-assets/basic/images/coverage-test-does-not-exist.png"),
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
  assert.equal(stub, redirectSucceeded.data, "the succeeded entry's data must match the bytes actually written");
  assert.match(stub, /<meta http-equiv="refresh" content="0; url=\/welcome\?ref=export&amp;utm_source=redirect-test">/, "the redirect target must be HTML-escaped (& -> &amp;) into the meta refresh");
  assert.match(stub, /<link rel="canonical" href="\/welcome\?ref=export&amp;utm_source=redirect-test">/);
  assert.match(stub, /Redirecting to <a href="\/welcome\?ref=export&amp;utm_source=redirect-test">/);
});

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
  assert.match(probeFailure.reason, /expected a non-2xx response for the 404 probe, got \d+/);
  assert.equal(
    report.routes.succeeded.some((r) => r.kind === "not-found"),
    false,
    "a shadowed probe must never be reported as a succeeded 404 page"
  );
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
  report.assets.failed = [{ url: "/theme-assets/basic/style.css", reason: "GET -> 404" }];

  assert.deepEqual(firstExportFailure(report), {
    kind: "asset",
    identifier: "/theme-assets/basic/style.css",
    reason: "GET -> 404",
    count: 1,
  });
});

test("firstExportFailure: checks routes before assets when both have failures", () => {
  const report = makeEmptyReport();
  report.routes.failed = [{ path: "/a", kind: "post", reason: "route reason" }];
  report.assets.failed = [{ url: "/theme-assets/basic/style.css", reason: "asset reason" }];

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
