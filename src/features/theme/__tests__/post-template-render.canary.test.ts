import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { renderHtmlPageBody } from "#src/server/http/site/render";
import { injectPostEmbedId, renderStaticPage, resolvePostTemplate } from "../static-render";
import type { DiscoveredTheme, StaticMenuItem } from "../index";

/**
 * @file Canaries for the post-template render pipeline, against the REAL `basic` theme on disk.
 *
 * These exist because of what the 2026-08-10 marker unification broke and how it broke it. Moving
 * every theme onto `data-embed-config` while the consumers still matched the retired flat attributes
 * produced two failures that a fixture suite structurally cannot catch, and that both rendered a
 * plausible-looking HTTP 200 page rather than an error:
 *
 * 1. `resolvePostTemplate` tested for the literal string `data-embed-id="{{post}}"`, which no theme
 *    file contains any more. Every post fell through to the "Template not configured" diagnostic
 *    page — the same 2026-08-09 regression the tri-state `templateChoice` logic was written to
 *    prevent, re-entered through a different door.
 * 2. Sharing one permissive parser made the page-embed stage able to SEE the theme's own `partial`
 *    and `menu` markers for the first time, and its unknown-type policy was to substitute the REQ-28
 *    widget placeholder. The nav, the docs sidebar menu, and the footer were each replaced with an
 *    empty `<div class="widget widget-placeholder">` before `static-render.ts` ever got a chance to
 *    resolve them.
 *
 * Both were invisible to unit tests written against hand-authored fixtures, because a fixture only
 * ever proves the code understands markup its own author wrote in the same spelling. So these read
 * the theme's real files — a canary in the sense `src/core/embeds/__tests__/marker.canary.test.ts`
 * established: if one fails, the migration is wrong, not the test.
 *
 * Pure and I/O-free beyond reading theme files: menus arrive as resolved data, exactly as the route
 * layer supplies them (`pages.ts`'s `resolveStaticMenusForRender`), so no DB or server is involved.
 */

const THEME_DIR = path.resolve(import.meta.dirname, "../../../themes/static/basic");

function read(relative: string): string {
  return fs.readFileSync(path.join(THEME_DIR, relative), "utf8");
}

/** The real `basic` theme, assembled from its own files the way `loadTheme` assembles it — pages and
 * partials keyed by filename stem, manifest straight off `theme.json`. Built here rather than via
 * `loadTheme` so a canary failure can only ever mean the render pipeline changed, never the loader. */
function basicTheme(): DiscoveredTheme {
  const manifest = JSON.parse(read("theme.json")) as DiscoveredTheme["manifest"];
  const pages = Object.fromEntries(
    fs.readdirSync(path.join(THEME_DIR, "pages")).map((file) => [file.replace(/\.html$/, ""), read(`pages/${file}`)])
  );
  const partials = {
    nav: read("nav.html"),
    footer: read("footer.html"),
    "footer-minimal": read("footer-minimal.html"),
  };
  return {
    manifest,
    dir: THEME_DIR,
    tokens: JSON.parse(read("tokens.json")),
    tokensLight: JSON.parse(read("tokens.light.json")),
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages,
    partials,
    css: "",
    source: "builtin",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function items(...entries: Array<Partial<StaticMenuItem> & { label: string }>): StaticMenuItem[] {
  return entries.map((e) => ({ href: null, available: true, isCurrent: false, children: [], ...e }));
}

const POST_ID = "11111111-1111-4111-8111-111111111111";

/** What `resolvePostTypeEmbeds` returns for a real post: RAW data, rendered at `renderWidgetIr`'s
 * `"post-content"` dispatch. Supplied in full rather than stubbed, because `renderWidgetPostContent`
 * degrades to the same widget placeholder an UNRESOLVED embed produces when `title`/`bodyJson` are
 * missing — a canary that asserts "no placeholder anywhere" has to be fed a genuinely resolvable
 * post or it proves nothing about the marker stage it is actually testing. */
const POST_PROPS = {
  title: "Theme Authoring",
  updatedAt: "2026-08-10T21:04:48.919Z",
  bodyJson: {
    type: "doc",
    content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Menus" }] }],
  },
};

/** The route's own sequence (`pages.ts`'s `renderPostViaTemplate`), minus the I/O: resolve the
 * template, stamp the real post id, run the page-embed stage, then the static-theme stage. Kept in
 * one place so a canary asserts against the ORDER the product uses — the eaten-nav bug lived
 * entirely in the fact that the page-embed stage runs FIRST. */
function renderPost(
  theme: DiscoveredTheme,
  templateChoice: string | null,
  menus: Readonly<Record<string, readonly StaticMenuItem[]>>
): string {
  const resolution = resolvePostTemplate({ theme, templateChoice });
  assert.equal(resolution.kind, "template", "the real theme must offer a usable post template");
  if (resolution.kind !== "template") throw new Error("unreachable");

  const withRealId = injectPostEmbedId(resolution.html, POST_ID);
  const resolved = new Map([["post", new Map([[POST_ID, { componentId: "post-content", props: POST_PROPS }]])]]);
  const bodyResolved = renderHtmlPageBody(withRealId, resolved as never);
  return renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: bodyResolved, menus }) ?? "";
}

