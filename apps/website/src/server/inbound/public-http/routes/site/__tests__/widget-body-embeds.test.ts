import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { renderHtmlPageBody, renderSite } from "#src/server/inbound/public-http/http/site/render";
import { renderBareEntryDocument } from "#src/server/inbound/public-http/http/site/bare-page";
import { finishStaticTierDocument, renderViaTemplate, resolveHtmlEmbedsForRender } from "../pages.js";

const WIDGET_ID = "9004b382-ba7d-4191-82fb-84d0c533ad14";
const NOW = "2026-10-06T00:00:00.000Z";
const LEGACY_MARKER = `<div data-embed-type="widget" data-embed-id="${WIDGET_ID}"></div>`;
const CURRENT_MARKER = `<div data-embed-config='{"type":"widget","id":"${WIDGET_ID}"}'></div>`;
const WIDGET_HTML = '<div class="widget widget-text">Widget &amp; body</div>';

async function fixture(kind: "page" | "post" = "page", marker = LEGACY_MARKER) {
  const deps = createRouteDeps();
  await deps.entryRepo.save({
    id: WIDGET_ID, workspaceId: deps.workspaceId, type: "widget", slug: "body-widget",
    title: "Body widget", status: "published", bodyJson: null,
    fieldsJson: { ext: { widget: { payload: JSON.stringify({ status: "active", widgetType: "text", config: { body: "Widget & body" } }) } } },
    publishedAt: NOW, createdAt: NOW, updatedAt: NOW, version: 1,
  });
  const post: PostRecord = {
    id: "body-page", workspaceId: deps.workspaceId, slug: "body-page", title: "Body page",
    status: "published", kind, bodyFormat: "html", bodyJson: { type: "doc", content: [] },
    bodyHtml: `<section id="widget-regression"><p>before</p>${marker}<p>after</p></section>`,
    templateChoice: null, createdAt: NOW, updatedAt: NOW, version: 1,
  };
  await deps.postRepo.save(post);
  return { deps, post };
}

