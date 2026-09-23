import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import type { EntryRecord } from "#src/features/entries/index";
import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { InMemoryMenuRepo, NAV_DOC_TYPE } from "#src/features/navigation/index";
import type { NavMenuEntry } from "#src/features/navigation/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import type { ContentTypeRecord } from "#src/features/content-types/index";
import { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";

/**
 * @file E3 (D2, 2026-09-23) — coverage for `finishStaticTierDocument`, the one static-tier document
 * pipeline `renderViaTemplate` and `resolveMarketingPageOrOverride` now both run through. Every
 * marker below sits somewhere the OLD, per-surface code never scanned: a Page/Post's own authored
 * `body_html` (menu, post-previews) or a theme partial (widget) — proving the fix, not just the
 * mechanism already covered by `static-menu-embed-resolution.test.ts`/`static-post-previews-
 * resolution.test.ts` (which this suite leaves untouched and re-runs as a regression check).
 *
 * C5 (collections plan, 2026-09-23) added the block at the bottom of this file: coverage for
 * `resolveCollectionListsForRender`/`resolveOneCollectionMarker` (`pages.ts`), the `collection`
 * marker's own `finishStaticTierDocument` resolution step. Uses a SEPARATE theme fixture
 * (`themeForCollectionMarkers`) rather than `themeWithEmbedsEverywhere()` above, so these new tests
 * cannot perturb that suite's own assertions.
 */

const WORKSPACE_ID = createRouteDeps().workspaceId;
const NOW = "2026-09-23T00:00:00.000Z";
const MENU_SLUG = "footer-nav";
const WIDGET_SLUG = "promo-widget";

/** One theme, reused by every test: a shared post template whose bare `{"type":"content"}` marker
 *  is where the CURRENT post/page's own body lands (`injectCurrentEntityContentId`), a `pricing`
 *  marketing page, and a `nav` partial both of which reference the SAME widget marker — proving the
 *  fix resolves a partial-borne widget on both surfaces, per the same pipeline. Carries no menu
 *  marker anywhere in ITS OWN files, so `scanMenuEmbedIds` (the pre-existing, theme-file-only scan)
 *  never finds `MENU_SLUG` — only a Post's own body does, which is exactly the gap under test. */
function themeWithEmbedsEverywhere(): DiscoveredTheme {
  const widgetMarker = `<div data-embed-config='{"type":"widget","slug":"${WIDGET_SLUG}"}'>fallback widget text</div>`;
  const navPartialMarker = `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;
  const contentMarker = `<div data-embed-config='{"type":"content"}'></div>`;
  return {
    manifest: {
      id: "embeds-everywhere-test-theme",
      name: "Embeds Everywhere Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: ["post-template.html"],
      // Theme pages are OFF by default (2026-08-30 owner decision) -- opt `pricing` in explicitly.
      publishedPages: ["pricing"],
    },
    dir: "/nonexistent/embeds-everywhere-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      pricing: `<html><body>${navPartialMarker}<main>${widgetMarker}</main></body></html>`,
      "post-template": `<html><body>${navPartialMarker}<main>${contentMarker}</main></body></html>`,
    },
    partials: {
      nav: `<nav>${widgetMarker}</nav>`,
    },
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function templatedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "A templated post",
    slug: "a-templated-post",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "html",
    bodyHtml: "<p>Welcome</p>",
    status: "published",
    kind: "post",
    templateChoice: null,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  } as PostRecord;
}

// The widget content-type/field-namespace/payload-field literals ("widget", "widget", "payload")
// mirror `widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts`'s own
// `seedWidget` shape byte-for-byte (`WIDGET_CONTENT_TYPE`/`WIDGET_FIELD_NAMESPACE`/
// `WIDGET_PAYLOAD_FIELD`). Inlined rather than imported: those constants live in `features/widgets/`
// internals with no barrel re-export, and this route-level test must not deep-import across the
// feature boundary just to seed a fixture.
function seedTextWidget(entryRepo: InMemoryEntryRepo, slug: string, body: string): Promise<void> {
  return entryRepo.save({
    id: `widget-${slug}`,
    workspaceId: WORKSPACE_ID,
    type: "widget",
    slug,
    status: "published",
    title: "A widget",
    bodyJson: null,
    fieldsJson: {
      ext: {
        widget: { payload: JSON.stringify({ status: "active", widgetType: "text", config: { body } }) },
      },
    },
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  } as never);
}

function footerNavMenu(): NavMenuEntry {
  return {
    id: "menu-footer-nav-id",
    workspaceId: WORKSPACE_ID,
    slug: MENU_SLUG,
    title: "Footer Nav",
    status: "published",
    doc: {
      type: NAV_DOC_TYPE,
      version: 1,
      items: [{ id: "item-1", label: "Docs Home Link", target: { kind: "url", href: "https://docs.example.com" } }],
    },
    locations: [],
    updatedAt: NOW,
    version: 1,
  } as unknown as NavMenuEntry;
}

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /:slug (template branch): a menu marker in a Post's OWN body_html -- one the theme's own files never reference -- resolves to real menu links", async (t) => {
  const post = templatedPost({
    bodyHtml: `<p>Welcome</p><div data-embed-config='{"type":"menu","id":"${MENU_SLUG}"}'></div>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeWithEmbedsEverywhere()],
    postRepo: new InMemoryPostRepo([post]),
    menuRepo: new InMemoryMenuRepo([footerNavMenu()]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Docs Home Link/, "a menu marker authored directly in a Page/Post body must resolve to real menu items");
  assert.match(html, /href="https:\/\/docs\.example\.com"/);
});

