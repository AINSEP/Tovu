import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { resolveStaticTierPageShellFallback, type DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { createContentModule } from "../../runtime/composition/modules/content.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated, startTestServer } from "../helpers/http-test-server.js";

// A saturated machine, not a slow template, is what makes these fire. On 2026-08-19 a 7-agent run
// drove this 8-core box to load average 135 and the sandboxed renders below failed with
// "render exceeded 5000ms timeout" on templates that render in ~50ms idle; the same file passed
// 9/9 when run alone. Raising the PRODUCT default would weaken a real guard (a visitor must never
// wait 30s for a runaway theme) to fix a test-environment problem, so this raises it only here.
// The sandbox's own termination tests pin explicit budgets (500ms) and are unaffected by this.
process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file End-to-end coverage for the two post/theme-page routing decisions that had none, through a
 * real GET on the live-site boundary rather than in-domain resolution alone.
 *
 * Written after both shipped untested and one regressed in production: with a static-tier active
 * theme declaring `templates` (the 2026-08-11 unification's single Post/Page template list, see
 * `theme.ts`'s own doc on that field), every post whose `templateChoice` was `null` served a
 * "Template not configured" diagnostic page at HTTP 200 — 11 live published posts, silent because
 * the status code was a success and nothing alarmed. The `null` vs `""` pair below is the
 * regression test.
 */

const WORKSPACE_ID = "workspace-local";
const DIAGNOSTIC_MARKER = "Not configured";
const POST_BODY_TEXT = "Body text that proves the real post rendered";

function staticThemeWithPostTemplate(
  overrides: { templates?: string[]; extraPages?: Record<string, string> } = {}
): DiscoveredTheme {
  // The unified `{"type":"content"}` marker (2026-08-11) — `injectCurrentEntityContentId` adds the
  // current entity's real id into this marker at render time; the retired `data-embed-type="post"
  // data-embed-id="{{post}}"` placeholder this used to be stopped resolving to anything the moment
  // themes moved onto `data-embed-config` (2026-08-10, `static-render.ts`'s `resolveTemplate` doc).
  const postSlot = `<div data-embed-config='{"type":"content"}'></div>`;
  return {
    manifest: {
      id: "static-test-theme",
      name: "Static Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: overrides.templates ?? ["blog-post.html"],
      // `extraPages` are this fixture's stand-in for a theme's own marketing pages (the
      // slug-collision-override tests below need `isMarketingPageSlug` to see them as real,
      // routable theme pages). Since `c8e54ddd` (2026-08-31) `isStandaloneThemePage` treats an
      // absent `publishedPages` as "nothing published" — every page here needs an explicit entry
      // or the collision check this fixture exists for never runs and the post wins by default
      // regardless of `overridesThemePage`, silently invalidating the "false" and ROUND TRIP cases.
      publishedPages: Object.keys(overrides.extraPages ?? {}),
    },
    dir: "/nonexistent/test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "blog-post": `<html><body><main data-tpl="blog-post">${postSlot}</main></body></html>`,
      "long-form": `<html><body><main data-tpl="long-form">${postSlot}</main></body></html>`,
      ...overrides.extraPages,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

/**
 * `withAdmin` also mounts the authenticated admin content routes, so one test can drive the real
 * write path and then read the result back off the public site. Admin routes mount BEFORE
 * `registerSiteRoutes`, whose `/:slug` handler would otherwise shadow them.
 */
function buildTestApp(
  theme: DiscoveredTheme,
  { withAdmin = false }: { withAdmin?: boolean } = {}
): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.themes = [theme];
  const app = express();
  app.use(express.json());
  if (withAdmin) {
    registerAuthRoutes(app, deps);
    app.use("/api/admin", requireAdminSession(deps));
    createContentModule(deps as never).registerRoutes?.(app);
  }
  registerSiteRoutes(app, deps);
  return { app, deps };
}

/**
 * Saves a published `doc` post straight through the repo port rather than the admin HTTP API — the
 * subject under test is the SITE render path, and a direct save is the only way to reproduce the
 * exact stored shape that caused the regression (`templateChoice` absent entirely, as migration
 * `0028` left every pre-feature row) without the admin editor's own defaulting in the way.
 *
 * `bodyFormat`/`bodyHtml` (optional, default `"doc"`/generated `bodyJson`) — an `"html"`-format Page
 * has no `createPost`/`updatePost` path at all (`PostRecord.bodyFormat`'s own doc: written only by
 * an agent tool inserting the `posts` row directly), so a direct repo save is not just convenient
 * here, it is the ONLY way this shape is ever produced in production too.
 */
async function savePost(
  deps: RouteDeps,
  fields: {
    slug: string;
    templateChoice?: string | null;
    overridesThemePage?: boolean | null;
    kind?: "post" | "page";
    bodyFormat?: "doc" | "html";
    bodyHtml?: string;
  }
): Promise<PostRecord> {
  const isHtml = fields.bodyFormat === "html";
  const post = {
    id: randomUUID(),
    workspaceId: WORKSPACE_ID,
    title: `Post ${fields.slug}`,
    slug: fields.slug,
    bodyJson: isHtml ? {} : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: POST_BODY_TEXT }] }] },
    status: "published",
    kind: fields.kind ?? "post",
    bodyFormat: isHtml ? "html" : "doc",
    bodyHtml: isHtml ? (fields.bodyHtml ?? `<p>${POST_BODY_TEXT}</p>`) : null,
    updatedAt: new Date().toISOString(),
    version: 1,
    ...(fields.templateChoice !== undefined ? { templateChoice: fields.templateChoice } : {}),
    ...(fields.overridesThemePage !== undefined ? { overridesThemePage: fields.overridesThemePage } : {}),
  } as unknown as PostRecord;
  await deps.postRepo.save(post);
  return post;
}

