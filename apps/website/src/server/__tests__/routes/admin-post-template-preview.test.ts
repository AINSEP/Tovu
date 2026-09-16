import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { NO_THEME_ID, type DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { createContentModule } from "../../runtime/composition/modules/content.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated, startTestServer } from "../helpers/http-test-server.js";

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

/** {@link savePost}'s `"html"`-format counterpart — a Page written through the Pages admin editor
 * (`bodyFormat: "html"`, raw `bodyHtml`, never a TipTap `bodyJson` tree). */
async function saveHtmlPage(
  deps: RouteDeps,
  fields: { slug: string; status?: "draft" | "published"; templateChoice?: string | null; bodyHtml: string }
): Promise<PostRecord> {
  // `"templateChoice" in fields`, NOT `?? "page-shell.html"` — the whole point of the untemplated-Page
  // regression tests at the bottom of this file is an EXPLICIT `null`, and a `??` default would
  // silently hand them a real filename instead, turning a RED test green against a record shape the
  // product never produces.
  const page = {
    id: randomUUID(),
    workspaceId: WORKSPACE_ID,
    title: `Page ${fields.slug}`,
    slug: fields.slug,
    bodyJson: { type: "doc", content: [] },
    status: fields.status ?? "published",
    kind: "page",
    bodyFormat: "html",
    bodyHtml: fields.bodyHtml,
    updatedAt: new Date().toISOString(),
    version: 1,
    templateChoice: "templateChoice" in fields ? fields.templateChoice : "page-shell.html",
  } as unknown as PostRecord;
  await deps.postRepo.save(page);
  return page;
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

// Confirms a capability the route already has at THIS layer, not a new code path: unlike the
// html-format case above, `pendingContentOverride` (`resolveHtmlPageEmbeds`'s existing `bodyJson`
// override, `resolver-service.ts`) is checked BEFORE its own `findPublishedPostById` call, and
// `resolveHtmlFormatContentMarkers` (which DOES call `findPublishedPostById` first) leaves a
// `"doc"`-format id untouched on a lookup miss rather than consuming it — so a `"doc"`-format
// draft's pending body was never actually blocked by the visibility guard, only by the admin UI
// never routing a draft's request here at all (`PagePreview`/`PostPreview` gate on
// `status === "published"`). Written to confirm this BEFORE relying on it to widen that UI gate.
test("a DRAFT doc-format post's own body renders via a POSTed bodyJson override, not the placeholder", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "draft-post-doc", status: "draft", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyJson: docBody(PENDING_BODY_TEXT) }),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="blog-post"'), "the template's own chrome still renders");
  assert.ok(html.includes(PENDING_BODY_TEXT), "the PENDING body must reach the page, bypassing the visibility guard for this one already-authorized id");
  assert.ok(!html.includes(POST_BODY_TEXT), "the draft's saved body must not reach the page once a pending override was supplied");
});

const PENDING_HTML_TEXT = "Pending, unsaved HTML body text the operator is looking at right now";

