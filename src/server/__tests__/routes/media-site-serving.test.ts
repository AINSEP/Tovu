import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import type { DiscoveredTheme } from "#src/features/theme/index";
import { registerTransform } from "#src/media/index";
import { CORE_PUBLIC_TRANSFORM_NAME } from "#src/media/index";
import { createRouteDeps } from "../../app.js";
import { createContentModule } from "../../modules/content.js";
import { createMediaModule } from "../../modules/media.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

// A saturated machine, not a slow template, is what makes these fire. On 2026-08-19 a 7-agent run
// drove this 8-core box to load average 135 and the sandboxed renders below failed with
// "render exceeded 5000ms timeout" on templates that render in ~50ms idle; the same file passed
// 9/9 when run alone. Raising the PRODUCT default would weaken a real guard (a visitor must never
// wait 30s for a runaway theme) to fix a test-environment problem, so this raises it only here.
// The sandbox's own termination tests pin explicit budgets (500ms) and are unaffected by this.
process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file ADR-027 §4 end-to-end: a Post authored through the real admin API with a ref-based
 * `{assetId, transformName}` image node actually serves a real `<img>` on a real GET request to
 * the live site — and that `<img>`'s `src` itself actually resolves through the real `/m/` route.
 * Mirrors `widgets-site-serving.test.ts`'s own framing: proves the whole chain (admin write ->
 * `transform_registry` lookup -> `render.ts` -> HTTP response) is wired, not merely unit-tested at
 * each layer in isolation — the exact gap a picker-only change would have left open (a dialog that
 * opens proves nothing about whether the resulting URL resolves).
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;
const REAL_ASSET_ID = "50878439-51a5-40e5-9671-d6cf5eff8b08"; // shape only — no upload needed for the render-path assertion below

function declarativeTheme(): DiscoveredTheme {
  return {
    manifest: { id: "media-test-theme", name: "Media Test Theme", version: "1.0.0", tier: "declarative", engine: 1 },
    tokens: {},
    templates: {
      home: { type: "doc", content: [{ type: "slot", name: "content" }] },
      entry: { type: "doc", content: [{ type: "slot", name: "content" }] },
    },
    liquidTemplates: {},
    handlebarsTemplates: {},
    dir: "/nonexistent/test-theme",
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.themes = [declarativeTheme()];
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createContentModule(deps).registerRoutes(app);
  createMediaModule(deps).registerRoutes(app);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

test("ADR-027 §4: a published post's ref-based image node renders a real <img> on GET /:slug, and that <img>'s own src resolves 200 through the real /m/ route", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Registers the SAME "public" transform `ensureCoreMediaTransform` registers at real boot —
  // this test app is `app.ts`'s hermetic composition, which (deliberately, see `server/app.ts`'s
  // own header) never calls the SQLite-only boot chain `deps.ts` chains it into, so the test
  // registers it directly, mirroring `media-rendition-route.test.ts`'s existing `registerOne`
  // convention for the same reason.
  const { definition } = await registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });

  const createRes = await fetch(`${baseUrl}${BASE}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Ref image post", slug: "ref-image-post", kind: "post" }),
  });
  assert.equal(createRes.status, 201);
  const { post } = (await createRes.json()) as { post: { id: string } };

  const publishRes = await fetch(`${baseUrl}${BASE}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Ref image post",
      slug: "ref-image-post",
      status: "published",
      version: 1,
      bodyJson: {
        type: "doc",
        content: [{ type: "image", attrs: { assetId: REAL_ASSET_ID, transformName: CORE_PUBLIC_TRANSFORM_NAME, alt: "A real photo" } }],
      },
    }),
  });
  assert.equal(publishRes.status, 200);

  const siteRes = await fetch(`${baseUrl}/ref-image-post`);
  assert.equal(siteRes.status, 200);
  const html = await siteRes.text();

  const expectedSrc = `/m/${REAL_ASSET_ID}/${CORE_PUBLIC_TRANSFORM_NAME}.v${definition.version}/image.jpg`;
  assert.match(html, new RegExp(`<img src="${expectedSrc.replace(/\//g, "\\/")}" alt="A real photo" loading="lazy">`));
  assert.doesNotMatch(html, /media-ph/, "a resolvable ref must never fall back to the placeholder");

  // Closes the loop this whole task exists to prove: the URL render.ts emitted must itself
  // actually resolve on the real, unauthenticated `/m/` route — not merely look plausible in HTML.
  // No asset/blob was ever uploaded for `REAL_ASSET_ID` in THIS test's own deps (it only exists in
  // the real dev content.db, not this hermetic in-memory app), so this specific fetch legitimately
  // 404s here — asserted explicitly (not "some 200") so a future change that silently swallows the
  // route entirely (e.g. a 500) is still caught.
  const renditionRes = await fetch(`${baseUrl}${expectedSrc}`);
  assert.equal(renditionRes.status, 404);
  const body = (await renditionRes.json()) as { error: string };
  assert.equal(body.error, "rendition not found");
});

