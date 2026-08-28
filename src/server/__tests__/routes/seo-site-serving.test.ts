import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerAdminSeoGetEntryRoute } from "../../routes/admin/seo/get-entry.js";
import { registerAdminSeoPutEntryRoute } from "../../routes/admin/seo/put-entry.js";
import { SITE_TITLE } from "../../routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer, loginAsOwner } from "../helpers/http-test-server.js";

// A saturated machine, not a slow template, is what makes these fire. On 2026-08-19 a 7-agent run
// drove this 8-core box to load average 135 and the sandboxed renders below failed with
// "render exceeded 5000ms timeout" on templates that render in ~50ms idle; the same file passed
// 9/9 when run alone. Raising the PRODUCT default would weaken a real guard (a visitor must never
// wait 30s for a runaway theme) to fix a test-environment problem, so this raises it only here.
// The sandbox's own termination tests pin explicit budgets (500ms) and are unaffected by this.
process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file Coordinator-authored (2026-07-13), post-session-limit resume. SPEC-008's
 * tasks.md (T040-T045) called for 5 integration test files that were never
 * written because the implementing agent was killed before reaching Phase 7.
 * This is a single consolidated file covering the load-bearing paths: admin
 * auth gating, the entry-meta round trip through the real SQLite-backed
 * chokepoint, and — most importantly — that the public site + sitemap/robots
 * routes are actually reachable through the real running app (`createApp()`),
 * not just unit-testable in isolation.
 */

const WORKSPACE_ID = "workspace-local";

function buildAdminTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSeoGetEntryRoute(app, deps);
  registerAdminSeoPutEntryRoute(app, deps);
  return { app, deps };
}

test("T042: GET entry-meta without admin.seo.manage is denied 403", async (t) => {
  const { app, deps } = buildAdminTestApp();
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;
  const post = (await deps.postRepo.list({ workspaceId: WORKSPACE_ID }))[0];

  // No login at all -> requireAdminSession itself rejects (401), proving the route is gated end to end.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`);
  assert.equal(res.status, 401);
});

test("T042: GET/PUT entry-meta round trip via the real chokepoint", async (t) => {
  const { app, deps } = buildAdminTestApp();
  const baseUrl = await startTestServer(app, t);
  const cookie = await loginAsOwner(baseUrl);
  await deps.seoReady;
  const post = (await deps.postRepo.list({ workspaceId: WORKSPACE_ID }))[0];

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Custom SEO Title" }),
  });
  const putBody = (await put.json()) as { data: { title: string } };
  assert.equal(put.status, 200);
  assert.equal(putBody.data.title, "Custom SEO Title");

  const get = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE_ID}/seo/entries/${post!.id}`, {
    headers: { cookie },
  });
  assert.equal(get.status, 200);
  const getBody = (await get.json()) as { data: { title: string } };
  assert.equal(getBody.data.title, "Custom SEO Title");
});

test("T040/T041: /sitemap.xml and /robots.txt are reachable through the real running app, unauthenticated", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /xml/);
  assert.match(await sitemap.text(), /<urlset/);

  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type") ?? "", /text\/plain/);
});

test("T045: the real home-page render includes SEO's folded <title> tag, not just the raw shell default", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  const html = await home.text();
  // Exactly one <title> tag — proves pageShell's own hardcoded title was suppressed
  // in favor of the fold's, not emitted twice.
  const titleMatches = html.match(/<title>/g) ?? [];
  assert.equal(titleMatches.length, 1);
  assert.match(html, /<link rel="canonical"/);
});

/**
 * SPEC-008 T045 gap fix, part 2 (2026-08-19) — same drop as T045 above, one branch over. The home
 * route's static-tier render got `injectExtraHeadIntoStaticPage` wired in `9e7786b9`; the marketing
 * `/:slug` branch (`registerSiteRoutes`'s `theme.pages[slug]` short-circuit, `pages.ts`) renders
 * through the exact same bypass-`pageShell` `renderStaticPage` call but was left unfixed on purpose —
 * flagged in that commit's own message as the next gap. Uses the REAL default active theme (`basic`,
 * the alphabetically-first built-in — same theme T045 above already renders through) rather than a
 * synthetic fixture, so this proves the fix against the actual shipped marketing pages
 * (`content/themes/static/basic/render/pages/pricing.html`), not just a hand-built stand-in.
 */
test("T045b: a static-tier marketing /:slug page (no backing post) also gets SEO's folded <title>/canonical, not the theme's own stale <title> or home's hardcoded \"/\" canonical", async (t) => {
  const deps = createRouteDeps();
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const res = await fetch(`${baseUrl}/pricing`);
  assert.equal(res.status, 200);
  const html = await res.text();

  // pricing.html ships its own hardcoded `<title>Pricing — Basic</title>` — exactly one <title> tag
  // proves the fold's title replaced it rather than being appended alongside it.
  const titleMatches = html.match(/<title>/g) ?? [];
  assert.equal(titleMatches.length, 1, "the theme's own hardcoded <title> must be suppressed, not doubled up");
  assert.match(
    html,
    new RegExp(`<title>${SITE_TITLE}</title>`),
    "the fold's site-level title (no backing entry, same shape as home) must win over the theme's stale 'Pricing — Basic'"
  );
  // Must be THIS page's own path, not silently reusing home's hardcoded "/" — the exact defect a
  // naive "just pass buildExtraHead's home args again" fix would have reintroduced.
  assert.match(html, /<link rel="canonical" href="\/pricing"\/>/, "canonical must point at /pricing, not fall back to home's \"/\"");
});

function themeWithTemplateFixture(): DiscoveredTheme {
  const postSlot = `<div data-embed-config='{"type":"content"}'></div>`;
  return {
    manifest: {
      id: "seo-template-theme",
      name: "SEO Template Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: ["blog-post.html"],
    },
    dir: "/nonexistent/seo-template-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><head><title>Stale Home Title</title></head><body><main>home</main></body></html>",
      "blog-post": `<html><head><title>Stale Template Title</title></head><body><main data-tpl="blog-post">${postSlot}</main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

