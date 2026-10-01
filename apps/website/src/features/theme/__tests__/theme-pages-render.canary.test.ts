import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { scanEmbedMarkers, type EmbedMarker } from "#src/contracts/core/embeds/marker";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";
import { injectCurrentEntityContentId, renderStaticPage, resolveTemplate, scanMenuEmbedIds } from "../static-render.js";
import type { DiscoveredTheme, StaticMenuItem } from "../index.js";

/**
 * @file Canaries for EVERY static theme's EVERY page on the `data-embed-config` marker spine — the
 * sweep `post-template-render.canary.test.ts` (2026-08-10, commit `26447df`) never ran: that file
 * pins the `basic` theme's post-template path only. This file covers the other static themes
 * (`tailark-dusk`, `tailark-quartz-dark`, `tailark-quartz-libre` as of 2026-08-31 — `fuel`,
 * `gracious-timing`, and `portfolite` were removed from the repo that day, unconfirmed-license
 * Framer Marketplace derivatives) and, within every theme including `basic`, every page under
 * `pages/` — not only the ones used as a post template. `STATIC_THEME_IDS` below discovers the
 * real theme set from disk, so this list is descriptive, not something to keep in sync by hand.
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

const STATIC_THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes/static");

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

/** Mirrors `loadStaticTierAssets`'s own v1 partial-selection rule (`theme.ts`) exactly — `nav.html`
 * plus any `footer*.html` at the theme root — so a canary failure here can only mean the render
 * pipeline changed, never a looser test-only convention picking up a file the real loader would not. */
function readRootPartials(dir: string): Record<string, string> {
  const partials: Record<string, string> = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".html") && (file === "nav.html" || file.startsWith("footer"))) {
      partials[file.replace(/\.html$/, "")] = fs.readFileSync(path.join(dir, file), "utf8");
    }
  }
  return partials;
}

/** v2's `render/partials/` is dedicated to partials only (theme-authoring-guide-v2.md §3), unlike
 * v1's theme root which mixes many things — every `.html` file there is a partial, no name filter
 * needed. Mirrors `loadStaticTierAssets`'s v2 branch (`theme.ts`'s `partialsDir`/`loadSlotPartials`). */
function readV2Partials(dir: string): Record<string, string> {
  const partialsDir = path.join(dir, "render", "partials");
  if (!fs.existsSync(partialsDir)) return {};
  return readHtmlDir(partialsDir);
}

/** The real theme, assembled from its own files the way `loadTheme` assembles it (manifest straight
 * off `theme.json`, pages/partials keyed by filename stem) — built here rather than via `loadTheme`
 * so a canary failure can only ever mean the render pipeline changed, never the loader, matching
 * `post-template-render.canary.test.ts`'s own `basicTheme()`.
 *
 * apiVersion-branched (2026-08-18) the same way `loadTheme`'s own `pagesDirName`/`partialsDir` are
 * (`theme.ts`): v1 keeps `pages/` and root-level `nav.html`/`footer*.html`; v2 nests both under
 * `render/`. Every real v2-migrated static theme lost its `pages/` folder permanently once migrated
 * — this isn't staging-directory debris, a hardcoded v1 path here breaks every one of them for good. */
function readTheme(themeId: string): DiscoveredTheme {
  const dir = path.join(STATIC_THEMES_DIR, themeId);
  const tokensLightPath = path.join(dir, "tokens.light.json");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "theme.json"), "utf8"));
  const isV2 = manifest.apiVersion === 2;
  return {
    manifest,
    dir,
    tokens: JSON.parse(fs.readFileSync(path.join(dir, "tokens.json"), "utf8")),
    tokensLight: fs.existsSync(tokensLightPath) ? JSON.parse(fs.readFileSync(tokensLightPath, "utf8")) : {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: readHtmlDir(path.join(dir, isV2 ? "render/pages" : "pages")),
    partials: isV2 ? readV2Partials(dir) : readRootPartials(dir),
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
  for (const id of expectedMenuIds(theme)) {
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

/** Anchor destinations and labels, preserving document order. */
function anchors(html: string): Array<{ href: string; label: string }> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? "",
    label: m[2].replace(/<[^>]*>/g, ""),
  }));
}

function expectedFallbackAnchors(html: string): ReturnType<typeof anchors> {
  return anchors(html).map((a) => ({ ...a, href: /^[a-z0-9-]+\.html$/.test(a.href)
    ? (a.href === "index.html" ? "/" : `/${a.href.slice(0, -5)}`) : a.href }));
}

/** Read the raw attributes independently of the production menu-discovery function. */
function expectedMenuIds(theme: DiscoveredTheme): string[] {
  const ids = new Set<string>();
  for (const [, source] of menuMarkerSources(theme)) {
    const visible = source.replace(/<!--[\s\S]*?-->/g, "");
    for (const match of visible.matchAll(/data-embed-config='([^']*)'/g)) {
      const config = JSON.parse(match[1]);
      if (config.type === "menu" && typeof config.id === "string") ids.add(config.id);
    }
  }
  return [...ids];
}

