import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";
import { createRouteDeps } from "../../server/app";
import type { PostRepoPort, PostRecord } from "../../features/post";
import { ExportOutputNotEmptyError, exportSite } from "../site-exporter";

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
  // never linked from any rendered page — genuinely unreferenced, not a false positive.
  assert.ok(
    report.unreferencedThemeFiles.includes("pages/page-shell.html"),
    "a template shell is neither a rendered route nor a crawled asset — must be named, not silently absent"
  );
  assert.ok(report.unreferencedThemeFiles.includes("theme.json"), "the manifest file itself is never independently fetched");

  // Files this export DID account for — real pages, real assets — must never appear in the same
  // list, or the warning would be noise instead of signal.
  for (const shouldNotAppear of ["pages/about.html", "pages/index.html", "pages/404.html", "css/styles.css", "js/main.js"]) {
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

test("exportSite: a route that fails to render is reported as a failure, not silently missing from the output", async (t) => {
  const outputDir = makeTmpOutputDir();
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const base = createRouteDeps();
  const postRepo = new FailingSlugPostRepo(base.postRepo, "welcome");

  const report = await exportSite({ routeDeps: { ...base, postRepo }, outputDir });

  const welcomeFailure = report.routes.failed.find((r) => r.path === "/welcome");
  if (!welcomeFailure) throw new Error("the forced failure must be reported in routes.failed");
  assert.match(welcomeFailure.reason, /500/);
  assert.equal(existsSync(path.join(outputDir, "welcome", "index.html")), false, "a failed route must not leave a file behind");

  // The forced failure is scoped to exactly one slug — every other route must still export.
  assert.ok(report.routes.succeeded.some((r) => r.path === "/"), "home must still succeed");
  assert.ok(report.routes.succeeded.some((r) => r.path === "/about"), "an unrelated theme page must still succeed");
});