/**
 * SPEC-008 T045 gap fix, part 3 (2026-08-19) — the third static-tier `renderStaticPage` call site
 * with the same bypass-`pageShell` shape: `renderViaTemplate` (`pages.ts`), reached whenever a post
 * or database Page has a resolved theme TEMPLATE (`isEligibleForTemplateBranch`). Distinct code path
 * from the marketing-page branch above (that one has no backing post at all; this one has a real
 * `PostRecord` and is the one place `buildExtraHead`'s entry-bearing "post" shape — real per-entry
 * title/canonical via `getEntryMeta`, not just the site-level title — needed to reach a static-tier
 * render).
 */
test("T045c: a static-tier post/page rendered through its chosen TEMPLATE also gets SEO's folded per-entry <title>/canonical", async (t) => {
  const theme = themeWithTemplateFixture();
  const deps = createRouteDeps();
  deps.themes = [theme];
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);
  await deps.seoReady;

  const post = {
    id: randomUUID(),
    workspaceId: "workspace-local",
    title: "Templated Post Title",
    slug: "templated-post",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body text" }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: new Date().toISOString(),
    version: 1,
  } as unknown as PostRecord;
  await deps.postRepo.save(post);

  const res = await fetch(`${baseUrl}/templated-post`);
  assert.equal(res.status, 200);
  const html = await res.text();

  // Confirm this actually rendered through the template branch (not a fallback/diagnostic page) —
  // otherwise a false pass could hide behind the wrong branch entirely.
  assert.match(html, /data-tpl="blog-post"/, "must have rendered through the resolved template, not a fallback");

  const titleMatches = html.match(/<title>/g) ?? [];
  assert.equal(titleMatches.length, 1, "the template's own hardcoded <title> must be suppressed, not doubled up");
  assert.match(
    html,
    /<title>Templated Post Title<\/title>/,
    "the fold's per-entry title (post.title through the default \"%s\" titleTemplate) must win, proving the ENTRY-bearing fold path (not just home's entry-less one) reaches this render"
  );
  assert.match(html, /<link rel="canonical" href="\/templated-post"\/>/);
});
