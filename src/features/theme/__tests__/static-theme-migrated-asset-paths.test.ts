import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { renderStaticPage } from "../static-render";
import { loadTheme } from "../theme";

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

const STATIC_THEMES_DIR = path.resolve(import.meta.dirname, "../../../themes/static");
const MIGRATED_STATIC_THEME_IDS = [
  "fuel",
  "gracious-timing",
  "portfolite",
  "tailark-dusk",
  "tailark-quartz-dark",
  "tailark-quartz-libre",
];

for (const themeId of MIGRATED_STATIC_THEME_IDS) {
  test(`${themeId}: every page's stylesheet/script links resolve to real files and design tokens inject, with no asset-path warnings`, () => {
    const dir = path.join(STATIC_THEMES_DIR, themeId);
    const theme = loadTheme({ themeDir: dir, id: themeId, source: "site" });
    assert.equal(theme.status, "valid", `${themeId} must load as a valid theme: ${JSON.stringify(theme.errors)}`);

    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      for (const pageId of Object.keys(theme.pages)) {
        const html = renderStaticPage({ theme, pageId, menus: {} }) as string | null;
        assert.notEqual(html, null, `${themeId}/${pageId}: must render`);
        const rendered = html as string;

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
