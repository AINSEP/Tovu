/** Pins `pages.ts` outcomes the wider page suites leave open: authored classes on docs pager
 *  links, html-format content markers with a null body or no reference, entry placement after a
 *  slug-only content marker, marketing-page lookup and title failures, collection-list dates,
 *  see-more JSON items, the content-owned home page's failure and member gate, the home see-more
 *  rewrite, and the nested-path redirect fallback's error hand-off. */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import express, { type NextFunction, type Request, type Response } from "express";

import type { ContentTypeRecord } from "#src/features/content-types/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import type { EntryRecord } from "#src/features/entries/index";
import { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { InMemoryMenuRepo, NAV_DOC_TYPE, type NavMenuEntry } from "#src/features/navigation/index";
import { InMemoryPostRepo, ROOT_SLUG, type PostRecord } from "#src/features/post/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import type { AssignedTermView, EntryTermReadPort } from "#src/features/taxonomy/repo.sqlite";
import { NO_THEME_ID, renderStaticPage, type DiscoveredTheme } from "#src/features/theme/index";
import { registerResolvePhase } from "#src/platform/routing/adapter";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { assertDefaultConsentPage } from "#src/server/__tests__/helpers/default-consent-page";
import {
  finishStaticTierDocument,
  placeAfterCurrentContent,
  registerSiteRoutes,
  resolveHtmlFormatContentMarkers,
  resolveMarketingPageOrOverride,
  resolveStaticMenusForRender,
} from "../pages.js";

type Deps = ReturnType<typeof createRouteDeps>;

const WORKSPACE_ID = createRouteDeps().workspaceId;
const NOW = "2026-09-23T00:00:00.000Z";

function staticTheme(pages: Record<string, string>, publishedPages: string[]): DiscoveredTheme {
  return {
    manifest: { id: "edge-paths-theme", name: "Edge Paths Theme", version: "1.0.0", tier: "static", engine: 1, templates: [], publishedPages },
    dir: "/nonexistent/edge-paths-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: { index: "<html><body><main>home</main></body></html>", ...pages },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function post(overrides: Partial<PostRecord> & Pick<PostRecord, "id" | "slug">): PostRecord {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Edge post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

async function boot(t: TestContext, overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...createRouteDeps(), ...overrides };
  return startTestServer(createApp(deps), t);
}

/** Runs `fn` with `console.error` silenced: the route's own fault report is the expected output. */
async function withQuietConsole<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

/** A post repo whose slug lookup fails for one slug the way a broken database would. */
class FailingSlugPostRepo extends InMemoryPostRepo {
  constructor(rows: PostRecord[], private readonly failingSlug: string, readonly failure: Error) {
    super(rows);
  }

  override async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | null> {
    if (required.slug === this.failingSlug) throw this.failure;
    return super.findBySlug(required);
  }
}

// --- static menus -------------------------------------------------------------------------------

function headerNavWithAuthoredInstallClass(): NavMenuEntry {
  return {
    id: "menu-header-nav-id",
    workspaceId: WORKSPACE_ID,
    slug: "menu-header-nav",
    title: "Header Nav",
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [{
        id: "item-docs", label: "Docs", target: { kind: "url", href: "/docs" },
        children: [{
          id: "group-start", label: "Get started", target: { kind: "url", href: "/docs#start" },
          children: [
            { id: "page-quickstart", label: "Quickstart", target: { kind: "url", href: "/quickstart" } },
            { id: "page-install", label: "Install", target: { kind: "url", href: "/install" }, attrs: { cssClass: "authored-install" } },
          ],
        }],
      }],
    },
    locations: [],
    updatedAt: NOW,
    version: 1,
  };
}

test("docs pager: a neighbour page's authored cssClass is kept beside the docs-pager-next hook", async () => {
  const pager = `<div data-embed-config='{"type":"menu","id":"docs-prev-next","variant":"tree"}'><span>Pager fallback</span></div>`;
  const theme = staticTheme({ quickstart: `<html><body>${pager}</body></html>` }, ["quickstart"]);
  const deps = { ...createRouteDeps(), menuRepo: new InMemoryMenuRepo({}, { initialRows: [headerNavWithAuthoredInstallClass()] }) };

  const menus = await resolveStaticMenusForRender(deps, theme, "/quickstart");
  const html = renderStaticPage({ theme, pageId: "quickstart", menus }) ?? "";

  const labelIndex = html.indexOf(">Install<");
  const liTag = html.slice(html.lastIndexOf("<li ", labelIndex), html.indexOf(">", html.lastIndexOf("<li ", labelIndex)) + 1);
  assert.match(liTag, /\bdocs-pager-next authored-install\b/);
});

// --- html-format content markers ----------------------------------------------------------------

function contentMarkerDeps(rows: PostRecord[]) {
  return { ...createRouteDeps(), postRepo: new InMemoryPostRepo(rows) };
}

test("content marker: an html-format entity whose bodyHtml is null resolves exactly like an empty body", async () => {
  const marker = `<main data-embed-config='{"type":"content","id":"html-entity"}'>fallback</main>`;
  const nullBody = await resolveHtmlFormatContentMarkers(
    contentMarkerDeps([post({ id: "html-entity", slug: "html-entity", bodyFormat: "html", bodyHtml: null })]), marker, 0, { remaining: 5 });
  const emptyBody = await resolveHtmlFormatContentMarkers(
    contentMarkerDeps([post({ id: "html-entity", slug: "html-entity", bodyFormat: "html", bodyHtml: "" })]), marker, 0, { remaining: 5 });

  assert.notEqual(nullBody, marker, "the marker resolved rather than staying as written");
  assert.equal(nullBody, emptyBody);
});

test("content marker: a marker naming neither id nor slug stays as written while its keyed sibling resolves", async () => {
  const keyless = `<aside data-embed-config='{"type":"content"}'>keyless fallback</aside>`;
  const html = `<main data-embed-config='{"type":"content","id":"html-entity"}'>fallback</main>${keyless}`;
  const deps = contentMarkerDeps([post({ id: "html-entity", slug: "html-entity", bodyFormat: "html", bodyHtml: "<p>Resolved body</p>" })]);

  const result = await resolveHtmlFormatContentMarkers(deps, html, 0, { remaining: 5 });

  assert.match(result, /<p>Resolved body<\/p>/);
  assert.ok(result.endsWith(keyless), `expected the keyless marker untouched, got ${result}`);
});

// --- placeAfterCurrentContent -------------------------------------------------------------------

test("placeAfterCurrentContent: a slug-only content marker naming the post gets the block right after it", () => {
  const html = `<article><div data-embed-config='{"type":"content","slug":"the-post"}'></div><footer>f</footer></article>`;

  const placed = placeAfterCurrentContent({ html, post: { id: "post-id", slug: "the-post" }, block: "<ul>terms</ul>" });

  assert.equal(placed, `<article><div data-embed-config='{"type":"content","slug":"the-post"}'></div><ul>terms</ul><footer>f</footer></article>`);
});

test("placeAfterCurrentContent: html with no content marker for the post comes back unchanged", () => {
  const html = `<article><div data-embed-config='{"type":"content","slug":"another-post"}'></div></article>`;

  assert.equal(placeAfterCurrentContent({ html, post: { id: "post-id", slug: "the-post" }, block: "<ul>terms</ul>" }), html);
});

// --- marketing pages ----------------------------------------------------------------------------

test("marketing page: a post lookup failure other than not-found propagates instead of falling through", async () => {
  const failure = new Error("post store unavailable");
  const deps = { ...createRouteDeps(), postRepo: new FailingSlugPostRepo([], "pricing", failure) };
  const theme = staticTheme({ pricing: "<html><body><main>pricing</main></body></html>" }, ["pricing"]);

  await assert.rejects(resolveMarketingPageOrOverride(deps, theme, "pricing", undefined, false), (err) => err === failure);
});

test("GET /pricing: a failing explicit-title lookup lets the folded site title replace the page's own title", async (t) => {
  const base = createRouteDeps();
  const theme = staticTheme({ pricing: "<html><head><title>Theme Pricing Title</title></head><body><main>pricing</main></body></html>" }, ["pricing"]);
  const baseUrl = await boot(t, { themes: [theme], seoDeps: { ...base.seoDeps, siteTitle: async () => { throw new Error("settings unavailable"); } } });

  const res = await fetch(`${baseUrl}/pricing`);
  const titles = [...(await res.text()).matchAll(/<title>([^<]*)<\/title>/g)].map((match) => match[1]);

  assert.equal(res.status, 200);
  assert.equal(titles.length, 1);
  assert.notEqual(titles[0], "Theme Pricing Title");
});

// --- collection lists ---------------------------------------------------------------------------

function gadgetType(): ContentTypeRecord {
  return { workspaceId: WORKSPACE_ID, key: "gadget", label: "Gadget", fields: [], status: "active", version: 1 };
}

function gadget(overrides: Partial<EntryRecord> & Pick<EntryRecord, "id" | "slug">): EntryRecord {
  return {
    workspaceId: WORKSPACE_ID, type: "gadget", status: "published", title: "Gadget", bodyJson: null,
    fieldsJson: null, publishedAt: NOW, createdAt: NOW, updatedAt: NOW, version: 1, ...overrides,
  };
}

async function datedCollectionHtml(entry: EntryRecord): Promise<string> {
  const contentTypeRepo = new InMemoryContentTypeRepo();
  await contentTypeRepo.save(gadgetType());
  const entryRepo = new TrashAwareInMemoryEntryRepo();
  await entryRepo.save(entry);
  const deps = { ...createRouteDeps(), contentTypeRepo, entryRepo };
  const marker = `<section data-embed-config='{"type":"collection","typeKey":"gadget"}'><template><p class="dated">{{title}}|{{date}}</p></template>No gadgets</section>`;
  const theme = staticTheme({ pricing: "<html><body></body></html>" }, ["pricing"]);
  return finishStaticTierDocument(deps, { theme, pageId: "pricing", html: `<html><body><main>${marker}</main></body></html>`, currentPath: "/pricing", staticMenus: undefined });
}

test("collection list: an entry with no publishedAt is dated by its updatedAt", async () => {
  const html = await datedCollectionHtml(gadget({ id: "g-1", slug: "g-1", title: "Undated", publishedAt: null, updatedAt: "2026-03-04T12:00:00.000Z" }));

  assert.match(html, /<p class="dated">Undated\|Mar 4, 2026<\/p>/);
});

test("collection list: a malformed date shows the raw stored string, not \"Invalid Date\"", async () => {
  const html = await datedCollectionHtml(gadget({ id: "g-2", slug: "g-2", title: "Garbled", publishedAt: "not-a-date" }));

  assert.match(html, /<p class="dated">Garbled\|not-a-date<\/p>/);
});

// --- see-more JSON items ------------------------------------------------------------------------

const CARD = '<template data-jini-card><article class="post-card"><h3><a data-field="title" data-field-href="href"></a></h3></article></template>';

function blogTheme(): DiscoveredTheme {
  return staticTheme(
    { blog: `<html><body><div class="grid" data-jini-see-more data-embed-config='{"type":"post-previews","limit":12}'>${CARD}fallback card</div></body></html>` },
    ["blog"]
  );
}

/** Thirteen published posts, newest first; the 13th (`last`) is the only item of the `/12.json` batch. */
function thirteenPosts(last: Partial<PostRecord>): PostRecord[] {
  return Array.from({ length: 13 }, (_, i) =>
    post({ id: `json-${i}`, slug: `json-${i}`, title: `Json ${i}`, publishAt: new Date(Date.UTC(2026, 0, 30 - i)).toISOString(), ...(i === 12 ? last : {}) })
  );
}

async function lastJsonItem(t: TestContext, overrides: Partial<Deps>): Promise<Record<string, unknown>> {
  const baseUrl = await boot(t, { themes: [blogTheme()], ...overrides });
  const res = await fetch(`${baseUrl}/blog/_more/1/12.json`);
  assert.equal(res.status, 200);
  const json = (await res.json()) as { items: Record<string, unknown>[] };
  assert.equal(json.items.length, 1);
  return json.items[0] ?? {};
}

test("see-more JSON: an html-format post's excerpt is the plain text of its HTML body", async (t) => {
  const item = await lastJsonItem(t, { postRepo: new InMemoryPostRepo(thirteenPosts({ bodyFormat: "html", bodyHtml: "<p>Html <em>body</em> text</p>" })) });

  assert.equal(item.excerpt, "Html body text");
});

test("see-more JSON: a post with no body text carries no excerpt field", async (t) => {
  const item = await lastJsonItem(t, { postRepo: new InMemoryPostRepo(thirteenPosts({})) });

  assert.deepEqual(Object.keys(item).sort(), ["cover", "date", "dateLabel", "href", "terms", "title"]);
});

test("see-more JSON: a post's assigned terms are listed by name", async (t) => {
  const terms: readonly AssignedTermView[] = [{ termId: "term-1", termName: "Recipes", taxonomyName: "category" }];
  const entryTermReadRepo: EntryTermReadPort = { listForContent: async () => terms };

  const item = await lastJsonItem(t, { postRepo: new InMemoryPostRepo(thirteenPosts({})), entryTermReadRepo });

  assert.deepEqual(item.terms, ["Recipes"]);
});

// --- content-owned home page --------------------------------------------------------------------

test("GET /: a failing lookup of the page claiming / answers the generic 500", async (t) => {
  const baseUrl = await boot(t, { postRepo: new FailingSlugPostRepo([], ROOT_SLUG, new Error("post store unavailable")) });

  const res = await withQuietConsole(() => fetch(`${baseUrl}/`));

  assert.equal(res.status, 500);
  assert.equal(assertDefaultConsentPage({ html: await res.text() }).contentHtml, "<h1>Site error</h1>");
});

test("GET /: a members-only page claiming / is not shown to an anonymous visitor, who gets the default home", async (t) => {
  const gatedHome = post({
    id: "gated-home", slug: ROOT_SLUG, kind: "page", bodyFormat: "html", bodyHtml: "<p>Members-only home body</p>",
    memberAccessJson: JSON.stringify({ visibility: "members" }),
  });
  const gatedUrl = await boot(t, { postRepo: new InMemoryPostRepo([gatedHome]) });
  const defaultUrl = await boot(t, { postRepo: new InMemoryPostRepo([]) });

  const gated = await fetch(`${gatedUrl}/`);
  const gatedHtml = await gated.text();

  assert.equal(gated.status, 200);
  assert.doesNotMatch(gatedHtml, /Members-only home body/);
  assert.equal(assertDefaultConsentPage({ html: gatedHtml }).stableHtml,
    assertDefaultConsentPage({ html: await (await fetch(`${defaultUrl}/`)).text() }).stableHtml);
});

// --- home see-more on an unstyled site ----------------------------------------------------------

function homePosts(): PostRecord[] {
  return Array.from({ length: 14 }, (_, i) =>
    post({ id: `home-post-${i}`, slug: `home-post-${i}`, title: `Home Post ${i}`, publishAt: new Date(Date.UTC(2026, 0, 30 - i)).toISOString() })
  );
}

function unstyledSite(): Partial<Deps> {
  return {
    postRepo: new InMemoryPostRepo(homePosts()),
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: WORKSPACE_ID, activeThemeId: NO_THEME_ID, updatedAt: NOW }] }),
  };
}

