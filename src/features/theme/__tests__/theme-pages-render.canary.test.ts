import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { scanEmbedMarkers, type EmbedMarker } from "#src/core/embeds/marker";
import { renderHtmlPageBody } from "#src/server/http/site/render";
import { injectPostEmbedId, renderStaticPage, resolvePostTemplate, scanMenuEmbedIds } from "../static-render";
import type { DiscoveredTheme, StaticMenuItem } from "../index";

/**
 * @file Canaries for EVERY static theme's EVERY page on the `data-embed-config` marker spine — the
 * sweep `post-template-render.canary.test.ts` (2026-08-10, commit `26447df`) never ran: that file
 * pins the `basic` theme's post-template path only. This file covers the other six static themes
 * (`fuel`, `gracious-timing`, `portfolite`, `tailark-dusk`, `tailark-quartz-dark`,
 * `tailark-quartz-libre`) and, within every theme including `basic`, every page under `pages/` — not
 * only the ones used as a post template.
 *
 * Real theme files on disk, real render pipeline (`renderStaticPage`, `renderHtmlPageBody`), same
 * reason `post-template-render.canary.test.ts`'s own header gives: a fixture only ever proves the
 * code understands markup its own author wrote in the same spelling, which is exactly how the
 * 2026-08-10 regression this sweep exists to guard against got past a fixture-only test suite.
 *
 * Strategy: rather than hardcode each theme's own authored copy (unavailable, un-scalable, and the
 * kind of coupling that makes a canary rot the moment a theme's copy changes), every check is driven
 * by SENTINEL data this file controls — `/sentinel-<menuId>` hrefs and a `Sweep Sentinel Post` title —
 * so a real substitution can be told apart from an untouched fallback without knowing what any theme
 * author actually wrote. Which markers a page is expected to resolve is asked of the real files (via
 * {@link scanEmbedMarkers}), never guessed.
 */

const STATIC_THEMES_DIR = path.resolve(import.meta.dirname, "../../../themes/static");

/** A `data-embed-*` name in actual attribute position (`\s<name>=`), never a bare substring — several
 * theme files carry the retired vocabulary in prose COMMENTS describing their own pre-2026-08-10
 * history (e.g. "`data-embed-type` only substitutes a…"), and those must not fail a canary that only
 * cares whether the retired vocabulary still works as markup. */
const RETIRED_ATTR_PATTERN =
  /\sdata-embed-type\s*=|\sdata-embed-id\s*=|\sdata-embed-variant\s*=|\sdata-tovu-slot\s*=|\sdata-slot-variant\s*=|\sdata-nav-current\s*=/;

function readHtmlDir(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".html"))
      .map((file) => [file.replace(/\.html$/, ""), fs.readFileSync(path.join(dir, file), "utf8")])
  );
}

/** Mirrors `loadStaticTierAssets`'s own partial-selection rule (`theme.ts`) exactly — `nav.html` plus
 * any `footer*.html` at the theme root — so a canary failure here can only mean the render pipeline
 * changed, never a looser test-only convention picking up a file the real loader would not. */
function readRootPartials(dir: string): Record<string, string> {
  const partials: Record<string, string> = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".html") && (file === "nav.html" || file.startsWith("footer"))) {
      partials[file.replace(/\.html$/, "")] = fs.readFileSync(path.join(dir, file), "utf8");
    }
  }
  return partials;
}

/** The real theme, assembled from its own files the way `loadTheme` assembles it (manifest straight
 * off `theme.json`, pages/partials keyed by filename stem) — built here rather than via `loadTheme`
 * so a canary failure can only ever mean the render pipeline changed, never the loader, matching
 * `post-template-render.canary.test.ts`'s own `basicTheme()`. */
