import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

import { markersOfType } from "#src/contracts/core/embeds/marker";
import {
  discoverAllBuiltInThemes,
  downloadMarketplaceTheme,
  findTheme,
  MarketplaceThemeError,
  MARKETPLACE_CATALOG_DIR,
  renderStaticPage,
  readThemeLineageFile,
  type DiscoveredTheme,
} from "../index.js";

/**
 * @file Validate → install → rescan → render contract test (2026-08-19 architecture audit finding 3).
 *
 * The audit's exact repro: a marketplace fixture declares `partials.hero.source`, a `[TARGET]` field
 * `theme-authoring-guide-v2.md` §10 documents as the eventual rename of `slots` — but `loadTheme()`
 * still reads only the flat `slots` field. Before this fix, `validateThemePackage({ profile: "install" })`
 * accepted such a manifest as schema-valid, `downloadMarketplaceTheme` copied it to disk, and the
 * theme then rendered with its `hero` partial permanently unresolved.
 *
 * Two fixtures, same page/partial CONTENT, differing only in which manifest field maps the partial:
 * - `partials` (unimplemented): must now be REFUSED before a single file is copied.
 * - `slots` (the real, implemented field): must install, rescan, and render with the partial
 *   correctly spliced in — proving the happy path isn't merely "not rejected" but actually works.
 */

function tmpThemesRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-manifest-v2-contract-"));
}

const HERO_MARKER = `<div data-embed-config='{"type":"partial","id":"hero"}'></div>`;
const HERO_PARTIAL_CONTENT = "<section>Real hero content, spliced from render/partials/hero.html</section>";

function writeV2StaticFixture(
  themesRoot: string,
  id: string,
  options: { useSlots: boolean }
): void {
  const dir = path.join(themesRoot, MARKETPLACE_CATALOG_DIR, "static", id);
  fs.mkdirSync(path.join(dir, "render", "pages"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render", "partials"), { recursive: true });
  fs.mkdirSync(path.join(dir, "css"), { recursive: true });
  fs.mkdirSync(path.join(dir, "assets", "previews"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "render", "pages", "index.html"),
    `<!doctype html><html><head><link rel="stylesheet" href="../css/theme.css" /></head><body>${HERO_MARKER}</body></html>`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "render", "partials", "hero.html"), HERO_PARTIAL_CONTENT, "utf8");
  fs.writeFileSync(path.join(dir, "css", "theme.css"), "body{}", "utf8");
  fs.writeFileSync(path.join(dir, "assets", "previews", "card.webp"), "fake-webp-bytes", "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");

  // `slots.<id>.source` is relative to `partialsDir` (v2: `render/partials/`), a BARE filename —
  // NOT the full theme-relative path (confirmed against the real `basic` theme's own `theme.json`
  // and `loadSlotPartials`'s own stem-matching in `theme.ts`). `partials.<id>.source` (the
  // unimplemented field) uses the opposite convention (`checkDeclaredReferences`, `references.ts`,
  // resolves it against the THEME root) — both are written as each field's own real contract expects.
  const partialMapping = options.useSlots
    ? { slots: { hero: { source: "hero.html" } } }
    : { partials: { hero: { source: "render/partials/hero.html" } } };

  const manifest = {
    apiVersion: 2,
    id,
    name: "Contract Test Theme",
    version: "0.1.0",
    tier: "static",
    description: "Validate -> install -> rescan -> render contract fixture.",
    license: { spdx: "MIT" },
    ...partialMapping,
  };
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
}

function findElement(node: DefaultTreeAdapterTypes.Node, tag: string): DefaultTreeAdapterTypes.Element | undefined {
  if ("tagName" in node && node.tagName === tag) return node;
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      const found = findElement(child, tag);
      if (found) return found;
    }
  }
  return undefined;
}

function assertHero(html: string): void {
  const body = findElement(parse(html), "body");
  assert.ok(body);
  const sections = body.childNodes.filter((node): node is DefaultTreeAdapterTypes.Element => "tagName" in node && node.tagName === "section");
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].childNodes.map((node) => "value" in node ? node.value : ""), ["Real hero content, spliced from render/partials/hero.html"]);
}