test("GET /_more/1/12: the home listing's see-more batch answers the posts after the first twelve", async (t) => {
  const baseUrl = await boot(t, unstyledSite());

  const res = await fetch(`${baseUrl}/_more/1/12`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, />Home Post 12</);
  assert.match(html, />Home Post 13</);
  assert.doesNotMatch(html, />Home Post 11</);
});

// The rewrite carries the query string onto the rewritten `req.url`. Express 4 parses `req.query` once,
// before the rewrite, so today the form result below reaches the handler either way; the carry-over
// is what keeps it reaching the handler under a `req.query` that re-parses `req.url` (Express 5).
test("GET /_more/1/12?…: a see-more URL with a form-result query answers the batch as a private response", async (t) => {
  const baseUrl = await boot(t, unstyledSite());

  const plain = await fetch(`${baseUrl}/_more/1/12`);
  const withFormResult = await fetch(`${baseUrl}/_more/1/12?form=contact&form_status=success`);

  // c5e98fea6 enables visitor-specific consent even without a form result.
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get("cache-control"), "private, no-store");
  assert.equal(plain.headers.get("vary"), "Cookie, Sec-GPC");
  assert.match(assertDefaultConsentPage({ html: await plain.text() }).contentHtml, />Home Post 12</);
  assert.equal(withFormResult.status, 200);
  assert.equal(withFormResult.headers.get("cache-control"), "private, no-store");
  assert.match(assertDefaultConsentPage({ html: await withFormResult.text() }).contentHtml, />Home Post 12</);
});

// --- nested-path redirect fallback --------------------------------------------------------------

test("GET /<a>/<b>: a redirect phase that throws is handed to Express's error handling", async (t) => {
  const failure = new Error("redirect phase down");
  const seen: unknown[] = [];
  const app = express();
  registerSiteRoutes(app, createRouteDeps());
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    seen.push(err);
    res.status(500).send("error handler");
  });
  const baseUrl = await startTestServer(app, t);
  t.after(registerResolvePhase({ phase: "pre_content", resolver: async () => { throw failure; } }));

  const res = await fetch(`${baseUrl}/nested/path`);

  assert.equal(res.status, 500);
  assert.equal(await res.text(), "error handler");
  assert.deepEqual(seen, [failure]);
});
