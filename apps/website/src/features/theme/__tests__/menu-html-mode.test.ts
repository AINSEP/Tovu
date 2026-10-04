import assert from "node:assert/strict";
import test from "node:test";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { renderStaticPage, type StaticMenuItem } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

function theme(html: string): DiscoveredTheme {
  return {
    manifest: { id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 },
    dir: "/fake", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { index: html }, partials: {}, css: "", source: "site", status: "valid", errors: [],
  };
}
function item(overrides: Partial<StaticMenuItem> = {}): StaticMenuItem {
  return { label: "Docs", href: "/docs", available: true, isCurrent: false, children: [], ...overrides };
}
function elements(root: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Element[] {
  return [...("tagName" in root ? [root] : []), ...("childNodes" in root ? root.childNodes.flatMap(elements) : [])];
}

test("menu mode html takes the static injection path and emits an unstyled semantic tree", () => {
  const html = renderStaticPage({
    theme: theme(`<div data-embed-config='{"type":"menu","id":"docs","mode":"html"}'></div>`), pageId: "index",
    menus: { docs: [item({ label: "A < B", isActive: true, attrs: { cssClass: "theme-nav", icon: "book", description: "Read & learn" }, children: [item({ isCurrent: true })] })] },
  })!;
  const nodes = elements(parseFragment(html));
  const nav = nodes.find((node) => node.tagName === "nav")!;
  assert.ok(nav);
  assert.equal(nav.childNodes[0] && "tagName" in nav.childNodes[0] && nav.childNodes[0].tagName, "ul");
  const lists = nodes.filter((node) => node.tagName === "ul");
  assert.equal(lists.length, 2);
  assert.equal(lists[1].parentNode && "tagName" in lists[1].parentNode && lists[1].parentNode.tagName, "li");
  assert.match(html, /aria-current="page"/);
  assert.match(html, /data-depth="1"/);
  assert.match(html, /data-active="true"/);
  assert.match(html, /A &lt; B/);
  assert.match(html, /Read &amp; learn/);
  assert.doesNotMatch(html, /class=|style=|data-embed-config/);
});

test("HTML menu preserves live descendants and applies the existing public URL policy", () => {
  const html = renderStaticPage({
    theme: theme(`<nav data-embed-config='{"type":"menu","id":"docs","mode":"html","variant":"tree"}'></nav>`), pageId: "index",
    menus: { docs: [
      item({ label: "Deleted", available: false }),
      item({ label: "Section", available: false, children: [item({ label: "Unsafe", href: "javascript:alert(1)", attrs: { openInNewTab: true, rel: "external" } })] }),
    ] },
  })!;
  assert.doesNotMatch(html, /Deleted|javascript:/);
  assert.match(html, /<span data-tovu-menu-label>Section<\/span><ul/);
  assert.match(html, /href="#"/);
  assert.match(html, /rel="external noopener noreferrer"/);
  assert.doesNotMatch(html, /class=|style=/);
});

test("missing or empty HTML menus keep authored fallback; default modes keep their established markup", () => {
  const marker = `<nav data-embed-config='{"type":"menu","id":"docs","mode":"html"}'>Fallback</nav>`;
  assert.equal(renderStaticPage({ theme: theme(marker), pageId: "index" }), marker);
  assert.equal(renderStaticPage({ theme: theme(marker), pageId: "index", menus: { docs: [] } }), marker);
  const flat = renderStaticPage({ theme: theme(`<nav data-embed-config='{"type":"menu","id":"docs"}'></nav>`), pageId: "index", menus: { docs: [item()] } })!;
  assert.match(flat, /<a href="\/docs">Docs<\/a>/);
  assert.doesNotMatch(flat, /<ul/);
  const tree = renderStaticPage({ theme: theme(`<nav data-embed-config='{"type":"menu","id":"docs","variant":"tree"}'></nav>`), pageId: "index", menus: { docs: [item()] } })!;
  assert.match(tree, /class="menu-list depth-0"/);
});
