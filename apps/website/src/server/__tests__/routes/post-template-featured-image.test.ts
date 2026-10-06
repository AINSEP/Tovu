import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import { ensureCoreMediaTransform } from "#src/features/media/bootstrap";
import type { PostRecord } from "#src/features/post/index";
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
    new RegExp(`<figure class="post-featured"><img src="/m/${MEDIA_SLUG}/public\\.v\\d+/image\\.jpg" alt="Post with-cover" width="1600" height="900"`),
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
