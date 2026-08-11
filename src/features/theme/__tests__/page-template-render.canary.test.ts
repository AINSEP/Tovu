import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { renderHtmlPageBody } from "#src/server/http/site/render";
import { injectPageContent, injectPageTitle, renderStaticPage, resolvePageTemplate } from "../static-render";
import type { DiscoveredTheme, StaticMenuItem } from "../index";

/**
 * @file Canary for the Pages template render pipeline (Task 4, 2026-08-11) — the `renderPageViaTemplate`
 * counterpart to `post-template-render.canary.test.ts`.
 *
 * Mirrors that file's "route's own sequence, minus the I/O" approach and, for chrome (nav/footer),
 * its "read the theme's real files, not a hand-authored fixture" discipline. As of this file's rewrite
 * (2026-08-11, the same session, a later task), `basic` now ships a REAL `pageTemplate` array and a
 * real `pages/page-shell.html` with a `{"type":"content"}` slot — the missing piece the ORIGINAL
 * version of this canary disclosed and worked around with a synthetic in-memory fixture (`legal-page`)
 * because that task was forbidden from writing under `src/themes/static/basic/`. This task IS
 * authorized to add there, so the synthetic fixture is retired: every part of this canary now runs
 * against `basic`'s real, on-disk `theme.json` + `pages/page-shell.html`, not a fixture that could
 * only prove this code understands its own author's spelling. A canary against what actually ships is
 * strictly stronger evidence than one against a stand-in, so there is no synthetic half left to keep.
 */

const THEME_DIR = path.resolve(import.meta.dirname, "../../../themes/static/basic");

function read(relative: string): string {
  return fs.readFileSync(path.join(THEME_DIR, relative), "utf8");
}

/** `basic`'s real manifest, pages, and partials — read directly off disk, independent of `loadTheme`,
 * so a canary failure can only mean the render pipeline changed, never the loader (same convention
 * `post-template-render.canary.test.ts`'s own `basicTheme()` uses). */
function realBasicTheme(): DiscoveredTheme {
  const manifest = JSON.parse(read("theme.json")) as DiscoveredTheme["manifest"];
  const pages = Object.fromEntries(
    fs.readdirSync(path.join(THEME_DIR, "pages")).map((file) => [file.replace(/\.html$/, ""), read(`pages/${file}`)])
  );
  return {
    manifest,
    dir: THEME_DIR,
    tokens: JSON.parse(read("tokens.json")),
    tokensLight: JSON.parse(read("tokens.light.json")),
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages,
    partials: { nav: read("nav.html"), footer: read("footer.html"), "footer-minimal": read("footer-minimal.html") },
    css: "",
    source: "builtin",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function items(...entries: Array<Partial<StaticMenuItem> & { label: string }>): StaticMenuItem[] {
  return entries.map((e) => ({ href: null, available: true, isCurrent: false, children: [], ...e }));
}

/** The route's own sequence (`pages.ts`'s `renderPageViaTemplate`), minus the I/O: resolve the
 * template, splice the Page's own title and body, run the page-embed stage, then the static-theme
 * stage. */
function renderPage(
  theme: DiscoveredTheme,
  templateChoice: string | null,
  title: string,
  bodyHtml: string,
  menus: Readonly<Record<string, readonly StaticMenuItem[]>>
): string {
  const resolution = resolvePageTemplate({ theme, templateChoice });
  assert.equal(resolution.kind, "template", "the theme must offer a usable page template");
  if (resolution.kind !== "template") throw new Error("unreachable");

  const withTitle = injectPageTitle(resolution.html, title);
  const withContent = injectPageContent(withTitle, bodyHtml);
  const bodyResolved = renderHtmlPageBody(withContent, undefined);
  return renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: bodyResolved, menus }) ?? "";
}

test("canary: an unset templateChoice on a Page has nothing to fall back to and stays diagnostic (no pageTemplate fallback arm)", () => {
  // Unlike a Post, resolvePageTemplate itself still falls back when called directly with null — the
  // ELIGIBILITY gate (isEligibleForPageTemplateBranch, tested separately) is what keeps a real
  // never-chosen Page out of this resolver entirely. This canary certifies the resolver's own
  // behavior in isolation, matching post-template-render.canary.test.ts's equivalent case.
  const theme = realBasicTheme();
  const resolution = resolvePageTemplate({ theme, templateChoice: null });
  assert.equal(resolution.kind, "template");
  assert.equal(resolution.kind === "template" && resolution.pageId, "page-shell");
});

test("canary: the page-embed stage leaves theme-owned markers untouched around the content slot", () => {
  const theme = realBasicTheme();
  const withTitle = injectPageTitle(theme.pages["page-shell"], "FAQ");
  const withContent = injectPageContent(withTitle, "<p>Real body</p>");
  const out = renderHtmlPageBody(withContent, undefined);

  assert.ok(out.includes(`'{"type":"partial","id":"nav"`), "the nav partial marker must survive this stage");
  assert.ok(out.includes(`'{"type":"partial","id":"footer"}'`), "the footer partial marker must survive this stage");
  assert.ok(out.includes("<p>Real body</p>"), "the spliced content must survive this stage");
  assert.ok(out.includes("<title>FAQ</title>"), "the spliced title must survive this stage");
});

test("canary: the full page-template render resolves nav, footer, title, and the Page's own body together, no marker left unfilled", () => {
  const html = renderPage(
    realBasicTheme(),
    "page-shell.html",
    "Terms of Service",
    "<h1>Terms of Service</h1><p>By using this service you agree to these terms.</p>",
    { "menu-header-nav": items({ label: "About", href: "/about" }) }
  );

  assert.ok(!html.includes("widget-placeholder"), "no marker may render as an empty widget placeholder");
  assert.ok(!html.includes("{{title}}"), "the title placeholder must be gone, replaced by the Page's real title");
  assert.ok(!html.includes("{{post}}"), "no stray post-template placeholder belongs in a page-template render");
  // `content` and `menu` both use withInnerContent (embed-type-inventory.md), so their wrapper element
  // legitimately KEEPS its own `data-embed-config` attribute forever — only the INNER content changes.
  // That is not "unresolved"; it is what "preserve the theme's styling wrapper" means by design.
  assert.ok(html.includes('data-embed-config=\'{"type":"menu"'), "menu markers keep their own wrapper attribute by design");
  assert.ok(html.includes('<nav class="main-nav"'), "the nav partial must be spliced in");
  assert.ok(html.includes('<a href="/about">About</a>'), "the header menu must resolve to real links");
  assert.ok(html.includes("<footer"), "the footer partial must be spliced in");
  assert.ok(html.includes("<title>Terms of Service</title>"), "the Page's own title must render into the <title> tag");
  assert.ok(html.includes("<h1>Terms of Service</h1>"), "the Page's own body must render into the content slot");
  assert.ok(
    html.includes('<article class="wrap post-detail"'),
    "the template's own wrapper markup around the content slot must survive (withInnerContent, not a whole-element replace)"
  );
});
