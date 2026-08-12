import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { createContentModule } from "../../modules/content";
import { registerSiteRoutes } from "../../routes/site/pages";
import type { RouteDeps } from "../../routes/types";
import { bootAuthenticated, startTestServer } from "../helpers/http-test-server";

/**
 * @file Integration coverage for the template-preview fix (2026-08-11) — `GET
 * /api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview`
 * (`routes/admin/posts/template-preview.ts`).
 *
 * Root cause this route fixes: both editors' Preview tab showed a real, styled render only for a
 * PUBLISHED, un-dirtied row (`status === "published" && !dirty`) by iframing the public site URL.
 * Picking a DIFFERENT template correctly marks the row `dirty` (an unsaved `templateChoice` change),
 * which used to fall the preview all the way back to the raw, unstyled body — and that fallback never
 * read `templateChoice` at all, so re-picking a different template while already dirty rendered
 * byte-identical output. This route lets the preview show the row through a PENDING template choice
 * by reusing the real render pipeline (`renderViaTemplate`) with an in-memory-only override, looked up
 * by id rather than by public slug (any status, at THIS layer) — but see the draft test below for a
 * real limitation found while writing this suite: a draft's own body does not survive the shared
 * "content" marker resolver's visibility guard, so the admin UI deliberately only routes a published
 * row through this endpoint.
 *
 * NOTE: `post-template-site-serving.test.ts` (this directory) builds its theme fixture with a
 * `manifest.postTemplate` field — that field was retired by the 2026-08-11 unified-content-marker
 * commit (`69e08d9`) in favor of `manifest.templates`, which `resolveTemplate`
 * (`features/theme/static-render.ts`) actually reads. That file's fixture was not updated and several
 * of its own tests now fail on this branch — confirmed by running it directly, unrelated to this fix
 * and out of this dispatch's scope (flagged in the implementation report). This file uses the CURRENT
 * `manifest.templates` field so it exercises the real, live resolution path.
 */

const WORKSPACE_ID = "workspace-local";
const DIAGNOSTIC_MARKER = "Not configured";
const POST_BODY_TEXT = "Body text that proves the real post rendered";

function staticThemeWithTemplates(overrides: { templates?: string[]; extraPages?: Record<string, string> } = {}): DiscoveredTheme {
  const slot = '<div data-embed-config=\'{"type":"content"}\'></div>';
  return {
    manifest: {
      id: "static-test-theme",
      name: "Static Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: overrides.templates ?? ["blog-post.html", "page-shell.html"],
    },
    dir: "/nonexistent/test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "blog-post": `<html><body><main data-tpl="blog-post">${slot}</main></body></html>`,
      "page-shell": `<html><body><main data-tpl="page-shell">${slot}</main></body></html>`,
      ...overrides.extraPages,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function buildTestApp(theme: DiscoveredTheme): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.themes = [theme];
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  // `as never`: `createContentModule` takes the narrower `ContentRouteDeps`, and `RouteDeps` is a
  // structural supertype of it — same cast the existing `post-template-site-serving.test.ts` uses at
  // its own identical call site.
  createContentModule(deps as never).registerRoutes?.(app);
  registerSiteRoutes(app, deps);
  return { app, deps };
}

async function savePost(deps: RouteDeps, fields: { slug: string; status?: "draft" | "published"; templateChoice?: string | null }): Promise<PostRecord> {
  const post = {
    id: randomUUID(),
    workspaceId: WORKSPACE_ID,
    title: `Post ${fields.slug}`,
    slug: fields.slug,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: POST_BODY_TEXT }] }] },
    status: fields.status ?? "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
    templateChoice: fields.templateChoice ?? "blog-post.html",
  } as unknown as PostRecord;
  await deps.postRepo.save(post);
  return post;
}

function previewUrl(baseUrl: string, id: string, templateChoice: string | null): string {
  const query = templateChoice === null ? "" : `?templateChoice=${encodeURIComponent(templateChoice)}`;
  return `${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${id}/template-preview${query}`;
}

const PENDING_BODY_TEXT = "Pending, unsaved body text the operator is looking at right now";

/** Builds a TipTap `bodyJson` doc containing `text` as its sole paragraph — same minimal shape
 * `savePost`'s own fixture uses for {@link POST_BODY_TEXT}, so a passing assertion on the rendered
 * HTML's text content is comparing like with like. */
function docBody(text: string): unknown {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

test("renders the PENDING template override, not the row's saved templateChoice", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "page-shell.html"), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="page-shell"'), "must render through the OVERRIDE template, not the saved one");
  assert.ok(!html.includes('data-tpl="blog-post"'), "must not render through the saved template");
  assert.ok(html.includes(POST_BODY_TEXT), "the post's own body must reach the page");
});

