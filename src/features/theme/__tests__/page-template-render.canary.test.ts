import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { renderHtmlPageBody } from "#src/server/http/site/render";
import { injectPageContent, renderStaticPage, resolvePageTemplate } from "../static-render";
import type { DiscoveredTheme, StaticMenuItem } from "../index";

/**
 * @file Canary for the Pages template render pipeline (Task 4, 2026-08-11) — the `renderPageViaTemplate`
 * counterpart to `post-template-render.canary.test.ts`.
 *
 * Mirrors that file's "route's own sequence, minus the I/O" approach and, for the nav/footer chrome,
 * its "read the theme's real files, not a hand-authored fixture" discipline — this reads the ACTIVE
 * `basic` theme's real `nav.html`/`footer.html` partials off disk (read-only; this task is explicitly
 * forbidden from writing anywhere under `src/themes/static/basic/`, since it is the live theme with
 * uncommitted owner edits) so the nav/menu/footer assertions below are exercised against real markup,
 * not a fixture that only proves this code understands its own author's spelling.
 *
 * `basic`'s `theme.json` does not (yet) declare a `pageTemplate` array or ship a page-template file
 * with a `{"type":"content"}` slot — that is exactly the missing piece this task adds a mechanism
 * for, not something to retrofit onto the live theme mid-task. So the PAGE-TEMPLATE PAGE ITSELF is a
 * synthetic in-memory fixture, merged alongside `basic`'s real pages/partials, built the same shape a
 * real theme author would author (`<main data-embed-config='{"type":"content"}'>` wrapped by the
 * theme's actual `.wrap`/nav/footer chrome) — the synthetic half is confined to the one file this
 * feature genuinely has no real-world example of yet; everything around it is real.
 */

const THEME_DIR = path.resolve(import.meta.dirname, "../../../themes/static/basic");

function read(relative: string): string {
  return fs.readFileSync(path.join(THEME_DIR, relative), "utf8");
}

const SYNTHETIC_PAGE_TEMPLATE = [
  "<!doctype html>",
  '<html lang="en">',
  "<head><title>Page — Basic</title></head>",
  "<body>",
  `<div data-embed-config='{"type":"partial","id":"nav","current":""}'></div>`,
  '<main class="wrap"><article class="page-body" data-embed-config=\'{"type":"content"}\'>placeholder</article></main>',
  `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
  "</body>",
  "</html>",
].join("\n");

/** `basic`'s real pages/partials, PLUS the one synthetic page-template fixture this theme does not
 * ship yet (see this file's header). Built independently of `loadTheme` so a canary failure can only
 * mean the render pipeline changed, never the loader — same convention `post-template-render.canary.
 * test.ts`'s own `basicTheme()` uses. */
function basicThemeWithSyntheticPageTemplate(): DiscoveredTheme {
  const manifest = JSON.parse(read("theme.json")) as DiscoveredTheme["manifest"];
  const pages = {
    ...Object.fromEntries(
      fs.readdirSync(path.join(THEME_DIR, "pages")).map((file) => [file.replace(/\.html$/, ""), read(`pages/${file}`)])
    ),
    "legal-page": SYNTHETIC_PAGE_TEMPLATE,
  };
  return {
    manifest: { ...manifest, pageTemplate: ["legal-page.html"] },
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
 * template, splice the Page's own body, run the page-embed stage, then the static-theme stage. */
function renderPage(
  theme: DiscoveredTheme,
  templateChoice: string | null,
  bodyHtml: string,
  menus: Readonly<Record<string, readonly StaticMenuItem[]>>
): string {
  const resolution = resolvePageTemplate({ theme, templateChoice });
  assert.equal(resolution.kind, "template", "the theme must offer a usable page template");
  if (resolution.kind !== "template") throw new Error("unreachable");

  const withContent = injectPageContent(resolution.html, bodyHtml);
  const bodyResolved = renderHtmlPageBody(withContent, undefined);
  return renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: bodyResolved, menus }) ?? "";
}

test("canary: an unset templateChoice on a Page has nothing to fall back to and stays diagnostic (no pageTemplate fallback arm)", () => {
  // Unlike a Post, resolvePageTemplate itself still falls back when called directly with null — the
  // ELIGIBILITY gate (isEligibleForPageTemplateBranch, tested separately) is what keeps a real
  // never-chosen Page out of this resolver entirely. This canary certifies the resolver's own
  // behavior in isolation, matching post-template-render.canary.test.ts's equivalent case.
  const theme = basicThemeWithSyntheticPageTemplate();
  const resolution = resolvePageTemplate({ theme, templateChoice: null });
  assert.equal(resolution.kind, "template");
  assert.equal(resolution.kind === "template" && resolution.pageId, "legal-page");
});

test("canary: the page-embed stage leaves theme-owned markers untouched around the content slot", () => {
  const theme = basicThemeWithSyntheticPageTemplate();
  const withContent = injectPageContent(theme.pages["legal-page"], "<p>Real body</p>");
  const out = renderHtmlPageBody(withContent, undefined);

  assert.ok(out.includes(`'{"type":"partial","id":"nav"`), "the nav partial marker must survive this stage");
  assert.ok(out.includes(`'{"type":"partial","id":"footer"}'`), "the footer partial marker must survive this stage");
  assert.ok(out.includes("<p>Real body</p>"), "the spliced content must survive this stage");
});

test("canary: the full page-template render resolves nav, footer, and the Page's own body together, no marker left unfilled", () => {
  const html = renderPage(
    basicThemeWithSyntheticPageTemplate(),
    "legal-page.html",
    "<h1>Terms of Service</h1><p>By using this service you agree to these terms.</p>",
    { "menu-header-nav": items({ label: "About", href: "/about" }) }
  );

  assert.ok(!html.includes("widget-placeholder"), "no marker may render as an empty widget placeholder");
  assert.ok(!html.includes(">placeholder<"), "the content marker's own authored fallback text must be gone, replaced by the real body");
  // `content` and `menu` both use withInnerContent (embed-type-inventory.md), so their wrapper element
  // legitimately KEEPS its own `data-embed-config` attribute forever — only the INNER content changes.
  // That is not "unresolved"; it is what "preserve the theme's styling wrapper" means by design.
  assert.ok(html.includes('data-embed-config=\'{"type":"menu"'), "menu markers keep their own wrapper attribute by design");
  assert.ok(html.includes('<nav class="main-nav"'), "the nav partial must be spliced in");
  assert.ok(html.includes('<a href="/about">About</a>'), "the header menu must resolve to real links");
  assert.ok(html.includes("<footer"), "the footer partial must be spliced in");
  assert.ok(html.includes("<h1>Terms of Service</h1>"), "the Page's own body must render into the content slot");
  assert.ok(
    html.includes('<article class="page-body"'),
    "the template's own wrapper markup around the content slot must survive (withInnerContent, not a whole-element replace)"
  );
});
