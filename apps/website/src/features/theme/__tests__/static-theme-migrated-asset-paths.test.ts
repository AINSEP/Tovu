import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse, type DefaultTreeAdapterMap } from "parse5";

import { renderStaticPage } from "../static-render.js";
import { loadTheme } from "../theme.js";

/**
 * @file Live-path regression coverage for the 2026-08-18 css/js migration-rewrite bug: every
 * already-migrated static theme's own moved pages still referenced the v1 filename/folder
 * (`../css/styles.css`, `../js/...`) after the underlying file was renamed/moved to `css/theme.css` /
 * `scripts/...`, so the request-time asset rewrite (`static-asset-contract.ts`) pointed at a file that
 * no longer existed and the design-token sentinel (an exact string match against `../css/theme.css`)
 * never matched. Runs the REAL `loadTheme()` + `renderStaticPage()` against the REAL theme
 * directories on disk — a fixture-only test cannot catch this, since the bug lived in already-
 * committed theme content, not in any code path a fixture exercises.
 */

const STATIC_THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes/static");
const MIGRATED_STATIC_THEME_IDS = fs.readdirSync(STATIC_THEMES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(STATIC_THEMES_DIR, entry.name, "theme.json")))
  .filter((entry) => JSON.parse(fs.readFileSync(path.join(STATIC_THEMES_DIR, entry.name, "theme.json"), "utf8")).apiVersion === 2)
  .map((entry) => entry.name).sort();

function assetReferences(html: string): { stylesheets: string[]; scripts: string[] } {
  const result = { stylesheets: [] as string[], scripts: [] as string[] };
  function visit(node: DefaultTreeAdapterMap["node"]): void {
    if ("tagName" in node) {
      const attributes = new Map(node.attrs.map(({ name, value }) => [name, value]));
      if (node.tagName === "link" && attributes.get("rel")?.split(/\s+/).includes("stylesheet")) {
        result.stylesheets.push(attributes.get("href") ?? "");
      }
      if (node.tagName === "script") result.scripts.push(attributes.get("src") ?? "");
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(html));
  return result;
}

test("the migrated-theme scan covers real apiVersion 2 themes", () => {
  assert.ok(MIGRATED_STATIC_THEME_IDS.length > 0);
});

for (const themeId of MIGRATED_STATIC_THEME_IDS) {
  test(`${themeId}: every page's stylesheet/script links resolve to real files and design tokens inject, with no asset-path warnings`, () => {
    const dir = path.join(STATIC_THEMES_DIR, themeId);
    const theme = loadTheme({ themeDir: dir, id: themeId, source: "site" });
    assert.equal(theme.status, "valid", `${themeId} must load as a valid theme: ${JSON.stringify(theme.errors)}`);
    assert.ok(Object.keys(theme.pages).length > 0, `${themeId}: must contain pages`);

    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      for (const pageId of Object.keys(theme.pages)) {
        const html = renderStaticPage({ theme, pageId, menus: {} }) as string | null;
        assert.notEqual(html, null, `${themeId}/${pageId}: must render`);
        const rendered = html as string;

        const sourceAssets = assetReferences(theme.pages[pageId]);
        const renderedAssets = assetReferences(rendered);
        const expectedUrl = (url: string) => url.replace(/^\.\.\/(css|scripts)\//, `/theme-assets/${themeId}/$1/`);
        assert.deepEqual(renderedAssets.stylesheets, sourceAssets.stylesheets.map(expectedUrl), `${themeId}/${pageId}: preserve every stylesheet with its exact URL`);
        assert.deepEqual(renderedAssets.scripts, sourceAssets.scripts.map(expectedUrl), `${themeId}/${pageId}: preserve every script and src`);
        for (const url of [...renderedAssets.stylesheets, ...renderedAssets.scripts]) {
          const prefix = `/theme-assets/${themeId}/`;
          if (url.startsWith(prefix)) {
            const file = path.join(dir, url.slice(prefix.length));
            assert.ok(fs.existsSync(file), `${themeId}/${pageId}: asset ${url} must exist at ${file}`);
          }
        }

        const cssMatch = rendered.match(/<link rel="stylesheet" href="\/theme-assets\/[^"]+\/css\/([^"]+)" \/>/);
        assert.ok(cssMatch, `${themeId}/${pageId}: stylesheet link must be present and rewritten to /theme-assets/.../css/...`);
        const cssFile = path.join(dir, "css", cssMatch![1]);
        assert.ok(fs.existsSync(cssFile), `${themeId}/${pageId}: rewritten stylesheet URL must resolve to a real file (${cssFile})`);

        assert.ok(rendered.includes("<style>\n:root {"), `${themeId}/${pageId}: design tokens must be injected`);

        for (const scriptMatch of rendered.matchAll(/src=(["'])\/theme-assets\/[^"']+\/scripts\/([^"']+)\1/g)) {
          const scriptFile = path.join(dir, "scripts", scriptMatch[2]);
          assert.ok(fs.existsSync(scriptFile), `${themeId}/${pageId}: rewritten script URL must resolve to a real file (${scriptFile})`);
        }
      }
    } finally {
      console.warn = originalWarn;
    }

    assert.deepEqual(warnings, [], `${themeId}: no asset-path or token-sentinel warnings expected, got: ${JSON.stringify(warnings)}`);
  });
}