function theme(): DiscoveredTheme {
  return {
    manifest: { id: "widget-body-test", name: "Widget body test", version: "1.0.0", tier: "static", engine: 1, templates: ["content-template.html"] },
    dir: "/nonexistent/widget-body-test", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { "content-template": '<html><body><main><div data-embed-config=\'{"type":"content"}\'></div></main></body></html>' },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as DiscoveredTheme;
}

function assertBody(html: string, content: string) {
  const start = html.indexOf('<section id="widget-regression">');
  assert.equal(html.slice(start, html.indexOf("</section>", start) + "</section>".length),
    `<section id="widget-regression"><p>before</p>${content}<p>after</p></section>`);
}

test("a page body with a legacy widget UUID marker renders the existing widget server-side", async () => {
  const { deps, post } = await fixture();
  const resolved = await resolveHtmlEmbedsForRender(deps, post);
  assert.equal(renderHtmlPageBody(post.bodyHtml!, resolved),
    `<section id="widget-regression"><p>before</p>${WIDGET_HTML}<p>after</p></section>`);
});

for (const kind of ["page", "post"] as const) {
  test(`${kind}: legacy widgets render through the public fallback render path`, async () => {
    const { deps, post } = await fixture(kind);
    const pageHtmlEmbeds = await resolveHtmlEmbedsForRender(deps, post);
    const html = await renderSite({ theme: null, route: "post", siteTitle: "Widgets", posts: [post], post, pageHtmlEmbeds });
    assertBody(html, WIDGET_HTML);
  });

  test(`${kind}: legacy widgets render through a static theme's content template`, async () => {
    const { deps, post } = await fixture(kind);
    assertBody(await renderViaTemplate(deps, theme(), post, undefined), WIDGET_HTML);
  });

  for (const tier of ["declarative", "templated", "handlebars"] as const) {
    test(`${kind}: legacy widgets render through the ${tier} content path`, async () => {
      const { deps, post } = await fixture(kind);
      const activeTheme = theme();
      activeTheme.manifest.tier = tier;
      activeTheme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
      activeTheme.liquidTemplates.entry = "{{ post.content | raw }}";
      activeTheme.handlebarsTemplates.entry = "{{{post.content}}}";
      const pageHtmlEmbeds = await resolveHtmlEmbedsForRender(deps, post);
      assertBody(await renderSite({ theme: activeTheme, route: "post", siteTitle: "Widgets", posts: [post], post, pageHtmlEmbeds }), WIDGET_HTML);
    });
  }
}

for (const fullDocument of [false, true]) {
  test(`bare HTML-mode pages expand widgets in a ${fullDocument ? "complete document" : "fragment"}`, async () => {
    const { deps, post } = await fixture();
    post.templateChoice = "";
    if (fullDocument) post.bodyHtml = `<!doctype html><html><body>${post.bodyHtml}</body></html>`;
    const pageHtmlEmbeds = await resolveHtmlEmbedsForRender(deps, post);
    assertBody(renderBareEntryDocument({ post, siteTitle: "Widgets", pageHtmlEmbeds }), WIDGET_HTML);
  });
}

test("a legacy menu widget and a current menu marker render together through the static document pipeline", async () => {
  const { deps, post } = await fixture();
  await deps.menuRepo.save({
    id: "body-menu", workspaceId: deps.workspaceId, slug: "body-menu", title: "Body menu", status: "published",
    doc: { type: "menu", version: 1, items: [{ id: "home", label: "Journey Home", target: { kind: "url", href: "/" } }] },
    locations: [], updatedAt: NOW, version: 1,
  });
  const widget = await deps.entryRepo.findById({ workspaceId: deps.workspaceId, id: WIDGET_ID });
  assert.ok(widget);
  await deps.entryRepo.save({ ...widget, version: 2,
    fieldsJson: { ext: { widget: { payload: JSON.stringify({ status: "active", widgetType: "menu", config: { menuRef: "body-menu" } }) } } },
  });
  const widgetHtml = '<nav class="widget widget-menu"><h3 class="widget-menu-title">Body menu</h3><ul><li><a href="/">Journey Home</a></li></ul></nav>';
  const menuHtml = '<nav data-tovu-menu="body-menu"><ul data-tovu-menu-list data-depth="0"><li data-tovu-menu-item data-depth="0" data-current="true" data-active="true" data-has-children="false"><a href="/" aria-current="page" data-toolname="menu_body-menu_0" data-tooldescription="Journey Home">Journey Home</a></li></ul></nav>';
  const html = await finishStaticTierDocument(deps, {
    theme: theme(), pageId: "content-template", currentPath: "/", staticMenus: undefined,
    html: post.bodyHtml!.replace("<p>after</p>", `<div data-embed-config='{"type":"menu","id":"body-menu","mode":"html"}'></div><p>after</p>`),
  });
  assertBody(html, widgetHtml + menuHtml);
});

test("HTML-mode static documents and partials use the same widget expansion", async () => {
  const { deps, post } = await fixture();
  const activeTheme = theme();
  activeTheme.partials.nav = post.bodyHtml!;
  const html = await finishStaticTierDocument(deps, {
    theme: activeTheme, pageId: "content-template", currentPath: "/body-page", staticMenus: undefined,
    html: '<html><body><div data-embed-config=\'{"type":"partial","id":"nav"}\'></div></body></html>',
  });
  assertBody(html, WIDGET_HTML);
});

for (const marker of [LEGACY_MARKER, CURRENT_MARKER]) {
  test(`a missing widget renders nothing: ${marker}`, async () => {
    const missing = marker.replace(WIDGET_ID, "does-not-exist");
    const { deps, post } = await fixture("page", missing);
    assert.equal(renderHtmlPageBody(post.bodyHtml!, await resolveHtmlEmbedsForRender(deps, post)),
      '<section id="widget-regression"><p>before</p><p>after</p></section>');
    assertBody(await renderViaTemplate(deps, theme(), post, undefined), "");
  });
}