test("never persists the override — the row's stored templateChoice is unchanged afterward", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await fetch(previewUrl(baseUrl, post.id, "page-shell.html"), { headers: { cookie } });

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${post.id}`, { headers: { cookie } });
  const { post: reloaded } = (await getRes.json()) as { post: PostRecord };
  assert.equal(reloaded.templateChoice, "blog-post.html", "the preview request must not have written anything back");
});

// 2026-08-12 pending-body fix: the owner's own reported bug — any content edit used to fall the
// preview all the way back to the raw, unstyled `SrcDocSandbox` because there was no way to hand this
// route the operator's unsaved `bodyJson`. `POST` (new) accepts one; `GET` (unchanged, exercised by
// every test above) never does.
test("POST with a pending bodyJson renders the PENDING body, not the row's saved body", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyJson: docBody(PENDING_BODY_TEXT) }),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes(PENDING_BODY_TEXT), "the PENDING body must reach the page");
  assert.ok(!html.includes(POST_BODY_TEXT), "the SAVED body must not reach the page once a pending override was supplied");
});

// The real browser transport a `<form method="post" target="{iframe}">` submit uses (see this file's
// header) — always `application/x-www-form-urlencoded`, where `bodyJson` arrives as a
// JSON-STRINGIFIED STRING form field, not a parsed object. Proves the route's own
// `express.urlencoded()` mount (POST-registration-scoped) plus `extractPendingBodyJson`'s string-parse
// branch actually work together, not just the `fetch`+JSON transport the tests above exercise.
test("POST with a form-urlencoded, JSON-stringified bodyJson field also renders the PENDING body", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const form = new URLSearchParams();
  form.set("bodyJson", JSON.stringify(docBody(PENDING_BODY_TEXT)));
  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes(PENDING_BODY_TEXT), "the PENDING body must reach the page via the form-encoded transport too");
  assert.ok(!html.includes(POST_BODY_TEXT), "the SAVED body must not reach the page once a pending override was supplied");
});

test("POST never persists the pending body — the row's stored bodyJson is unchanged afterward", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyJson: docBody(PENDING_BODY_TEXT) }),
  });

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${post.id}`, { headers: { cookie } });
  const { post: reloaded } = (await getRes.json()) as { post: PostRecord };
  assert.equal(JSON.stringify(reloaded.bodyJson), JSON.stringify(post.bodyJson), "the preview request must not have written anything back");
});

// Negative/spot verification (per dispatch): a malformed override (not a JSON object) must not reach
// `renderDocNode` — degrades to the pre-existing saved-body render rather than crashing the request.
test("POST with a malformed bodyJson (not an object) falls back to the saved body instead of erroring", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyJson: "not-an-object" }),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes(POST_BODY_TEXT), "an invalid override shape must fall back to the saved body, never crash");
});

// Found while writing this suite, not assumed: the lookup here is by id (any status), unlike the
// public route's `getPublishedPostBySlug`, so the OUTER fetch succeeds for a draft. But the template's
// own `{"type":"content"}` slot resolves through `resolveHtmlPageEmbeds`'s visibility-filtered
// "content" resolver (`resolver-service.ts`'s guard 2, `findPublishedPostById`), which returns nothing
// for an unpublished row — so the CHROME renders styled, but the body degrades to the REQ-28
// placeholder rather than showing the draft's real text. That gap is why `PagePreview`/`PostPreview`
// (`apps/admin`) deliberately only route a `status === "published"` row through this endpoint — a
// draft still gets the pre-existing raw-body fallback instead. This test documents the route's real,
// current behavior at the id-based-lookup layer (graceful degradation, never a crash or a raw
// unresolved marker), not a claim that drafts get full-fidelity previews.
test("a DRAFT post's own body degrades to the placeholder (visibility guard), but the template chrome still renders and nothing crashes", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "draft-post", status: "draft", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="blog-post"'), "the template's own chrome still renders");
  assert.ok(!html.includes(POST_BODY_TEXT), "the draft's real body does not reach the page (visibility guard)");
  assert.ok(!html.includes("data-embed-config"), "degrades to the resolved placeholder, never a raw unresolved marker");

  const publicRes = await fetch(`${baseUrl}/draft-post`);
  assert.equal(publicRes.status, 404, "sanity check: the public route genuinely cannot show this draft either");
});

// The tri-state: an omitted `templateChoice` query param means "never chosen" (falls back to the
// theme's own first template), matching `resolveTemplate`'s own contract — this is what the admin
// client sends when the operator's local `templateChoice` state is `null`.
test("an omitted templateChoice query param falls back to the theme's first template", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates({ templates: ["page-shell.html", "blog-post.html"] }));
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, null), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="page-shell"'), "must fall back to the theme's FIRST template, not the row's saved one");
});

// The tri-state's other end: an explicit empty string is "No template chosen" — the diagnostic page,
// not a silent fallback (`resolveTemplate`'s own doc).
test("an explicit empty templateChoice renders the diagnostic page", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, ""), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes(DIAGNOSTIC_MARKER));
  assert.ok(!html.includes(POST_BODY_TEXT));
});

test("401s without a session cookie", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact" });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"));
  assert.equal(res.status, 401);
});

test("404s for a post id that does not exist", async (t) => {
  const { app } = buildTestApp(staticThemeWithTemplates());
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, "no-such-post", "blog-post.html"), { headers: { cookie } });
  assert.equal(res.status, 404);
});
