import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme, isPublishableThemePageCandidate, isStandaloneThemePage } from "../theme.js";

/**
 * @file `theme.json`'s `publishedPages` — the real publish/unpublish mechanism replacing the
 * `_unpublished/` folder convention an agent invented ad hoc (no such feature existed at the time).
 *
 * The one guarantee every other test here exists to prove: a theme that has never recorded a publish
 * decision (`publishedPages` absent) has every ordinary page unpublished — "off by default" applies
 * RETROACTIVELY to every theme, not only ones that opt in going forward (2026-08-30 owner correction:
 * "The pages are not published by default... because then they would have wrong information because
 * they're generic themes"). `index`, `404`, and declared template shells are the only pages this never
 * touches — they stay live regardless of any recorded decision, or lack of one.
 */

function makeStaticThemeDir(files: Record<string, string>, manifestExtra: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-publish-theme-"));
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier: "static", engine: 1, ...manifestExtra }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

const PAGES = {
  "pages/index.html": "<html></html>",
  "pages/about.html": "<html></html>",
  "pages/pricing.html": "<html></html>",
  "pages/page-shell.html": '<div data-embed-config=\'{"type":"content"}\'></div>',
};

test("OFF BY DEFAULT (2026-08-30 owner correction, retroactive): no publishedPages recorded — every ordinary page is unpublished", () => {
  const dir = makeStaticThemeDir(PAGES, { templates: ["page-shell.html"] });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.manifest.publishedPages, undefined);
  assert.equal(isStandaloneThemePage(theme, "about"), false);
  assert.equal(isStandaloneThemePage(theme, "pricing"), false);
  // Unaffected by the absent publishedPages list — these were never routable in the first place,
  // and stay live regardless of any recorded decision.
  assert.equal(isStandaloneThemePage(theme, "index"), false);
  assert.equal(isStandaloneThemePage(theme, "page-shell"), false);
});

test("publishedPages present: a page NOT in the list is off by default", () => {
  const dir = makeStaticThemeDir(PAGES, { templates: ["page-shell.html"], publishedPages: ["about"] });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(isStandaloneThemePage(theme, "about"), true);
  assert.equal(isStandaloneThemePage(theme, "pricing"), false, "off by default once the theme has opted in");
});

test("publishedPages present but empty: every page is off", () => {
  const dir = makeStaticThemeDir(PAGES, { publishedPages: [] });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(isStandaloneThemePage(theme, "about"), false);
  assert.equal(isStandaloneThemePage(theme, "pricing"), false);
});

test("publishedPages can never resurrect index, 404, or a declared template shell", () => {
  const dir = makeStaticThemeDir(PAGES, {
    templates: ["page-shell.html"],
    publishedPages: ["index", "page-shell", "about"],
  });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(isStandaloneThemePage(theme, "index"), false);
  assert.equal(isStandaloneThemePage(theme, "page-shell"), false);
  assert.equal(isStandaloneThemePage(theme, "about"), true);
});

test("isPublishableThemePageCandidate: eligibility is independent of the recorded decision", () => {
  const dir = makeStaticThemeDir(PAGES, { templates: ["page-shell.html"], publishedPages: [] });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  // Eligible candidates — true regardless of whether publishedPages currently lists them.
  assert.equal(isPublishableThemePageCandidate(theme, "about"), true);
  assert.equal(isPublishableThemePageCandidate(theme, "pricing"), true);
  // Never eligible at all, decision or not.
  assert.equal(isPublishableThemePageCandidate(theme, "index"), false);
  assert.equal(isPublishableThemePageCandidate(theme, "page-shell"), false);
  assert.equal(isPublishableThemePageCandidate(theme, "does-not-exist"), false);
});
