import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "#src/features/post/index";
import { InMemoryMenuRepo, NAV_DOC_TYPE, type NavMenuEntry } from "#src/features/navigation/index";
import { resolveStaticMenusForRender } from "#src/server/inbound/public-http/routes/site/pages";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { renderStaticPage } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Menu HTML mode (owner 2026-10-08): a menu whose doc is in `"html"` mode renders the author's
 * own stored markup wherever its marker sits, instead of the item tree.
 */

function theme(html: string): DiscoveredTheme {
  return {
    manifest: { id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1, publishedPages: ["index"] },
    dir: "/fake", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { index: html }, partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
}

function menu(doc: Partial<NavMenuEntry["doc"]>): NavMenuEntry {
  return {
    id: "menu-1", workspaceId: "workspace-local", slug: "header-main", title: "Header", status: "published",
    doc: { type: NAV_DOC_TYPE, version: 1, items: [{ id: "home", label: "Home", target: { kind: "url", href: "/" } }], ...doc },
    locations: [], updatedAt: "2026-10-08T00:00:00.000Z", version: 1,
  };
}

async function render(page: string, row: NavMenuEntry): Promise<string> {
  const deps = { ...createRouteDeps(), postRepo: new InMemoryPostRepo([]), menuRepo: new InMemoryMenuRepo({}, { initialRows: [row] }) };
  const t = theme(page);
  const menus = await resolveStaticMenusForRender(deps, t, "/");
  return renderStaticPage({ theme: t, pageId: "index", menus }) ?? "";
}

const MARKER = `<nav class="main-nav" data-embed-config='{"type":"menu","id":"header-main"}'>Fallback</nav>`;

test("an html-mode menu renders its stored markup inside the theme's marker element", async () => {
  const html = await render(MARKER, menu({ mode: "html", html: '<ul class="my-nav"><li><a href="/x">X</a></li></ul>' }));
  assert.match(html, /<nav class="main-nav"[^>]*><ul class="my-nav"><li><a href="\/x">X<\/a><\/li><\/ul><\/nav>/);
  assert.doesNotMatch(html, /Fallback|Home/);
});

test("stored html is kept but not rendered while the menu is in items mode", async () => {
  const html = await render(MARKER, menu({ mode: "items", html: "<p>Custom</p>" }));
  assert.match(html, /Home/);
  assert.doesNotMatch(html, /Custom/);
});

test("an html-mode menu with empty html keeps the theme's authored fallback", async () => {
  assert.match(await render(MARKER, menu({ mode: "html", html: "" })), /Fallback/);
});

test("a bare Copy-HTML-embed marker is replaced by the menu's html alone", async () => {
  const html = await render(`<div data-embed-config='{"type":"menu","id":"header-main","mode":"html"}'></div>`, menu({ mode: "html", html: "<p>Mine</p>" }));
  assert.equal(html, "<p>Mine</p>");
});

test("html is placed as stored: a closing tag smuggled past the save path still renders inside the wrapper", () => {
  // The save path balances markup (Jini `menu-html.ts`); this pins that render adds no second parse
  // and never drops the wrapper the theme authored.
  const html = renderStaticPage({ theme: theme(MARKER), pageId: "index", menus: { "header-main": { html: "<b>bold</b>" } } })!;
  assert.match(html, /^<nav class="main-nav"[^>]*><b>bold<\/b><\/nav>$/);
});