test("install refuses a marketplace theme declaring 'partials' (unimplemented) before any file is copied", () => {
  const themesRoot = tmpThemesRoot();
  writeV2StaticFixture(themesRoot, "unresolved-partial-theme", { useSlots: false });
  const themes: DiscoveredTheme[] = discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" });

  assert.throws(
    () => downloadMarketplaceTheme({ themesRoot, themes, marketplaceId: "unresolved-partial-theme" }),
    (err: unknown) => {
      assert.ok(err instanceof MarketplaceThemeError, `expected MarketplaceThemeError, got: ${err}`);
      assert.equal(err.code, "INVALID_PACKAGE");
      assert.match(err.message, /partials is not yet read by the runtime loader/);
      return true;
    }
  );

  // Nothing was written to disk -- the whole point of validate-THEN-copy.
  assert.equal(fs.existsSync(path.join(themesRoot, "static", "unresolved-partial-theme")), false);
  assert.equal(fs.existsSync(path.join(themesRoot, "__original-themes__", "static", "unresolved-partial-theme")), false);
});

test("install accepts a marketplace theme declaring 'slots' (the real, implemented field), and the installed theme renders the partial correctly after rescan", () => {
  const themesRoot = tmpThemesRoot();
  writeV2StaticFixture(themesRoot, "resolved-partial-theme", { useSlots: true });
  const themes: DiscoveredTheme[] = discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" });

  const result = downloadMarketplaceTheme({ themesRoot, themes, marketplaceId: "resolved-partial-theme" });
  assert.equal(result.suffixed, false);
  assert.equal(result.assignedId, "resolved-partial-theme");

  // `downloadMarketplaceTheme` already rescans internally (its own doc comment) -- `themes` reflects
  // the newly installed theme with no separate rescan call needed.
  const installed = findTheme({ themes, id: "resolved-partial-theme" });
  assert.ok(installed, "the installed theme must be immediately discoverable after download's own rescan");
  assert.equal(installed!.status, "valid", `expected valid, got errors: ${JSON.stringify(installed!.errors)}`);

  const html = renderStaticPage({ theme: installed!, pageId: "index" });
  assert.ok(html);
  assert.match(html!, /Real hero content, spliced from render\/partials\/hero\.html/, `partial must be resolved, got: ${html}`);
  assert.equal(markersOfType(html!, "partial").length, 0, "no unresolved partial marker should remain");
  assertHero(html!);
});

test("a colliding marketplace install rewrites both suffixed manifests, retains lineage and renders", (t) => {
  const themesRoot = tmpThemesRoot();
  t.after(() => fs.rmSync(themesRoot, { recursive: true, force: true }));
  writeV2StaticFixture(themesRoot, "resolved-partial-theme", { useSlots: true });
  const themes = discoverAllBuiltInThemes({ dir: themesRoot, source: "built-in" });
  downloadMarketplaceTheme({ themesRoot, themes, marketplaceId: "resolved-partial-theme" });
  const result = downloadMarketplaceTheme({ themesRoot, themes, marketplaceId: "resolved-partial-theme" });
  assert.equal(result.suffixed, true);
  assert.equal(result.assignedId, "resolved-partial-theme-1");
  for (const relative of ["static/resolved-partial-theme-1", "__original-themes__/static/resolved-partial-theme-1"]) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(themesRoot, relative, "theme.json"), "utf8")).id, "resolved-partial-theme-1");
  }
  assert.deepEqual(result.lineage, { from: "marketplace", tier: "static", version: "0.1.0",
    catalog: "__original-themes__/static/resolved-partial-theme-1", marketplaceId: "resolved-partial-theme", name: "Contract Test Theme" });
  const installed = findTheme({ themes, id: "resolved-partial-theme-1" });
  assert.ok(installed);
  assert.equal(installed.status, "valid");
  assert.deepEqual(readThemeLineageFile({ themeDir: installed.dir }), result.lineage);
  const html = renderStaticPage({ theme: installed, pageId: "index" });
  assert.ok(html);
  assertHero(html);
});
