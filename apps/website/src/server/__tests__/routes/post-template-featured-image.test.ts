import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import { ensureCoreMediaTransform } from "#src/features/media/bootstrap";
import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file Regression (2026-10-05): a post's featured image never appeared on a static-tier theme's
 * post page. The templated tiers read `post.featuredImage`, but the static template path
 * (`renderViaTemplate`) never resolved the featured asset at all, so the only place it reached was
 * `og:image`. Pinned through a real GET: the `{"type":"featured-image"}` marker in the template
 * becomes the post's public-transform image, and a post without one leaves no trace of the marker.
 */

const WORKSPACE_ID = "workspace-local";
const MEDIA_SLUG = "cover-shot";

test("featfallback: static heroes and post-preview cards use doc and HTML body images without storing featured ids", async (t) => {
  const { app, deps } = buildTestApp();
  const assetId = await saveImage(deps);
  const theme = deps.themes[0]!;
  theme.manifest.publishedPages = ["blog"];
  theme.pages.blog = `<html><body><section data-embed-config='{"type":"post-previews"}'></section></body></html>`;
  for (const format of ["doc", "html"] as const) {
    const slug = `body-${format}`;
    await savePost(deps, slug, null);
    const stored = await deps.postRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug });
    assert.ok(stored);
    await deps.postRepo.save({ ...stored, bodyFormat: format,
      bodyJson: format === "doc" ? { type: "doc", content: [{ type: "media", attrs: { assetId, transformName: "public", alt: `Alt ${format}` } }] } : {},
      bodyHtml: format === "html" ? `<img src="/m/${MEDIA_SLUG}/public.v1/image.jpg" alt="Alt html">` : null,
    });
  }
  await savePost(deps, "empty-body", null);
  const baseUrl = await startTestServer(app, t);
  for (const format of ["doc", "html"] as const) {
    const response = await fetch(`${baseUrl}/body-${format}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<figure class="post-featured"><img src="/m/${MEDIA_SLUG}/public.v1/image.jpg?v=aaaaaaaaaaaa" alt="Alt ${format}" width="1600" height="900"`));
    assert.equal((await deps.postRepo.findBySlug({ workspaceId: WORKSPACE_ID, slug: `body-${format}` }))?.featuredMediaId, null);
  }
  const listResponse = await fetch(`${baseUrl}/blog`);
  assert.equal(listResponse.status, 200);
  const list = await listResponse.text();
  for (const format of ["doc", "html"] as const) {
    assert.ok(list.includes(`<article class="post-card"><img src="/m/${MEDIA_SLUG}/public.v1/image.jpg?v=aaaaaaaaaaaa" alt="Alt ${format}" width="1600" height="900" decoding="async" loading="lazy">`));
  }
  assert.equal((list.match(/<img /g) ?? []).length, 2, "the empty post must not produce a broken image tag");
});

function staticTheme(): DiscoveredTheme {
  return {
    manifest: { id: "featured-test-theme", name: "Featured Test Theme", version: "1.0.0", tier: "static", engine: 1, templates: ["post.html"], publishedPages: [] },
    dir: "/nonexistent/featured-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      post:
        `<html><body><article>` +
        `<figure class="post-featured" data-embed-config='{"type":"featured-image"}'></figure>` +
        `<div data-embed-config='{"type":"content"}'></div>` +
        `</article></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  // The demo /blog page wins over the test theme; this fixture owns only its seeded posts.
  deps.postRepo = new InMemoryPostRepo();
  deps.themes = [staticTheme()];
  const app = express();
  registerSiteRoutes(app, deps);
  return { app, deps };
}

async function saveImage(deps: RouteDeps): Promise<string> {
  await ensureCoreMediaTransform({ deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo }, input: { workspaceId: WORKSPACE_ID } });
  const id = randomUUID();
  const now = new Date().toISOString();
  await deps.mediaRepo.save({
    id,
    workspaceId: WORKSPACE_ID,
    title: "Cover",
    slug: MEDIA_SLUG,
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: "a".repeat(64) },
    status: "active",
    createdAt: now,
    updatedAt: now,
    version: 1,
    width: 1600,
    height: 900,
    cssClass: null,
    htmlAttributes: null,
  } as never);
  return id;
}

async function savePost(deps: RouteDeps, slug: string, featuredMediaId: string | null): Promise<void> {
  await deps.postRepo.save({
    id: randomUUID(),
    workspaceId: WORKSPACE_ID,
    title: `Post ${slug}`,
    slug,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    featuredMediaId,
  } as unknown as PostRecord);
}

test("REGRESSION: a static post template shows the post's featured image", async (t) => {
  const { app, deps } = buildTestApp();
  await savePost(deps, "with-cover", await saveImage(deps));
  const baseUrl = await startTestServer(app, t);

  const html = await (await fetch(`${baseUrl}/with-cover`)).text();

  assert.match(
    html,
    new RegExp(`<figure class="post-featured"><img src="/m/${MEDIA_SLUG}/public\\.v\\d+/image\\.jpg\\?v=aaaaaaaaaaaa" alt="Post with-cover" width="1600" height="900"`),
    "the featured image must render inside the theme's own wrapper, with alt text and its size"
  );
  assert.ok(!html.includes('"type":"featured-image"'), "the marker must not reach the visitor");
});

test("a post without a featured image renders no featured-image wrapper at all", async (t) => {
  const { app, deps } = buildTestApp();
  await savePost(deps, "no-cover", null);
  const baseUrl = await startTestServer(app, t);

  const html = await (await fetch(`${baseUrl}/no-cover`)).text();

  assert.ok(html.includes("Body"), "the post itself must render");
  assert.ok(!html.includes("post-featured"), "an absent image must leave no empty wrapper behind");
  assert.ok(!html.includes('"type":"featured-image"'), "nor the marker itself");
});