async function getPage(baseUrl: string, slug: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${baseUrl}/${slug}`);
  return { status: res.status, html: await res.text() };
}

test("REGRESSION: a post whose templateChoice was never set renders its real content, not the diagnostic page", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate());
  await savePost(deps, { slug: "legacy-post" });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "legacy-post");

  assert.equal(status, 200);
  assert.ok(!html.includes(DIAGNOSTIC_MARKER), "must not serve the 'Template not configured' page");
  assert.ok(html.includes(POST_BODY_TEXT), "the post's own body must reach the page");
  assert.ok(html.includes('data-tpl="blog-post"'), "must render through the theme's first-listed template");
});

test("a post explicitly opted out of templates still gets the diagnostic page", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate());
  await savePost(deps, { slug: "opted-out", templateChoice: "" });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "opted-out");

  assert.equal(status, 200);
  assert.ok(html.includes(DIAGNOSTIC_MARKER), "explicit opt-out is designed product behavior");
  assert.ok(!html.includes(POST_BODY_TEXT));
});

test("null and \"\" produce different pages for otherwise identical posts", async (t) => {
  // The single assertion the pre-fix code could not satisfy: it mapped both to the diagnostic page.
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate());
  await savePost(deps, { slug: "never-chosen" });
  await savePost(deps, { slug: "explicitly-none", templateChoice: "" });
  const baseUrl = await startTestServer(app, t);

  const neverChosen = await getPage(baseUrl, "never-chosen");
  const explicitlyNone = await getPage(baseUrl, "explicitly-none");

  assert.ok(!neverChosen.html.includes(DIAGNOSTIC_MARKER));
  assert.ok(explicitlyNone.html.includes(DIAGNOSTIC_MARKER));
});

test("an explicit templateChoice renders through that template, not the first one", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate({ templates: ["blog-post.html", "long-form.html"] }));
  await savePost(deps, { slug: "chosen", templateChoice: "long-form.html" });
  const baseUrl = await startTestServer(app, t);

  const { html } = await getPage(baseUrl, "chosen");

  assert.ok(html.includes('data-tpl="long-form"'));
  assert.ok(html.includes(POST_BODY_TEXT));
});

test("overridesThemePage false: the theme's own same-slug page wins over the post", async (t) => {
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "collision-page", overridesThemePage: false });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "collision-page");

  assert.equal(status, 200);
  assert.ok(html.includes('data-tpl="theme-collision-page"'), "theme page is the default winner");
  assert.ok(!html.includes(POST_BODY_TEXT));
});

test("overridesThemePage true: the post wins over the theme's own same-slug page", async (t) => {
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "collision-page", overridesThemePage: true });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "collision-page");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT), "the overriding post's body must render");
  assert.ok(!html.includes('data-tpl="theme-collision-page"'), "the theme page must lose");
});

test("overridesThemePage true composes with the templateChoice fallback rather than bypassing it", async (t) => {
  // Both features on one row: an overriding post that never chose a template must still fall back,
  // not land on the diagnostic page — the combination neither feature's own path exercises alone.
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "collision-page", overridesThemePage: true });
  const baseUrl = await startTestServer(app, t);

  const { html } = await getPage(baseUrl, "collision-page");

  assert.ok(!html.includes(DIAGNOSTIC_MARKER));
  assert.ok(html.includes('data-tpl="blog-post"'));
});

test('ROUND TRIP: saving "No template chosen" through the admin API persists "" and diagnoses on the site', async (t) => {
  // The editor sends `""` for its "No template chosen" option. `""` is falsy, so any `|| null` on
  // the way through would quietly turn a deliberate opt-out back into "never chosen" — which is the
  // exact coercion that made the two states indistinguishable in the first place. This walks the
  // real admin PUT so that regression can't return through the write path instead of the read one.
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate(), { withAdmin: true });
  const post = await savePost(deps, { slug: "round-trip" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: post.title, slug: post.slug, status: "published", bodyJson: post.bodyJson, templateChoice: "" }),
  });
  assert.equal(put.status, 200);

  const stored = await deps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(stored?.templateChoice, "", 'the opt-out must survive as "", never coerced to null');

  const { html } = await getPage(baseUrl, "round-trip");
  assert.ok(html.includes(DIAGNOSTIC_MARKER));
});

test("overridesThemePage null (never decided): the post wins over the theme's own same-slug page — the tri-state default (2026-08-15)", async (t) => {
  // No `overridesThemePage` field at all — the same shape `createPost` produces for every post
  // today (see `CreatePostInput`'s own doc). This is the actual, common case the whole tri-state
  // change exists for, not a hand-picked edge case: an author who never saw a collision warning.
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "collision-page" });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "collision-page");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT), "an undecided post must win under the new default");
  assert.ok(!html.includes('data-tpl="theme-collision-page"'), "the theme page must lose to the new default");
});

test("overridesThemePage is kind-blind: a database Page (kind: 'page') gets the same tri-state default as a Post", async (t) => {
  // The collision lookup (`getPublishedPostBySlug` -> `findBySlug`) filters on workspace+slug only,
  // never `kind` — a `kind: "page"` row is exactly as reachable as a `kind: "post"` row. Proving the
  // NEW default applies identically to both, not just to posts, closes the coverage gap the audit
  // flagged (`ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-slug-collision-default.md`).
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "collision-page", kind: "page" });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "collision-page");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT), "an undecided database Page must also win under the new default");
  assert.ok(!html.includes('data-tpl="theme-collision-page"'));
});

test('ROUND TRIP: explicitly resetting overridesThemePage to null through the admin API restores the default (post wins)', async (t) => {
  // The smallest adversarial case for a tri-state field: an author who once explicitly chose "theme
  // page wins" (`false`) later reverses that decision back to "no opinion" via the editor's tri-state
  // control, which must send an explicit `null` (not just omit the field, which would leave `false`
  // untouched — see `UpdatePostInput.overridesThemePage`'s own "omit vs explicit null" contract).
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme, { withAdmin: true });
  const post = await savePost(deps, { slug: "collision-page", overridesThemePage: false });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Baseline: the explicit false still keeps the theme page winning.
  const before = await getPage(baseUrl, "collision-page");
  assert.ok(before.html.includes('data-tpl="theme-collision-page"'));

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: post.title, slug: post.slug, status: "published", bodyJson: post.bodyJson, overridesThemePage: null }),
  });
  assert.equal(put.status, 200);

  const stored = await deps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(stored?.overridesThemePage, null, "an explicit reset must persist as a real null, not silently stay false");

  const after = await getPage(baseUrl, "collision-page");
  assert.ok(after.html.includes(POST_BODY_TEXT), "resetting to 'never decided' must fall through to the new default (post wins)");
  assert.ok(!after.html.includes('data-tpl="theme-collision-page"'));
});

test("a theme with no same-slug page serves the post regardless of overridesThemePage", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPostTemplate());
  await savePost(deps, { slug: "no-collision", overridesThemePage: false });
  const baseUrl = await startTestServer(app, t);

  const { html } = await getPage(baseUrl, "no-collision");

  assert.ok(html.includes(POST_BODY_TEXT));
});

test('ROUND TRIP: saving overridesThemePage through the admin API persists it and the post wins over the theme page', async (t) => {
  // Closes a real coverage gap: every overridesThemePage test above writes through
  // `deps.postRepo.save()` directly — none exercise the real admin PUT the way an operator's
  // checkbox-and-Save actually would, so a regression in `update.ts`'s pass-through (the same class
  // of coercion bug the templateChoice ROUND TRIP test above was written to catch) would not be
  // caught today. This is also the exact production bug: a live site's `contact` post collided with
  // fuel's built-in contact.html because `overridesThemePage` was left unset.
  const theme = staticThemeWithPostTemplate({
    extraPages: { "collision-page": '<html><body><main data-tpl="theme-collision-page">Theme collision page</main></body></html>' },
  });
  const { app, deps } = buildTestApp(theme, { withAdmin: true });
  const post = await savePost(deps, { slug: "collision-page", overridesThemePage: false });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  // Baseline: before the admin sets the override, the theme page still wins (this is the exact
  // production bug state — a post colliding with a theme page, flag unset).
  const before = await getPage(baseUrl, "collision-page");
  assert.ok(before.html.includes('data-tpl="theme-collision-page"'));

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/posts/${post.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: post.title, slug: post.slug, status: "published", bodyJson: post.bodyJson, overridesThemePage: true }),
  });
  assert.equal(put.status, 200);

  const stored = await deps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: post.id });
  assert.equal(stored?.overridesThemePage, true, "the override must persist through the real admin write path");

  const after = await getPage(baseUrl, "collision-page");
  assert.ok(after.html.includes(POST_BODY_TEXT), "the post's own content must now win over the theme page");
  assert.ok(!after.html.includes('data-tpl="theme-collision-page"'));
});

/**
 * Static-tier generic-Page-shell fallback (live bug, 2026-09-02) — an `html`-format `kind: "page"`
 * row with no `templateChoice` (the state EVERY Page starts in: neither the agent create tool nor
 * the admin Pages editor sets this column on creation, see `resolveStaticTierPageShellFallback`'s own
 * doc) is, by `isEligibleForTemplateBranch`'s design, never routed into the template branch. It
 * therefore fell through to `renderSite`'s generic path — correct in spirit for the declarative/
 * templated/handlebars tiers, where `pageShell()`'s own built-in chrome IS the theme's only shell,
 * but wrong for a `static`-tier theme, whose real pages are complete standalone documents
 * (`<html data-theme>`, real `/theme-assets/` scripts/icons) that `pageShell()` never produces
 * (`data-theme` is never set, `theme.pages`'s own markup — scripts included — is never referenced;
 * only `theme.css`'s bytes get inlined via `<style>`). Observed live: `pageShell()`'s plain
 * `<html lang="en">` and Tovu's own generic `siteHeader`/`siteFooter` markup replaced the theme's real
 * chrome and its dark/light toggle script wholesale on `/passeios-noroeste-do-pacifico`.
 *
 * These three tests exercise the fix through the real HTTP boundary rather than
 * `resolveStaticTierPageShellFallback`'s unit tests alone (`features/theme/__tests__/static-render-
 * page-shell-fallback.test.ts`, which owns the resolution rule itself and every arm that must return
 * `undefined`), so a wiring mistake in `renderTemplateBranchIfEligible` — the fallback computed but
 * never threaded into `renderViaTemplate`, or applied to the wrong `kind`/`bodyFormat` — would be
 * caught at the same boundary the original bug was found at.
 */
const PAGE_SHELL_DATA_THEME_MARKER = 'data-theme="dark"';
const PAGE_SHELL_ASSET_MARKER = "/theme-assets/basic/scripts/theme-toggle.js";
const PAGE_SHELL_TPL_MARKER = 'data-tpl="page-shell"';

function pageShellHtml(): string {
  const contentSlot = `<div data-embed-config='{"type":"content"}'></div>`;
  return (
    `<html ${PAGE_SHELL_DATA_THEME_MARKER}><head>` +
    `<script src="${PAGE_SHELL_ASSET_MARKER}"></script></head>` +
    `<body><main ${PAGE_SHELL_TPL_MARKER}>${contentSlot}</main></body></html>`
  );
}

test("REGRESSION: an html Page with no templateChoice renders through the static theme's own page-shell, not the generic Tovu chrome", async (t) => {
  const theme = staticThemeWithPostTemplate({ extraPages: { "page-shell": pageShellHtml() } });
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "no-template-html-page", kind: "page", bodyFormat: "html", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "no-template-html-page");

  assert.equal(status, 200);
  assert.ok(html.includes(PAGE_SHELL_DATA_THEME_MARKER), "must render through the theme's own document shell (data-theme present)");
  assert.ok(html.includes(PAGE_SHELL_ASSET_MARKER), "must keep the theme's real asset/script references");
  assert.ok(html.includes(PAGE_SHELL_TPL_MARKER), "must be the theme's page-shell template, not pageShell()'s generic wrapper");
  assert.ok(html.includes(POST_BODY_TEXT), "the page's own authored body must still reach the response");
});

test("a doc-format Page with no templateChoice does NOT get the static page-shell auto-fallback (asymmetry preserved)", () => {
  // The static-tier auto-fallback is scoped to bodyFormat:"html" only — a doc-format Page with
  // templateChoice null stays gated out of the template branch entirely (isEligibleForTemplateBranch's
  // existing, unchanged contract), the same as before this fix. Applying the fallback here too would
  // re-open the terms-of-service-shaped regression this file's own header describes, just through a
  // page-shell.html door instead of blog-post.html. Verified at the unit level (not HTTP) since this
  // is asserting an ABSENCE of new routing, which `template-eligibility.test.ts` already covers for
  // the underlying gate — this test only pins that the new fallback function itself respects it.
  const theme = staticThemeWithPostTemplate({ extraPages: { "page-shell": pageShellHtml() } });
  assert.equal(
    resolveStaticTierPageShellFallback({ theme, post: { kind: "page", bodyFormat: "doc" } }),
    undefined,
    "doc-format Pages must never receive the static page-shell auto-fallback"
  );
});

test("a static theme with no page-shell page keeps the pre-fix generic fallback for an untemplated html Page", async (t) => {
  // No behavior change for a static theme that doesn't happen to ship a `page-shell.html` — the
  // fallback function itself must no-op, same contract as `resolveTemplate`'s own `resolveAgainstTheme`
  // for a missing/slotless candidate.
  const theme = staticThemeWithPostTemplate(); // no "page-shell" in extraPages
  const { app, deps } = buildTestApp(theme);
  await savePost(deps, { slug: "no-page-shell-theme", kind: "page", bodyFormat: "html", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "no-page-shell-theme");

  assert.equal(status, 200);
  assert.ok(!html.includes(PAGE_SHELL_DATA_THEME_MARKER), "no page-shell file exists, so no data-theme shell can be produced");
  assert.ok(html.includes(POST_BODY_TEXT), "the generic path must still render the page's own real content");
});
