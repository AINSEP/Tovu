import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "#src/features/theme/index";
import { renderSite } from "../render-site.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../../../../");

/**
 * The static tier answers `home` only from the theme's `index` page. A static theme that lacks one
 * (hand-edited or partially uploaded) must fall through to the built-in component render instead of
 * serving an empty document or the literal text "null".
 */
test("renderSite: a static-tier theme without an index page falls back to the built-in home body", async () => {
  const loaded = loadTheme({ themeDir: path.join(REPO_ROOT, "content", "themes", "static", "tovu-theme"), id: "tovu-theme", source: "built-in" });
  assert.equal(loaded.manifest.tier, "static");
  assert.ok(typeof loaded.pages.index === "string" && loaded.pages.index.length > 0, "fixture precondition: the real theme has an index page");
  const withoutIndex = { ...loaded, pages: Object.fromEntries(Object.entries(loaded.pages).filter(([id]) => id !== "index")) };

  const staticHome = await renderSite({ theme: loaded, route: "home", siteTitle: "Fallback Fixture", posts: [] });
  const html = await renderSite({ theme: withoutIndex, route: "home", siteTitle: "Fallback Fixture", posts: [] });

  assert.notEqual(html, staticHome, "the static index page must not be served once it is gone");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Fallback Fixture<\/title>/);
  assert.match(html, /No published posts yet\./);
  assert.doesNotMatch(html, /\bnull\b(?![-\w])/);
});