function readTheme(themeId: string): DiscoveredTheme {
  const dir = path.join(STATIC_THEMES_DIR, themeId);
  const tokensLightPath = path.join(dir, "tokens.light.json");
  return {
    manifest: JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8")),
    dir,
    tokens: JSON.parse(fs.readFileSync(path.join(dir, "tokens.json"), "utf8")),
    tokensLight: fs.existsSync(tokensLightPath) ? JSON.parse(fs.readFileSync(tokensLightPath, "utf8")) : {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: readHtmlDir(path.join(dir, "pages")),
    partials: readRootPartials(dir),
    css: "",
    source: "builtin",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function items(...entries: Array<Partial<StaticMenuItem> & { label: string }>): StaticMenuItem[] {
  return entries.map((entry) => ({ href: null, available: true, isCurrent: false, children: [], ...entry }));
}

/** One resolvable sentinel item per menu id the theme actually references anywhere (pages AND
 * partials, matching {@link scanMenuEmbedIds}'s own scope), keyed to a value derived from the id
 * itself so resolution can be confirmed without knowing what any theme author wrote. An id containing
 * "docs" additionally gets one child — the one marker any theme opts into the nested tree renderer
 * (`variant: "tree"`) needs a child to prove it actually nested one. */
function sentinelMenus(theme: DiscoveredTheme): Record<string, StaticMenuItem[]> {
  const menus: Record<string, StaticMenuItem[]> = {};
  for (const id of scanMenuEmbedIds(theme)) {
    const children = id.includes("docs") ? items({ label: "Sentinel Child", href: "#sentinel-child" }) : [];
    menus[id] = items({ label: `Sentinel ${id}`, href: `/sentinel-${id}`, isCurrent: true, children });
  }
  return menus;
}

function assertNoRetiredMarkers(html: string, label: string): void {
  assert.equal(RETIRED_ATTR_PATTERN.test(html), false, `${label}: a retired embed attribute is live in rendered output`);
}

/** The resolved element a marker turned into, located by its own tag + attrs (unchanged by
 * resolution — {@link withInnerContent} in `marker.ts` only ever swaps inner content) rather than by
 * id alone, so two same-id markers never get confused. Matching close tag found by plain `indexOf`
 * rather than balanced-tag tracking, the same no-same-named-descendant assumption `marker.ts`'s own
 * `MARKER_PATTERN` documents as true for every marker convention in this codebase. */
function resolvedElementFor(html: string, marker: EmbedMarker): string {
  const openTag = `<${marker.tag}${marker.attrs}>`;
  const start = html.indexOf(openTag);
  if (start === -1) return "";
  const closeTag = `</${marker.tag}>`;
  const end = html.indexOf(closeTag, start);
  return end === -1 ? "" : html.slice(start, end + closeTag.length);
}

/** The visible text of every `<a>` in `html`, in document order. `rewritePageLinks` (a pre-existing,
 * unrelated pipeline stage) rewrites an `href="foo.html"` VALUE but never touches an anchor's inner
 * text, so this is stable across the whole render pipeline unless a real substitution happened — the
 * one signal narrow enough to prove "unresolved means untouched" without also tripping on a correct,
 * unrelated href rewrite (`gracious-timing`'s own footer fallback links to sibling pages by filename,
 * which get rewritten to real routes whether or not the marker around them ever resolves). */
function anchorTexts(html: string): string[] {
  return [...html.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]).sort();
}

/** `variant: "tree"` is opt-in PER MARKER (`static-render.ts`'s `injectMenuEmbeds` doc) — every
 * static theme's flat nav CSS targets direct `<a>` children of a flex container, so an unconditional
 * `<ul>` would collapse it. Asserts the opt-in is honored in both directions: a tree marker nests, a
 * flat one stays exactly that. */
function assertTreeOptIn(html: string, marker: EmbedMarker, label: string): void {
  const element = resolvedElementFor(html, marker);
  const wantsTree = marker.config.variant === "tree";
  assert.equal(
    element.includes("<ul"),
    wantsTree,
    `${label}: menu "${marker.id}" tree opt-in mismatch (variant=${String(marker.config.variant)}, resolved="${element.slice(0, 80)}")`
  );
}

/**
 * Every real HTML source a theme ships that could carry a `menu` marker directly: each page, plus
 * each root partial, as independent `(id, html)` pairs — never assembled into a real page first.
 * Assembling requires `resolveSlots` to have already picked the right partial VARIANT for a given
 * page (`basic`'s `signin`/`signup` splice in `footer-minimal.html`, which carries no menu marker at
 * all, rather than `footer.html`, which does) — a separate concern this file tests on its own below.
 * Using a rendered pass to discover "what markers exist here" would make the discovery itself depend
 * on the very function these two tests exist to catch a regression in: a mutation that makes
 * `injectMenuEmbeds` resolve every id regardless of `menus` (proven below) makes a `menus: {}`
 * render indistinguishable from a real one, silently emptying the marker set these tests would have
 * scanned for and turning both into vacuous passes. Scanning the raw file instead is not a
 * hypothetical hardening — it is what closed that exact hole while writing this file.
 */
function menuMarkerSources(theme: DiscoveredTheme): ReadonlyArray<readonly [string, string]> {
  return [...Object.entries(theme.pages), ...Object.entries(theme.partials)];
}

/**
 * One marker's half of the "held back id keeps its fallback, a resolved sibling still resolves"
 * invariant — split out of its `test()` body purely to stay under the 9/9 complexity gate.
 *
 * NOT a byte-identical `marker.whole` check for the held-back branch: `rewritePageLinks` (an
 * unrelated, pre-existing pipeline stage) legitimately rewrites a bare `href="foo.html"` to
 * `href="/foo"` INSIDE a marker's own authored fallback content too, resolved or not —
 * `gracious-timing`'s own footer fallback does exactly this, so requiring byte-identical survival
 * fails on a correct, unrelated rewrite. Anchor TEXT is the narrower, accurate invariant: untouched
 * by that rewrite, so unchanged text proves nothing here substituted real content, without hardcoding
 * what "unsubstituted" fabricated content might look like.
 */
function assertHeldBackOrResolved(required: {
  marker: EmbedMarker;
  heldBack: string;
  partial: Record<string, StaticMenuItem[]>;
  mixedResolved: string;
  label: string;
}): void {
  const { marker, heldBack, partial, mixedResolved, label } = required;
  if (marker.id === heldBack) {
    assert.deepEqual(
      anchorTexts(resolvedElementFor(mixedResolved, marker)),
      anchorTexts(marker.whole),
      `${label}: menu "${heldBack}" (deliberately unresolved, e.g. a deleted menu) must keep its authored fallback text, not substitute anything`
    );
    return;
  }
  if (marker.id !== undefined && marker.id in partial) {
    assert.ok(
      mixedResolved.includes(`/sentinel-${marker.id}`),
      `${label}: menu "${marker.id}" must still resolve while a sibling menu is unresolved`
    );
  }
}

const STATIC_THEME_IDS = fs
  .readdirSync(STATIC_THEMES_DIR)
  .filter((entry) => fs.statSync(path.join(STATIC_THEMES_DIR, entry)).isDirectory());

for (const themeId of STATIC_THEME_IDS) {
  test(`canary: ${themeId} — every page renders and carries no retired embed attribute`, () => {
    const theme = readTheme(themeId);
    for (const pageId of Object.keys(theme.pages)) {
      const html = renderStaticPage({ theme, pageId, menus: {} });
      assert.notEqual(html, null, `${themeId}/${pageId}: renderStaticPage must resolve a page it just loaded from its own pages/`);
      assertNoRetiredMarkers(html as string, `${themeId}/${pageId}`);
    }
  });

  test(`canary: ${themeId} — every menu marker resolves to real data, tree opt-in honored`, () => {
    const theme = readTheme(themeId);
    const menus = sentinelMenus(theme);
    for (const [sourceId, source] of menuMarkerSources(theme)) {
      const resolved = renderStaticPage({ theme, pageId: "sweep-synthetic", htmlOverride: source, menus }) as string;
      assertNoRetiredMarkers(resolved, `${themeId}/${sourceId}`);
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "menu" || marker.id === undefined || !(marker.id in menus)) continue;
        assert.ok(
          resolved.includes(`/sentinel-${marker.id}`),
          `${themeId}/${sourceId}: menu marker "${marker.id}" did not resolve to its supplied data`
        );
        assertTreeOptIn(resolved, marker, `${themeId}/${sourceId}`);
      }
    }
  });

  test(`canary: ${themeId} — a menu id absent from resolved data keeps that one marker's fallback while its siblings still resolve`, () => {
    const theme = readTheme(themeId);
    const allIds = scanMenuEmbedIds(theme);
    if (allIds.length < 2) return; // nothing to hold back while proving a sibling still resolves
    const [heldBack, ...rest] = allIds;
    const full = sentinelMenus(theme);
    const partial = Object.fromEntries(rest.map((id) => [id, full[id]]));

    for (const [sourceId, source] of menuMarkerSources(theme)) {
      const mixedResolved = renderStaticPage({ theme, pageId: "sweep-synthetic", htmlOverride: source, menus: partial }) as string;
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "menu" || marker.id === undefined) continue;
        assertHeldBackOrResolved({ marker, heldBack, partial, mixedResolved, label: `${themeId}/${sourceId}` });
      }
    }
  });

  test(`canary: ${themeId} — every declared partial slot marker is substituted, never left as raw marker markup`, () => {
    const theme = readTheme(themeId);
    for (const [pageId, source] of Object.entries(theme.pages)) {
      const resolvedOnce = renderStaticPage({ theme, pageId, menus: {} }) as string;
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "partial" || marker.id === undefined) continue;
        if (theme.manifest.slots?.[marker.id] === undefined) continue; // undeclared slot: fallback is the correct, tested-elsewhere outcome
        assert.ok(
          !resolvedOnce.includes(marker.whole),
          `${themeId}/${pageId}: partial marker "${marker.id}" was left as raw marker markup though the theme declares that slot`
        );
      }
    }
  });

  const postTemplates = (readTheme(themeId).manifest.postTemplate as string[] | undefined) ?? [];
  for (const choice of postTemplates) {
    test(`canary: ${themeId} — post template "${choice}" resolves post body, nav, footer, and menus together`, () => {
      const theme = readTheme(themeId);
      const menus = sentinelMenus(theme);
      const resolution = resolvePostTemplate({ theme, templateChoice: choice });
      assert.equal(resolution.kind, "template", `${themeId}/${choice}: the theme's own declared postTemplate entry must resolve to a template`);
      if (resolution.kind !== "template") return;

      const postId = "22222222-2222-4222-8222-222222222222";
      const withRealId = injectPostEmbedId(resolution.html, postId);
      const postProps = {
        title: "Sweep Sentinel Post",
        updatedAt: "2026-08-10T00:00:00.000Z",
        bodyJson: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sweep Sentinel Body" }] }] },
      };
      const resolved = new Map([["post", new Map([[postId, { componentId: "post-content", props: postProps }]])]]);
      const bodyResolved = renderHtmlPageBody(withRealId, resolved as never);
      const full = renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: bodyResolved, menus }) ?? "";

      assert.ok(!full.includes("widget-placeholder"), `${themeId}/${choice}: no marker may render as an empty widget placeholder`);
      assert.ok(
        full.includes("Sweep Sentinel Post") || full.includes("Sweep Sentinel Body"),
        `${themeId}/${choice}: the resolved post must render into the template's slot`
      );
      assert.ok(!full.includes('"type":"post"'), `${themeId}/${choice}: the post marker itself must not leak into the output`);
      assertNoRetiredMarkers(full, `${themeId}/${choice}`);

      for (const marker of scanEmbedMarkers(resolution.html).markers) {
        if (marker.type !== "menu" || marker.id === undefined || !(marker.id in menus)) continue;
        assert.ok(full.includes(`/sentinel-${marker.id}`), `${themeId}/${choice}: menu marker "${marker.id}" did not resolve`);
      }
    });
  }
}