test("GET /:slug (template branch): a post-previews marker in a Post's OWN body_html renders real post cards", async (t) => {
  const target = templatedPost({
    id: "post-with-marker",
    slug: "post-with-marker",
    bodyHtml: '<p>Welcome</p><div data-embed-config=\'{"type":"post-previews","limit":2}\'></div>',
  });
  const other = templatedPost({ id: "other-post", slug: "other-post", title: "Other Post Title" });
  const { server, baseUrl } = await startServer({
    themes: [themeWithEmbedsEverywhere()],
    postRepo: new InMemoryPostRepo([target, other]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${target.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Other Post Title/, "the post-previews marker inside this post's OWN body must resolve to real post cards -- this file's own live bug (pages.ts previously scanned only the raw, unassembled template)");
});

test("GET /pricing (marketing page): a {\"type\":\"widget\",\"slug\":...} text widget renders the widget's real body", async (t) => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, WIDGET_SLUG, "Real widget body text");
  const { server, baseUrl } = await startServer({
    themes: [themeWithEmbedsEverywhere()],
    postRepo: new InMemoryPostRepo([]),
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/pricing`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Real widget body text/, "a widget marker directly on a theme marketing page must resolve -- marketing pages never ran resolveHtmlPageEmbeds before this fix");
  assert.doesNotMatch(html, /fallback widget text/, "the real widget body must replace the theme's authored fallback, not sit alongside it");
});

test("a widget marker inside a theme partial (nav) resolves on BOTH the marketing page and the template-rendered post", async (t) => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, WIDGET_SLUG, "Nav widget body text");
  const post = templatedPost();
  const { server, baseUrl } = await startServer({
    themes: [themeWithEmbedsEverywhere()],
    postRepo: new InMemoryPostRepo([post]),
    entryRepo,
  });
  t.after(() => closeServer(server));

  const marketingRes = await fetch(`${baseUrl}/pricing`);
  assert.equal(marketingRes.status, 200);
  assert.match(await marketingRes.text(), /Nav widget body text/, "the partial-borne widget must resolve on the marketing page");

  const templateRes = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(templateRes.status, 200);
  assert.match(await templateRes.text(), /Nav widget body text/, "the SAME partial-borne widget must also resolve on a template-rendered post");
});

// ---------------------------------------------------------------------------------------------
// C5 (collections plan, 2026-09-23): `{"type":"collection"}` marker resolution.
// ---------------------------------------------------------------------------------------------

const GADGET_TYPE_KEY = "gadget";
/** A content type row registered under a D8 system-type key, to exercise
 *  `parseCollectionListConfig`'s `SYSTEM_CONTENT_TYPES` rejection specifically (as opposed to the
 *  separate "no content type registered at all" miss). */
const SYSTEM_TYPE_KEY = "widget";

/** Isolated from `themeWithEmbedsEverywhere()` above: its own template page carries only the bare
 *  `{"type":"content"}` marker a Post/Page's own body lands in (so a collection marker authored
 *  directly in `bodyHtml` is what these tests exercise), and its `pricing` marketing page carries
 *  the caller-supplied marker directly, for the separate marketing-page surface. */
function themeForCollectionMarkers(pricingMarker: string): DiscoveredTheme {
  return {
    manifest: {
      id: "collection-marker-test-theme",
      name: "Collection Marker Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: ["post-template.html"],
      publishedPages: ["pricing"],
    },
    dir: "/nonexistent/collection-marker-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      pricing: `<html><body><main>${pricingMarker}</main></body></html>`,
      "post-template": `<html><body><main><div data-embed-config='{"type":"content"}'></div></main></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function gadgetContentType(): ContentTypeRecord {
  return {
    workspaceId: WORKSPACE_ID,
    key: GADGET_TYPE_KEY,
    label: "Gadget",
    fields: [
      { name: "price", kind: "integer", required: false, queryable: true },
      { name: "category", kind: "text", required: false, queryable: true },
    ],
    status: "active",
    version: 1,
  };
}

/** A content type row at the reserved `SYSTEM_TYPE_KEY` — exists purely so a marker naming it
 *  reaches `parseCollectionListConfig`'s own D8 rejection instead of the earlier "unknown content
 *  type" miss. */
function systemContentType(): ContentTypeRecord {
  return {
    workspaceId: WORKSPACE_ID,
    key: SYSTEM_TYPE_KEY,
    label: "Widget",
    fields: [],
    status: "active",
    version: 1,
  };
}

function gadgetEntry(overrides: Partial<EntryRecord> & { id: string; slug: string }): EntryRecord {
  return {
    workspaceId: WORKSPACE_ID,
    type: GADGET_TYPE_KEY,
    status: "published",
    title: "A gadget",
    bodyJson: null,
    fieldsJson: { ext: { site: { price: 0, category: "tools" } } },
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

async function seededContentTypeRepo(rows: readonly ContentTypeRecord[]): Promise<InMemoryContentTypeRepo> {
  const repo = new InMemoryContentTypeRepo();
  await Promise.all(rows.map((row) => repo.save(row)));
  return repo;
}

/** `InMemoryEntryRepo` (used by `seedTextWidget` above, for the pre-existing widget tests) has no
 *  `listPublishedForDisplay` -- only this host-side wrapper implements `EntryDisplayListPort`,
 *  matching the composition root's own default (`app.ts`'s `createRouteDeps`). */
async function seededEntryRepo(rows: readonly EntryRecord[]): Promise<TrashAwareInMemoryEntryRepo> {
  const repo = new TrashAwareInMemoryEntryRepo();
  await Promise.all(rows.map((row) => repo.save(row)));
  return repo;
}

/** Three published gadgets at distinct `publishedAt` timestamps (oldest to newest: Alpha, Beta,
 *  Gamma) plus one DRAFT gadget that must never appear in a resolved collection list. Alpha/Beta
 *  are `category: "tools"`; Gamma is `category: "home"` — the split the `where` filter test below
 *  relies on. */
function threePublishedGadgetsPlusOneDraft(): readonly EntryRecord[] {
  return [
    gadgetEntry({
      id: "gadget-alpha",
      slug: "gadget-alpha",
      title: "Widget Alpha",
      publishedAt: "2026-09-01T00:00:00.000Z",
      fieldsJson: { ext: { site: { price: 10, category: "tools" } } },
    }),
    gadgetEntry({
      id: "gadget-beta",
      slug: "gadget-beta",
      title: "Widget Beta",
      publishedAt: "2026-09-10T00:00:00.000Z",
      fieldsJson: { ext: { site: { price: 20, category: "tools" } } },
    }),
    gadgetEntry({
      id: "gadget-gamma",
      slug: "gadget-gamma",
      title: "Widget Gamma",
      publishedAt: "2026-09-15T00:00:00.000Z",
      fieldsJson: { ext: { site: { price: 30, category: "home" } } },
    }),
    gadgetEntry({
      id: "gadget-draft",
      slug: "gadget-draft",
      title: "Widget Draft",
      status: "draft",
      publishedAt: null,
    }),
  ];
}

test("GET /:slug (template branch): a bare collection marker in a Post's OWN body_html renders 3 published cards, newest first, titles unlinked", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const post = templatedPost({
    bodyHtml: `<p>Welcome</p><div data-embed-config='{"type":"collection","typeKey":"${GADGET_TYPE_KEY}"}'>No gadgets yet</div>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers("")],
    postRepo: new InMemoryPostRepo([post]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Widget Gamma/);
  assert.match(html, /Widget Beta/);
  assert.match(html, /Widget Alpha/);
  assert.doesNotMatch(html, /Widget Draft/, "a draft entry must never appear in a resolved collection list");
  assert.doesNotMatch(html, /No gadgets yet/, "a successful resolution replaces the marker's authored fallback");
  assert.doesNotMatch(html, /<a[^>]*>Widget/, "D1: entry pages are off, so a title must render as plain text, never a link");
  const gammaIndex = html.indexOf("Widget Gamma");
  const betaIndex = html.indexOf("Widget Beta");
  const alphaIndex = html.indexOf("Widget Alpha");
  assert.ok(gammaIndex < betaIndex && betaIndex < alphaIndex, "default sort is newest-published-first");
});

test("GET /:slug (template branch): a collection marker's `where` filter excludes non-matching entries", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const post = templatedPost({
    bodyHtml: `<div data-embed-config='{"type":"collection","typeKey":"${GADGET_TYPE_KEY}","where":{"category":"tools"}}'></div>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers("")],
    postRepo: new InMemoryPostRepo([post]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Widget Alpha/);
  assert.match(html, /Widget Beta/);
  assert.doesNotMatch(html, /Widget Gamma/, 'where:{"category":"tools"} must exclude the "home"-category entry');
});

test("GET /:slug (template branch): a collection marker naming an unknown `where` field leaves the authored fallback untouched", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const post = templatedPost({
    bodyHtml: `<div data-embed-config='{"type":"collection","typeKey":"${GADGET_TYPE_KEY}","where":{"bogus":"x"}}'>No gadgets configured</div>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers("")],
    postRepo: new InMemoryPostRepo([post]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /No gadgets configured/, "an unknown where-field rejects the whole config; the marker's own fallback survives");
  assert.doesNotMatch(html, /Widget Alpha/);
});

test("GET /:slug (template branch): a collection marker naming a system content type (`widget`) leaves the authored fallback untouched", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType(), systemContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const post = templatedPost({
    bodyHtml: `<div data-embed-config='{"type":"collection","typeKey":"${SYSTEM_TYPE_KEY}"}'>No widgets to list</div>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers("")],
    postRepo: new InMemoryPostRepo([post]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /No widgets to list/, "D8: a system content type (widget/widget_area/nav menu) is never listable -- fallback survives");
});

test("GET /pricing (marketing page): a bare collection marker directly on a theme marketing page resolves", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const pricingMarker = `<div data-embed-config='{"type":"collection","typeKey":"${GADGET_TYPE_KEY}","where":{"category":"tools"}}'>No gadgets</div>`;
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers(pricingMarker)],
    postRepo: new InMemoryPostRepo([]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/pricing`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Widget Alpha/, "a collection marker authored directly on a theme marketing page must resolve -- not only inside a Post/Page body");
  assert.match(html, /Widget Beta/);
  assert.doesNotMatch(html, /Widget Gamma/);
});

test("GET /:slug (template branch): the marker element's own wrapper attributes (class/id/style) survive resolution, data-embed-config is stripped", async (t) => {
  const contentTypeRepo = await seededContentTypeRepo([gadgetContentType()]);
  const entryRepo = await seededEntryRepo(threePublishedGadgetsPlusOneDraft());
  const post = templatedPost({
    bodyHtml: `<section data-embed-config='{"type":"collection","typeKey":"${GADGET_TYPE_KEY}"}' class="my-collection" id="feat-list" style="color:red">fallback</section>`,
  });
  const { server, baseUrl } = await startServer({
    themes: [themeForCollectionMarkers("")],
    postRepo: new InMemoryPostRepo([post]),
    contentTypeRepo,
    entryRepo,
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/${post.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(
    html,
    /<section class="my-collection" id="feat-list" style="color:red">/,
    "D3: the collection marker keeps its wrapper element and authored attributes on a hit"
  );
  assert.doesNotMatch(html, /data-embed-config/, "data-embed-config is stripped on the hit path so a re-scan can never re-resolve it");
  assert.match(html, /Widget Gamma/);
});
