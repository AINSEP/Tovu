import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { applicableThemeTemplates } from "../template-applicability.js";
import { injectPageTitle, renderStaticPage, resolveTemplate } from "../static-render.js";
import type { DiscoveredTheme } from "../index.js";

/**
 * @file f5 (seen on camera 2026-10-30, Nimbus demo): a "Nimbus — Sleep Headphones" landing page built
 * inside the active Tovu Starter theme wore the site's own "Ember & Bean" header and footer. Both
 * bundled static themes must offer a page template with NO site chrome, still loading the theme's CSS
 * and scripts, so the assistant can pick it from `availableTemplates` for a different brand's page.
 * Read off the real themes on disk and rendered through the real static renderer.
 */
const THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes/static");

function readTheme(id: string): DiscoveredTheme {
  const dir = path.join(THEMES_DIR, id);
  const read = (relative: string) => fs.readFileSync(path.join(dir, relative), "utf8");
  const manifest = JSON.parse(read("theme.json")) as DiscoveredTheme["manifest"];
  const pages = Object.fromEntries(fs.readdirSync(path.join(dir, "render/pages")).map((file) => [file.replace(/\.html$/, ""), read(`render/pages/${file}`)]));
  const partials = Object.fromEntries(fs.readdirSync(path.join(dir, "render/partials")).map((file) => [file.replace(/\.html$/, ""), read(`render/partials/${file}`)]));
  return { manifest, dir, tokens: JSON.parse(read("tokens.json")), tokensLight: JSON.parse(read("tokens.light.json")), templates: {}, liquidTemplates: {},
    handlebarsTemplates: {}, pages, partials, css: "", source: "builtin", status: "valid", errors: [] } as unknown as DiscoveredTheme;
}

for (const id of ["tovu-starter", "tovu-theme"]) {
  test(`${id} offers pages-blank.html for pages: content only, no site header or footer, theme CSS and scripts kept`, () => {
    const theme = readTheme(id);
    assert.ok(applicableThemeTemplates({ manifest: theme.manifest, kind: "page" }).includes("pages-blank.html"));
    const resolution = resolveTemplate({ theme, templateChoice: "pages-blank.html" });
    assert.equal(resolution.kind, "template");
    if (resolution.kind !== "template") return;
    const html = renderStaticPage({ theme, pageId: resolution.pageId, htmlOverride: injectPageTitle(resolution.html, "Nimbus — Sleep Headphones"), menus: {} }) ?? "";
    assert.match(html, /<title>Nimbus — Sleep Headphones<\/title>/);
    assert.match(html, /data-embed-config='\{"type":"content"\}'/);
    assert.doesNotMatch(html, /class="site-header"|<footer/);
    assert.match(html, /theme\.css/);
    assert.match(html, /scripts\/main\.js/);
    assert.match(html, /kuinetic\.all\.min\.js/);
  });
}
