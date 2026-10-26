import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { uploadMedia } from "#src/features/media/index";
import { exportSite } from "../site-exporter.js";
import { rewriteMediaOriginalUrls, rewriteExportMediaResponse } from "../media-original-urls.js";

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>');

async function fixture() {
  const deps = createRouteDeps();
  const { media } = await uploadMedia({
    deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
      renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
    input: { workspaceId: deps.workspaceId, bytes: SVG, filename: "logo.svg", contentType: "image/svg+xml", createdByPrincipal: "test" },
  });
  // Direct upload predates the host recording hook: exercise the real read-path backfill.
  return { deps, media, old: `/m/${media.slug}/original`, canonical: `/m/${media.slug}/original.svg` };
}

test("export rewrites legacy original URLs in HTML, inline CSS, XML and JSON, preserving tails and external URLs", async () => {
  const { deps, media, old, canonical } = await fixture();
  const configured = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
  const origin = `${configured.scheme}://${configured.host}`;
  const body = `<header><img src="${old}?v=1#mark"></header><footer style="background:url(${old})"></footer>` +
    `<link rel="icon" href="${old}"><image:loc>${origin}${old}</image:loc>{"src":"${old}"}` +
    `<img src="https://foreign.invalid${old}"><img src="${old}.svg"><img src="${old}-other">`;
  const expected = `<header><img src="${canonical}?v=1#mark"></header><footer style="background:url(${canonical})"></footer>` +
    `<link rel="icon" href="${canonical}"><image:loc>${canonical}</image:loc>{"src":"${canonical}"}` +
    `<img src="https://foreign.invalid${old}"><img src="${old}.svg"><img src="${old}-other">`;
  assert.equal(await rewriteMediaOriginalUrls({ body, deps }), expected);
  assert.equal((await deps.mediaContentTypeStore.getMany({ workspaceId: deps.workspaceId, sha256s: [media.source.sha256] })).get(media.source.sha256), "image/svg+xml");
  assert.equal(await rewriteMediaOriginalUrls({ body: expected, deps }), expected);
});

test("export response rewrite preserves MIME and security headers and leaves binary responses untouched", async () => {
  const { deps, old, canonical } = await fixture();
  const response = await rewriteExportMediaResponse({ deps, response: new Response(`<img src="${old}">`, {
    headers: { "content-type": "text/html; charset=utf-8", "content-length": "1", "x-content-type-options": "nosniff" },
  }) });
  assert.equal(await response.text(), `<img src="${canonical}">`);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-length"), null);
  const binary = new Response(SVG, { headers: { "content-type": "image/svg+xml" } });
  assert.equal(await rewriteExportMediaResponse({ response: binary, deps }), binary);
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()), SVG);
});

test("export URL upgrades keep private documents, missing assets, trashed assets and unrelated URL suffixes unchanged", async () => {
  const { deps, media } = await fixture();
  await deps.mediaRepo.save({ ...media, id: "private-document", slug: "private-document", kind: "document" });
  await deps.mediaRepo.save({ ...media, id: "trashed-asset", slug: "trashed-asset", status: "trashed" });
  const body = '<a href="/m/private-document/original">file</a><img src="/m/missing/original"><img src="/m/trashed-asset/original">';
  assert.equal(await rewriteMediaOriginalUrls({ body, deps }), body);
  const empty = new Response(null, { status: 204 });
  assert.equal(await rewriteExportMediaResponse({ response: empty, deps }), empty);
});

for (const basePath of [undefined, "/preview"]) {
  test(`static export writes original.svg and rewrites theme, favicon, CSS, sitemap and manifest references (basePath=${basePath})`, async () => {
    const { deps, media, old, canonical } = await fixture();
    const { media: cssOnly } = await uploadMedia({
      deps: { clock: deps.clock, idGen: deps.idGen, mediaRepo: deps.mediaRepo, blobRepo: deps.assetBlobRepo,
        renditionRepo: deps.assetRenditionRepo, blobStore: deps.blobStore },
      input: { workspaceId: deps.workspaceId, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>'), filename: "background.svg", contentType: "image/svg+xml", createdByPrincipal: "test" },
    });
    const cssOld = `/m/${cssOnly.slug}/original`;
    const cssCanonical = `${cssOld}.svg`;
    const app = express();
    app.get("/", (_req, res) => res.type("html").send(`<html><head><link rel="icon" href="${old}"><link rel="stylesheet" href="/theme-assets/test/main.css"><link rel="manifest" href="/theme-assets/test/site.webmanifest"></head><body><header><img src="${old}"></header><footer><img src="/m/${media.id}/original"></footer></body></html>`));
    app.get("/theme-assets/test/main.css", (_req, res) => res.type("css").send(`body{background:url(${cssOld})}`));
    app.get("/theme-assets/test/site.webmanifest", (_req, res) => res.type("application/manifest+json").send(JSON.stringify({ icons: [{ src: old }] })));
    app.get("/sitemap.xml", (_req, res) => res.type("xml").send(`<urlset><image:loc>${old}</image:loc></urlset>`));
    app.get("/robots.txt", (_req, res) => res.type("text").send(""));
    app.get("/feed.xml", (_req, res) => res.type("xml").send("<rss/>"));
    app.use(createApp(deps));
    const outputDir = mkdtempSync(path.join(tmpdir(), "tovu-original-ext-"));
    try {
      const report = await exportSite({ routeDeps: { ...deps, themes: [], listPublishedPosts: async () => ({ posts: [] }), resolveStorefrontProducts: async () => [], createSiteApp: () => app }, outputDir, ...(basePath ? { basePath } : {}) });
      assert.deepEqual(report.routes.failed, []);
      assert.deepEqual(report.assets.failed, []);
      const read = (file: string) => readFileSync(path.join(outputDir, file), "utf8");
      const prefix = basePath ?? "";
      assert.match(read("index.html"), new RegExp(`src="${prefix}${canonical}"`));
      assert.match(read("index.html"), new RegExp(`href="${prefix}${canonical}"`));
      assert.match(read("index.html"), new RegExp(`src="${prefix}/m/${media.id}/original\\.svg"`));
      assert.equal(read("theme-assets/test/main.css"), `body{background:url(${prefix}${cssCanonical})}`);
      assert.deepEqual(JSON.parse(read("theme-assets/test/site.webmanifest")), { icons: [{ src: prefix + canonical }] });
      assert.equal(read("sitemap.xml"), `<urlset><image:loc>${prefix}${canonical}</image:loc></urlset>`);
      for (const url of [canonical, `/m/${media.id}/original.svg`, cssCanonical]) {
        const asset = report.assets.succeeded.find(asset => asset.url === url);
        assert.ok(asset, `missing exported original ${url}`);
        assert.equal(asset.outputFile, url.slice(1));
        assert.equal(asset.contentType, "image/svg+xml");
        assert.deepEqual(readFileSync(path.join(outputDir, asset.outputFile)), asset.data);
        assert.equal(existsSync(path.join(outputDir, asset.outputFile.replace(/\.svg$/, ""))), false);
      }
    } finally { rmSync(outputDir, { recursive: true, force: true }); }
  });
}
