import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import express from "express";

import type { PostRecord } from "#src/features/post/index";
import { NO_THEME_ID, type DiscoveredTheme } from "#src/features/theme/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { InMemoryMemberSessionRepo } from "#src/features/members/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerSiteRoutes } from "../../inbound/public-http/routes/site/pages.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file S4 (`no-template-bare-plan-2026-09-23.md`) — end-to-end coverage for the owner's 2026-09-23
 * bare-page ruling through the real `/:slug` and `/` HTTP boundary: an `html`-format `kind: "page"`
 * row with `templateChoice === ""` must serve ONLY its own HTML, regardless of theme tier or whether
 * a theme is even active, while every other Page shape (`null`, a Post's `""`) keeps its pre-existing
 * behavior untouched. Sibling to `post-template-site-serving.test.ts`, which owns the `null`/`""`
 * Post-side regression this file's Page-side ruling deliberately diverges from.
 */

const WORKSPACE_ID = "workspace-local";
const POST_BODY_TEXT = "Bare page body text that must reach the response untouched";
const NO_CHROME_MARKERS = ["data-theme", "<style", "site-header", "site-footer", "site-assistant"];

function staticThemeWithPageShell(): DiscoveredTheme {
  return {
    manifest: {
      id: "static-bare-test-theme",
      name: "Static Bare Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: ["blog-post.html"],
      publishedPages: [],
    },
    dir: "/nonexistent/test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: '<html data-theme="dark"><body><main data-tpl="home">home</main></body></html>',
      "blog-post": '<html data-theme="dark"><body><main data-tpl="blog-post"></main></body></html>',
      "pages-default":
        '<html data-theme="dark"><head><style>.x{}</style></head><body><main data-tpl="page-shell">' +
        `<div data-embed-config='{"type":"content"}'></div></main></body></html>`,
    },
    partials: {},
    css: ".theme { color: red; }",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function declarativeTestTheme(): DiscoveredTheme {
  return {
    manifest: {
      id: "declarative-bare-test-theme",
      name: "Declarative Bare Test Theme",
      version: "1.0.0",
      tier: "declarative",
      engine: 1,
      templates: [],
      publishedPages: [],
    },
    dir: "/nonexistent/declarative-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {},
    partials: {},
    css: ".theme { color: blue; }",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function buildTestApp(theme: DiscoveredTheme | null): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  deps.themes = theme ? [theme] : [];
  if (theme === null) {
    deps.presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: NO_THEME_ID, updatedAt: new Date().toISOString() } as never,
    ] });
  }
  const app = express();
  app.use(express.json());
  registerSiteRoutes(app, deps);
  return { app, deps };
}

async function saveBarePost(
  deps: RouteDeps,
  fields: { slug: string; bodyHtml: string; templateChoice?: string | null; memberAccessJson?: string | null; status?: PostRecord["status"] }
): Promise<PostRecord> {
  // `templateChoice` defaults to `""` (bare) only when OMITTED (`undefined`) — an explicit `null` in
  // `fields` (the "control" test below) must survive untouched, so this can't be `??`, which treats
  // both the same.
  const templateChoice = "templateChoice" in fields ? fields.templateChoice : "";
  // `createRouteDeps()` always seeds a `kind: "page"` row at slug "/" (`seed.ts`'s `page-root`,
  // id `"page-root"`) so a fresh site has a real home page. `InMemoryPostRepo.findBySlug` returns
  // the FIRST array match on a slug collision, and `save()` upserts by `id` — so reusing that exact
  // id is what lets this test's own bare/`null` home post actually win the lookup, instead of
  // silently coexisting behind the seeded row while every home-slug assertion reads stale content.
  const post = {
    id: fields.slug === "/" ? "page-root" : randomUUID(),
    workspaceId: WORKSPACE_ID,
    title: `Bare ${fields.slug === "/" ? "home" : fields.slug}`,
    slug: fields.slug,
    bodyJson: {},
    status: fields.status ?? "published",
    kind: "page",
    bodyFormat: "html",
    bodyHtml: fields.bodyHtml,
    templateChoice,
    updatedAt: new Date().toISOString(),
    version: 1,
    memberAccessJson: fields.memberAccessJson ?? null,
  } as unknown as PostRecord;
  await deps.postRepo.save(post);
  return post;
}

async function getPage(baseUrl: string, path: string): Promise<{ status: number; html: string }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, html: await res.text() };
}

function assertNoChrome(html: string): void {
  for (const marker of NO_CHROME_MARKERS) {
    assert.ok(!html.includes(marker), `bare page must not include "${marker}"`);
  }
}