// 2026-09-09 `bodyHtml` fix: an html-format Page (Pages admin editor) has no `bodyJson` tree, so
// `bodyJson`'s override does nothing for it — the previous draft test above only proves the
// `"doc"`-format (Post) placeholder-degradation case. This proves the `"html"`-format case is
// DIFFERENT once a `bodyHtml` override is supplied: it bypasses the same visibility guard
// (`resolveHtmlFormatContentMarkers`'s own `pendingHtmlOverride`) that leaves it a placeholder above.
test("a DRAFT html-format Page's own body renders via a POSTed bodyHtml override, not the placeholder", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const page = await saveHtmlPage(deps, {
    slug: "draft-page",
    status: "draft",
    templateChoice: "page-shell.html",
    bodyHtml: "<p>Saved, published-would-be html body</p>",
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, page.id, "page-shell.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyHtml: `<p>${PENDING_HTML_TEXT}</p>` }),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="page-shell"'), "the template's own chrome still renders");
  assert.ok(html.includes(PENDING_HTML_TEXT), "the PENDING html body must reach the page, bypassing the visibility guard for this one already-authorized id");
  assert.ok(!html.includes("data-embed-config"), "degrades to the resolved splice, never a raw unresolved marker");
});

// The transport the Pages editor ACTUALLY uses. Every `bodyHtml` test above sends
// `content-type: application/json`, but no browser form can: `PageEditor.tsx`'s hidden
// `<form method="post" target="{iframe}">` (the whole delivery mechanism for this override) always
// encodes as `application/x-www-form-urlencoded`. The `bodyJson` half of this route already has its
// own form-encoded test above for exactly this reason; without this one the `"html"`-format half was
// proven only on a transport the product never sends, which is how a route can pass its whole suite
// and still show the operator a raw unstyled body.
test("POST with a form-urlencoded bodyHtml field renders the PENDING body through the template — the Pages editor's real transport", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const page = await saveHtmlPage(deps, {
    slug: "draft-page",
    status: "draft",
    templateChoice: "page-shell.html",
    bodyHtml: "<p>Saved, published-would-be html body</p>",
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const form = new URLSearchParams();
  form.set("bodyHtml", `<p>${PENDING_HTML_TEXT}</p>`);
  const res = await fetch(previewUrl(baseUrl, page.id, "page-shell.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  // The owner-visible symptom this whole fix exists for: a draft used to render as raw unstyled
  // body with none of the theme's chrome around it.
  assert.ok(html.includes('data-tpl="page-shell"'), "the template's own chrome must wrap the form-encoded pending body too");
  assert.ok(html.includes(PENDING_HTML_TEXT), "the PENDING html body must reach the page via the form-encoded transport too");
  assert.ok(!html.includes("Saved, published-would-be html body"), "the SAVED body must not reach the page once a pending override was supplied");
});

test("POST never persists the pending bodyHtml — the row's stored bodyHtml is unchanged afterward", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const page = await saveHtmlPage(deps, {
    slug: "draft-page",
    status: "draft",
    templateChoice: "page-shell.html",
    bodyHtml: "<p>Saved, published-would-be html body</p>",
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await fetch(previewUrl(baseUrl, page.id, "page-shell.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyHtml: `<p>${PENDING_HTML_TEXT}</p>` }),
  });

  const getRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${page.id}`, { headers: { cookie } });
  const { post: reloaded } = (await getRes.json()) as { post: PostRecord };
  assert.equal(reloaded.bodyHtml, page.bodyHtml, "the preview request must not have written anything back");
});

// Adversarial edge: a `"doc"`-format post has no `bodyHtml` column — a stray `bodyHtml` field sent
// for one must be silently ignored, never applied, rather than corrupting the doc-format render.
test("a bodyHtml field sent for a doc-format post is ignored — the saved bodyJson still renders", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const post = await savePost(deps, { slug: "contact", templateChoice: "blog-post.html" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ bodyHtml: `<p>${PENDING_HTML_TEXT}</p>` }),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes(POST_BODY_TEXT), "a doc-format post's own saved body must still render");
  assert.ok(!html.includes(PENDING_HTML_TEXT), "a bodyHtml field is meaningless for a doc-format post and must not be applied");
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

test("with the theme turned off, the template preview returns a real error — not a 200 carrying a blank page", async (t) => {
  // Producer 4 of the optional-theme design. The thing this route previews IS a theme file, so with
  // no theme there is nothing coherent to show. Before this fix the route did not fail: it walked
  // `resolveTemplate` -> `renderStaticPage` -> a `theme.pages` lookup that returned `undefined` and
  // landed on a `?? ""`, serving an EMPTY BODY with a 200. An operator saw a blank preview pane and
  // no reason for it — the worst of both, since a blank pane is also what a broken template looks
  // like. This is an admin tool, not a public surface, so a real error is the right answer here even
  // though the public site renders unstyled instead.
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  deps.presentationRepo = new InMemoryPresentationSettingsRepo([
    { workspaceId: WORKSPACE_ID, activeThemeId: NO_THEME_ID, updatedAt: new Date().toISOString() } as never,
  ]);
  const post = await savePost(deps, { slug: "preview-no-theme" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(previewUrl(baseUrl, post.id, "blog-post.html"), { headers: { cookie } });

  assert.notEqual(res.status, 200, "a blank body with a 200 is exactly the defect being closed");
  assert.equal(res.status, 409, "the site is not broken and the request is not malformed — the state conflicts with the operation");
  const body = await res.text();
  assert.match(body, /theme/i, "the message must name the cause");
  assert.notEqual(body.trim(), "", "an empty body is what this test exists to prevent");
});

const UNTEMPLATED_PAGE_BODY_TEXT = "Body of a Page nobody ever picked a template for";

/*
 * 2026-09-16 regression, owner-observed while the assistant built `/admin/pages/say-hello` live:
 * "the css for the preview wasnt rendering correctly at first".
 *
 * Root cause: this route renders through `renderViaTemplate` DIRECTLY
 * (`routes/posts/template-preview.ts`), while the public site reaches the same function through
 * `renderTemplateBranchIfEligible` (`routes/site/pages.ts`), which first consults
 * `isEligibleForTemplateBranch` and then `resolveStaticTierPageShellFallback`. For a `kind: "page"`,
 * `bodyFormat: "html"` row with `templateChoice: null` — the state EVERY agent-created Page is in,
 * since neither `content_post_create` nor the Pages editor writes that column on create — those two
 * paths disagree:
 *
 *   - public site: ineligible -> page-shell fallback -> `pages-default.html` / `page-shell.html`
 *   - this route:  `resolveTemplate(null)` -> "never chosen" -> `theme.manifest.templates[0]`
 *
 * On the live `basic` theme `templates[0]` is `posts-default.html`, so the operator's preview pane
 * showed the Page wearing a BLOG POST's chrome and stylesheet while the live URL served it correctly.
 * The two tests below pin the preview to whatever the public route actually serves, by asserting
 * against a live-site fetch of the same record in the same process rather than against a hardcoded
 * expectation — a hardcoded one would go stale the moment either path's rules change again.
 *
 * Posts are untouched by this: `isEligibleForTemplateBranch` returns `true` for every `kind: "post"`
 * on a templated static theme, so the "omitted templateChoice falls back to the theme's first
 * template" test above keeps passing unchanged and doubles as this fix's own regression guard.
 */
test("REGRESSION: an untemplated html Page previews through the SAME template the live site serves it under", async (t) => {
  // `templates[0]` is deliberately the post-shaped `blog-post.html` (the fixture's default order,
  // matching live `basic`'s `posts-default.html` being first) so the wrong answer is distinguishable
  // from the right one.
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const page = await saveHtmlPage(deps, {
    slug: "say-hello",
    status: "published",
    templateChoice: null,
    bodyHtml: `<p>${UNTEMPLATED_PAGE_BODY_TEXT}</p>`,
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Control first: this is what the owner's browser showed at the public URL, and it is correct.
  const liveRes = await fetch(`${baseUrl}/say-hello`);
  const liveHtml = await liveRes.text();
  assert.equal(liveRes.status, 200);
  assert.ok(liveHtml.includes('data-tpl="page-shell"'), "control: the live site serves an untemplated html Page through the page shell");
  assert.ok(!liveHtml.includes('data-tpl="blog-post"'), "control: the live site does NOT use the theme's first, post-shaped template");

  const res = await fetch(previewUrl(baseUrl, page.id, null), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(html.includes('data-tpl="page-shell"'), "the preview must render through the page shell, exactly as the live site just did");
  assert.ok(
    !html.includes('data-tpl="blog-post"'),
    "the preview must not fall back to the theme's first (post-shaped) template — the owner-visible 'css wasn't rendering correctly' symptom"
  );
  assert.ok(html.includes(UNTEMPLATED_PAGE_BODY_TEXT), "the Page's own body must still reach the preview");
});

/*
 * The same divergence reached through the picker instead of through creation. `""` is the Pages
 * picker's explicit "No template chosen", and for an `"html"`-format Page that is its normal,
 * fully-working state — `isPageTemplateChoiceEligible` treats `""` exactly like `null` for this shape
 * (a deliberate divergence from the Post rule, documented on `isEligibleForTemplateBranch`), so the
 * live site serves the page shell. This route instead hit `resolveTemplate`'s `templateChoice === ""`
 * arm and served the DIAGNOSTIC page, so selecting "No template chosen" made the preview pane read as
 * a broken page while the public URL was fine.
 */
test("REGRESSION: an html Page with the picker's explicit 'No template chosen' previews as the live site serves it, not as the diagnostic page", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithTemplates());
  const page = await saveHtmlPage(deps, {
    slug: "say-hello",
    status: "published",
    templateChoice: "",
    bodyHtml: `<p>${UNTEMPLATED_PAGE_BODY_TEXT}</p>`,
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const liveRes = await fetch(`${baseUrl}/say-hello`);
  const liveHtml = await liveRes.text();
  assert.equal(liveRes.status, 200);
  assert.ok(liveHtml.includes('data-tpl="page-shell"'), "control: an explicit opt-out is still a page-shell render on the live site");
  assert.ok(!liveHtml.includes(DIAGNOSTIC_MARKER), "control: the live site never shows an html Page the diagnostic page for this");

  const res = await fetch(previewUrl(baseUrl, page.id, ""), { headers: { cookie } });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.ok(!html.includes(DIAGNOSTIC_MARKER), "the preview must not show the diagnostic page for a state the live site renders fine");
  assert.ok(html.includes('data-tpl="page-shell"'), "the preview must render through the page shell, exactly as the live site just did");
  assert.ok(html.includes(UNTEMPLATED_PAGE_BODY_TEXT), "the Page's own body must still reach the preview");
});