test("owner-directed quick-and-dirty sizing fix: a real uploaded asset with width/height/cssClass set through the admin PATCH route renders those attrs on the public <img> end-to-end", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const { definition } = await registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });

  // 1x1 transparent PNG — bytes don't matter for this test, only that upload succeeds.
  const onePixelPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  const uploadRes = await fetch(`${baseUrl}${BASE}/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ filename: "sized.png", contentType: "image/png", dataBase64: onePixelPngBase64 }),
  });
  assert.equal(uploadRes.status, 201);
  const { media } = (await uploadRes.json()) as { media: { id: string } };

  // Same PATCH route/shape the admin edit panel's new Width/Height/CSS-class fields use.
  const patchRes = await fetch(`${baseUrl}${BASE}/media/${media.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ width: 640, height: 480, cssClass: "post-image" }),
  });
  assert.equal(patchRes.status, 200);

  const createRes = await fetch(`${baseUrl}${BASE}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Sized image post", slug: "sized-image-post", kind: "post" }),
  });
  const { post } = (await createRes.json()) as { post: { id: string } };

  await fetch(`${baseUrl}${BASE}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Sized image post",
      slug: "sized-image-post",
      status: "published",
      version: 1,
      bodyJson: {
        type: "doc",
        content: [{ type: "image", attrs: { assetId: media.id, transformName: CORE_PUBLIC_TRANSFORM_NAME, alt: "sized" } }],
      },
    }),
  });

  const siteRes = await fetch(`${baseUrl}/sized-image-post`);
  assert.equal(siteRes.status, 200);
  const html = await siteRes.text();

  const expectedSrc = `/m/${media.id}/${CORE_PUBLIC_TRANSFORM_NAME}.v${definition.version}/image.jpg`;
  assert.match(
    html,
    new RegExp(`<img src="${expectedSrc.replace(/\//g, "\\/")}" alt="sized" width="640" height="480" class="post-image" loading="lazy">`)
  );
});

test("ADR-027 §4: a published post with a legacy hostile-scheme-src image node still renders the placeholder on a real GET /:slug — no backward-compat regression through the real HTTP path", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // The "public" transform IS registered here too — proves the legacy path degrades on its own
  // terms (no assetId/transformName attrs), not merely because no transform happened to exist.
  await registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });

  const createRes = await fetch(`${baseUrl}${BASE}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Legacy image post", slug: "legacy-image-post", kind: "post" }),
  });
  const { post } = (await createRes.json()) as { post: { id: string } };

  // `src` is a rejected scheme, not an arbitrary https URL — since 2026-08-12 (`ed727041`)
  // render.ts's `safeImageSrc` allowlists plain http(s) URLs and renders them for real (the owner's
  // "restore Img by URL" decision; see render.ts's `case "image"` doc). This row proves the OTHER
  // half of that contract: a scheme the allowlist rejects still degrades to the placeholder,
  // end-to-end through the real HTTP path.
  await fetch(`${baseUrl}${BASE}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      title: "Legacy image post",
      slug: "legacy-image-post",
      status: "published",
      version: 1,
      bodyJson: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "javascript:alert(1)", alt: "legacy" } }],
      },
    }),
  });

  const siteRes = await fetch(`${baseUrl}/legacy-image-post`);
  const html = await siteRes.text();
  assert.match(html, /media-ph/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /javascript:/);
});