test("a bare Page on a static-tier theme serves only its own HTML, no theme chrome", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, { slug: "bare-static", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/bare-static");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT));
  assertNoChrome(html);
  assert.match(html, /<title>Bare bare-static — /);
});

test("a bare Page on a declarative-tier theme serves the same bare output (tier-independent)", async (t) => {
  const { app, deps } = buildTestApp(declarativeTestTheme());
  await saveBarePost(deps, { slug: "bare-declarative", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/bare-declarative");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT));
  assertNoChrome(html);
});

test("a bare Page with the theme turned off (NO_THEME_ID) still serves bare, not Tovu's own unstyled shell", async (t) => {
  const { app, deps } = buildTestApp(null);
  await saveBarePost(deps, { slug: "bare-no-theme", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/bare-no-theme");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT));
  assertNoChrome(html);
});

test("a bare Page claiming the home slug renders bare on GET /", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, { slug: "/", bodyHtml: `<p>${POST_BODY_TEXT}</p>` });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/");

  assert.equal(status, 200);
  assert.ok(html.includes(POST_BODY_TEXT));
  assertNoChrome(html);
});

test("a bare Page whose body is already a complete HTML document is served as-is, no wrapping or injected <title>", async (t) => {
  const fullDoc = `<!doctype html><html lang="fr"><head><title>Author's own title</title></head><body><p>${POST_BODY_TEXT}</p></body></html>`;
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, { slug: "bare-full-doc", bodyHtml: fullDoc });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/bare-full-doc");

  assert.equal(status, 200);
  assert.equal(html, fullDoc, "a full document must pass through byte-identical");
});

for (const [slug, prefix] of [["bare-bom", "\uFEFF"], ["bare-comments", "\uFEFF \n<!-- first -->\t<!-- second -->\n  "]] as const) {
  test(`a complete bare document at ${slug} preserves its leading BOM/comments byte for byte`, async (t) => {
    const fullDoc = `${prefix}<!doctype html><html><head><title>Authored prefix</title></head><body><p>${POST_BODY_TEXT}</p></body></html>`;
    const { app, deps } = buildTestApp(staticThemeWithPageShell());
    await saveBarePost(deps, { slug, bodyHtml: fullDoc });
    const baseUrl = await startTestServer(app, t);
    const response = await fetch(`${baseUrl}/${slug}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(fullDoc), "read bytes because Response.text strips a leading BOM");
  });
}

test("a draft bare Page is not publicly served", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, { slug: "bare-draft", bodyHtml: `<p>${POST_BODY_TEXT}</p>`, status: "draft" });
  const baseUrl = await startTestServer(app, t);
  const { status, html } = await getPage(baseUrl, "/bare-draft");
  assert.equal(status, 404);
  assert.ok(!html.includes(POST_BODY_TEXT));
});

test("a member-gated bare Page still 404s for a signed-out visitor — the gate is not bypassed by bare", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, {
    slug: "bare-gated",
    bodyHtml: `<p>${POST_BODY_TEXT}</p>`,
    memberAccessJson: JSON.stringify({ visibility: "members" }),
  });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/bare-gated");

  assert.equal(status, 404);
  assert.ok(!html.includes(POST_BODY_TEXT), "the gated body must never reach a signed-out visitor");
  const token = "bare-page-member-session";
  deps.memberSessionRepo = new InMemoryMemberSessionRepo([{
    id: "bare-page-member-session-id", workspaceId: WORKSPACE_ID, memberId: "bare-page-member",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
  }]);
  const entitled = await fetch(`${baseUrl}/bare-gated`, { headers: { cookie: `tovu_member_session=${token}` } });
  assert.equal(entitled.status, 200);
  const entitledHtml = await entitled.text();
  assert.ok(entitledHtml.includes(POST_BODY_TEXT));
  assertNoChrome(entitledHtml);
});

test("control: a Page with templateChoice null is unaffected — still renders the theme's page shell", async (t) => {
  const { app, deps } = buildTestApp(staticThemeWithPageShell());
  await saveBarePost(deps, { slug: "still-shell", bodyHtml: `<p>${POST_BODY_TEXT}</p>`, templateChoice: null });
  const baseUrl = await startTestServer(app, t);

  const { status, html } = await getPage(baseUrl, "/still-shell");

  assert.equal(status, 200);
  assert.ok(html.includes('data-tpl="page-shell"'), "null must keep resolving to the theme's page shell, unchanged by the bare ruling");
  assert.ok(html.includes(POST_BODY_TEXT));
});