test("canary: the real theme's post templates are still recognized as having a post slot", () => {
  const theme = basicTheme();
  for (const choice of theme.manifest.postTemplate ?? []) {
    const resolution = resolvePostTemplate({ theme, templateChoice: choice });
    assert.equal(
      resolution.kind,
      "template",
      `${choice} must resolve to a template — a miss here sends every post to the diagnostic page at HTTP 200`
    );
  }
});

test("canary: an unset templateChoice falls back to the theme's first template, never the diagnostic page", () => {
  // `null` is the never-chosen case every pre-feature row, seed script, and agent-tool write produces.
  const resolution = resolvePostTemplate({ theme: basicTheme(), templateChoice: null });
  assert.equal(resolution.kind, "template");
});

test("canary: the page-embed stage leaves theme-owned markers untouched", () => {
  // The whole bug in one assertion: `partial` and `menu` belong to a LATER stage. Substituting
  // anything over them here — placeholder included — deletes the nav, sidebar, and footer.
  const theme = basicTheme();
  const template = injectPostEmbedId(theme.pages["blog-sidebar-template"], POST_ID);
  const out = renderHtmlPageBody(template, undefined);

  assert.ok(out.includes(`'{"type":"partial","id":"nav"`), "the nav partial marker must survive this stage");
  assert.ok(out.includes(`"type":"menu","id":"docs-themes-menu"`), "the docs menu marker must survive this stage");
  assert.ok(out.includes(`'{"type":"partial","id":"footer"}'`), "the footer partial marker must survive this stage");
});

test("canary: an OWNED marker with nothing resolved still degrades to the REQ-28 placeholder", () => {
  // The other half of the ownership rule. `post` IS this stage's, so an unresolvable one must not be
  // left as raw marker markup for a visitor to see — the two halves fail in opposite directions and
  // a check for only one of them would pass against a stage that substitutes nothing at all.
  const out = renderHtmlPageBody(injectPostEmbedId(basicTheme().pages["blog-post"], POST_ID), undefined);
  assert.ok(out.includes("widget-placeholder"), "an unresolved post embed must degrade to the placeholder");
  assert.ok(!out.includes('"type":"post"'), "and must not leave its own marker markup in the output");
});

test("canary: the full post-template render resolves nav, tree menu, footer, and post body together", () => {
  const html = renderPost(basicTheme(), "blog-sidebar-template.html", {
    "menu-header-nav": items({ label: "About", href: "/about" }),
    "docs-themes-menu": items({
      label: "Menus",
      href: "#menus",
      isCurrent: true,
      children: items({ label: "Menu embeds", href: "#menu-embeds" }),
    }),
  });

  assert.ok(!html.includes("widget-placeholder"), "no marker may render as an empty widget placeholder");
  assert.ok(html.includes('<nav class="main-nav"'), "the nav partial must be spliced in");
  assert.ok(html.includes('<a href="/about">About</a>'), "the header menu must resolve to real links");
  assert.ok(html.includes("<footer"), "the footer partial must be spliced in");
  assert.ok(html.includes("<h1>Theme Authoring</h1>"), "the resolved post must render into the template's slot");
  assert.ok(html.includes('<h2 id="menus">Menus</h2>'), "including its body, with the slugified anchor id");

  // `variant: "tree"` is opt-in per marker: an unconditional <ul> collapses every theme's flex nav,
  // so the tree markup must appear for the docs sidebar and NOT for the header nav.
  assert.ok(html.includes('class="menu-list depth-1"'), "the docs menu must render nested, per its tree variant");
  assert.ok(html.includes('aria-current="page"'), "the current item must be marked");
  const headerNav = html.slice(html.indexOf('<nav class="main-nav"'));
  assert.ok(!headerNav.slice(0, headerNav.indexOf("</nav>")).includes("<ul"), "the header nav must stay flat");
});

test("canary: an unresolved menu keeps the theme's authored fallback rather than blanking", () => {
  // Passing NO menus is the deleted-menu / wrong-workspace / authoring-typo case. An active theme
  // must render as it did before menus existed, never an empty nav.
  const html = renderPost(basicTheme(), "blog-sidebar-template.html", {});
  assert.ok(html.includes("No docs menu bound yet"), "the authored fallback content must survive");
  assert.ok(html.includes('<nav class="docs-nav"'), "and the marker element itself must survive with it");
  assert.ok(html.includes('aria-label="Documentation"'), "including its authored accessible name");
});