/** Give repeated, otherwise identical markers separate locators without changing their config. */
function identifyMarkerOccurrences(source: string): string {
  return source.replace(/(<[a-z][a-z0-9-]*)([^>]*data-embed-config=)/g,
    (_whole, tag, attrs, offset) => `${tag} data-canary-occurrence="${offset}"${attrs}`);
}

function assertMenuAnchors(html: string, marker: EmbedMarker): void {
  const expected = [{ href: `/sentinel-${marker.id}`, label: `Sentinel ${marker.id}` }];
  if (marker.config.variant === "tree" && marker.id?.includes("docs")) {
    expected.push({ href: "#sentinel-child", label: "Sentinel Child" });
  }
  assert.deepEqual(anchors(resolvedElementFor(html, marker)), expected, `menu ${marker.id}: occurrence must resolve`);
}

/** Compare with rendering the requested partial in isolation, bypassing slot selection. */
function assertPartialContents(theme: DiscoveredTheme, source: string, full: string, menus: Record<string, StaticMenuItem[]>): number {
  let count = 0;
  for (const marker of scanEmbedMarkers(source).markers) {
    if (marker.type !== "partial" || marker.id === undefined) continue;
    const descriptor = theme.manifest.slots?.[marker.id];
    assert.ok(descriptor, `shipped partial ${marker.id} must have a declared slot`);
    const variant = marker.config.variant;
    const file = typeof variant === "string"
      ? descriptor.variants?.[variant] ?? `${descriptor.source.replace(/\.html$/, "")}-${variant}.html`
      : descriptor.source;
    const partial = theme.partials[file.replace(/\.html$/, "")];
    assert.ok(partial, `requested partial ${file} must exist`);
    const expected = renderStaticPage({ theme, pageId: "sweep-partial", htmlOverride: partial, menus }) as string;
    const withoutCurrent = (html: string) => html.replace(/ aria-current="page"/g, "").trim();
    assert.ok(withoutCurrent(full).includes(withoutCurrent(expected)), `selected ${file} must appear in assembled output`);
    count++;
  }
  return count;
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
 * `href="/foo"` INSIDE a marker's own authored fallback content too, resolved or not — the
 * now-removed `gracious-timing` theme's own footer fallback did exactly this, so requiring
 * byte-identical survival fails on a correct, unrelated rewrite. Compare the fallback anchors in
 * document order, with their expected route destinations after that rewrite.
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
      anchors(resolvedElementFor(mixedResolved, marker)),
      expectedFallbackAnchors(marker.whole),
      `${label}: menu "${heldBack}" (deliberately unresolved, e.g. a deleted menu) must keep its authored fallback labels, destinations, and order`
    );
    return;
  }
  if (marker.id !== undefined && marker.id in partial) {
    assert.ok(
      resolvedElementFor(mixedResolved, marker).includes(`/sentinel-${marker.id}`),
      `${label}: menu "${marker.id}" must still resolve while a sibling menu is unresolved`
    );
  }
}

/**
 * Every static theme that stands on its own.
 *
 * `readTheme` below deliberately assembles a `DiscoveredTheme` from files on disk instead of calling
 * `loadTheme` — so that a canary failure can only ever mean the RENDER pipeline changed, never the
 * loader.
 */
const STATIC_THEME_IDS = fs
  .readdirSync(STATIC_THEMES_DIR)
  .filter((entry) => fs.statSync(path.join(STATIC_THEMES_DIR, entry)).isDirectory())
  .filter((entry) => fs.existsSync(path.join(STATIC_THEMES_DIR, entry, "theme.json")));

test("canary: discovery includes the shipped tovu-theme", () => {
  assert.ok(STATIC_THEME_IDS.includes("tovu-theme"));
});

for (const themeId of STATIC_THEME_IDS) {
  test(`canary: ${themeId} — every page renders and carries no retired embed attribute`, () => {
    const theme = readTheme(themeId);
    for (const pageId of Object.keys(theme.pages)) {
      const html = renderStaticPage({ theme, pageId, menus: {} });
      assert.notEqual(html, null, `${themeId}/${pageId}: renderStaticPage must resolve a page it just loaded from its own pages/`);
      assertNoRetiredMarkers(html as string, `${themeId}/${pageId}`);
      const source = theme.pages[pageId];
      const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(source)?.[1];
      const renderedMain = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html as string)?.[1];
      assert.ok(main !== undefined && renderedMain !== undefined, `${themeId}/${pageId}: main survives`);
      let authored = main;
      for (const marker of scanEmbedMarkers(main).markers) authored = authored.replace(marker.whole, "");
      const text = (value: string) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      for (const element of authored.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
        const copy = text(element[2]);
        if (copy) assert.ok(text(renderedMain).includes(copy), `${themeId}/${pageId}: authored main copy survives: ${copy}`);
      }
    }
  });

  test(`canary: ${themeId} — every menu marker resolves to real data, tree opt-in honored`, () => {
    const theme = readTheme(themeId);
    const menus = sentinelMenus(theme);
    assert.deepEqual([...scanMenuEmbedIds(theme)].sort(), expectedMenuIds(theme).sort());
    assert.ok(Object.keys(menus).length > 0, "shipped themes contain menus");
    for (const [sourceId, rawSource] of menuMarkerSources(theme)) {
      const source = identifyMarkerOccurrences(rawSource);
      const resolved = renderStaticPage({ theme, pageId: "sweep-synthetic", htmlOverride: source, menus }) as string;
      assertNoRetiredMarkers(resolved, `${themeId}/${sourceId}`);
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "menu" || marker.id === undefined || !(marker.id in menus)) continue;
        assert.ok(
          resolvedElementFor(resolved, marker).includes(`/sentinel-${marker.id}`),
          `${themeId}/${sourceId}: menu marker "${marker.id}" did not resolve to its supplied data`
        );
        assertTreeOptIn(resolved, marker, `${themeId}/${sourceId}`);
        assertMenuAnchors(resolved, marker);
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

    for (const [sourceId, rawSource] of menuMarkerSources(theme)) {
      const source = identifyMarkerOccurrences(rawSource);
      const mixedResolved = renderStaticPage({ theme, pageId: "sweep-synthetic", htmlOverride: source, menus: partial }) as string;
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "menu" || marker.id === undefined) continue;
        assertHeldBackOrResolved({ marker, heldBack, partial, mixedResolved, label: `${themeId}/${sourceId}` });
      }
    }
  });

  test(`canary: ${themeId} — every declared partial slot marker is substituted, never left as raw marker markup`, () => {
    const theme = readTheme(themeId);
    let asserted = 0;
    for (const [pageId, source] of Object.entries(theme.pages)) {
      const resolvedOnce = renderStaticPage({ theme, pageId, menus: {} }) as string;
      asserted += assertPartialContents(theme, source, resolvedOnce, {});
      for (const marker of scanEmbedMarkers(source).markers) {
        if (marker.type !== "partial" || marker.id === undefined) continue;
        if (theme.manifest.slots?.[marker.id] === undefined) continue; // undeclared slot: fallback is the correct, tested-elsewhere outcome
        assert.ok(
          !resolvedOnce.includes(marker.whole),
          `${themeId}/${pageId}: partial marker "${marker.id}" was left as raw marker markup though the theme declares that slot`
        );
      }
    }
    assert.ok(asserted > 0, "shipped nav/footer slots must be exercised");
  });

  // 2026-08-11 unification: `postTemplate` collapsed into `templates` (one array, shared by Posts
  // and Pages) and the marker collapsed onto `{"type":"content"}` — `injectCurrentEntityContentId`/
  // `resolveTemplate` replace `injectPostEmbedId`/`resolvePostTemplate` below unchanged in spirit.
  const templates = (readTheme(themeId).manifest.templates as string[] | undefined) ?? [];
  for (const choice of templates) {
    test(`canary: ${themeId} — template "${choice}" resolves entity body, nav, footer, and menus together`, () => {
      const theme = readTheme(themeId);
      const menus = sentinelMenus(theme);
      const resolution = resolveTemplate({ theme, templateChoice: choice });
      assert.equal(resolution.kind, "template", `${themeId}/${choice}: the theme's own declared templates entry must resolve to a template`);
      if (resolution.kind !== "template") return;

      const entityId = "22222222-2222-4222-8222-222222222222";
      const withRealId = injectCurrentEntityContentId(resolution.html, entityId);
      const entityProps = {
        title: "Sweep Sentinel Post",
        updatedAt: "2026-08-10T00:00:00.000Z",
        bodyJson: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sweep Sentinel Body" }] }] },
      };
      const resolved = new Map([["content", new Map([[entityId, { componentId: "post-content", props: entityProps }]])]]);
      const bodyResolved = renderHtmlPageBody(withRealId, resolved as never);
      const full = renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: bodyResolved, menus }) ?? "";

      assert.ok(!full.includes("widget-placeholder"), `${themeId}/${choice}: no marker may render as an empty widget placeholder`);
      assert.ok(
        full.includes("Sweep Sentinel Body"),
        `${themeId}/${choice}: the resolved entity must render into the template's slot`
      );
      for (const marker of scanEmbedMarkers(resolution.html).markers) {
        if (marker.type === "content") {
          assert.equal(full.includes("Sweep Sentinel Post"), marker.config.header !== false, "title honors header setting");
        }
      }
      assert.ok(assertPartialContents(theme, resolution.html, full, menus) > 0, "template chrome must resolve");
      assert.ok(!full.includes('"type":"content"'), `${themeId}/${choice}: the content marker itself must not leak into the output`);
      assertNoRetiredMarkers(full, `${themeId}/${choice}`);

      for (const marker of scanEmbedMarkers(resolution.html).markers) {
        if (marker.type !== "menu" || marker.id === undefined || !(marker.id in menus)) continue;
        assert.ok(full.includes(`/sentinel-${marker.id}`), `${themeId}/${choice}: menu marker "${marker.id}" did not resolve`);
      }
    });
  }
}
