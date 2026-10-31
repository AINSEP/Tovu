import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { renderStaticPage } from "../static-render.js";
import { loadTheme } from "../theme.js";
import { checkApprovedRoots } from "../validation/structure.js";
import { renderSite } from "#src/server/inbound/public-http/http/site/render";

const ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const STOCK_THEMES = ["tovu-starter", "tovu-theme"];
// Fixing only the live tree reintroduces the CDN tag on Reset/reinstall, so both copies are checked.
const STOCK_ROOTS = ["content/themes/static", "content/themes/__original-themes__/static"];

function htmlFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(file);
    return entry.isFile() && entry.name.endsWith(".html") ? [file] : [];
  });
}

/** Comments and <pre>/<code> blocks are not loads (kuinetic-showcase prints escaped install snippets). */
function loadMarkup(file: string): string {
  return fs.readFileSync(file, "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
    .replace(/<code\b[\s\S]*?<\/code>/gi, "");
}

function stockThemeDirs(): string[] {
  return STOCK_ROOTS.flatMap((root) => STOCK_THEMES.map((id) => path.join(ROOT, root, id)));
}

// Owner rule 2026-10-22 (supersedes the 09-27 "major range + local fallback" rule): kUInetic loads
// from the theme's own vendored file only — no third-party CDN, no document.write, no unreviewed @0.
test("no shipped or site theme loads kUInetic from jsDelivr", () => {
  const requiredRoots = ["content/themes"];
  const optionalRoots = ["sites/tovu-dev/themes", "apps/website/src/sites", "apps/website/sites"];
  const roots = [...requiredRoots, ...optionalRoots.filter((directory) => fs.existsSync(path.join(ROOT, directory)))];
  let inspected = 0;
  for (const directory of roots) {
    for (const file of htmlFiles(path.join(ROOT, directory))) {
      inspected++;
      assert.doesNotMatch(loadMarkup(file), /cdn\.jsdelivr\.net\/npm\/kuinetic/, `${path.relative(ROOT, file)}: load the theme's vendored kUInetic, not the CDN`);
    }
  }
  assert.ok(inspected > 0, "must inspect real theme HTML, not an empty set");
});

test("stock theme pages carry no kUInetic tag or document.write of their own", () => {
  let pages = 0;
  for (const themeDir of stockThemeDirs()) {
    for (const file of htmlFiles(path.join(themeDir, "render/pages"))) {
      pages++;
      const raw = fs.readFileSync(file, "utf8");
      const relative = path.relative(ROOT, file);
      assert.ok(!raw.includes("cdn.jsdelivr.net/npm/kuinetic"), `${relative}: no kUInetic CDN reference, even in a comment`);
      assert.ok(!raw.includes("document.write("), `${relative}: no document.write`);
      // The runtime itself loads once from the footer partial. A page may still carry the small pre-JS
      // cloak helper (assets/vendor/kuinetic/kui-cloak.js) in <head>: it has to run before <body> paints.
      assert.doesNotMatch(raw, /<script\b[^>]*src=["'][^"']*kuinetic\.all(\.min)?\.js/i, `${relative}: kUInetic loads once from the footer partial, not per page`);
      assert.match(raw, /data-embed-config='\{"type":"partial","id":"footer"/, `${relative}: must include the footer partial that loads kUInetic`);
    }
  }
  assert.equal(pages, 2 * (6 + 13), "tovu-starter (6) + tovu-theme (13) pages, live and original");
});

test("each stock footer partial loads the theme's local kUInetic exactly once", () => {
  for (const themeDir of stockThemeDirs()) {
    const id = path.basename(themeDir);
    assert.ok(fs.existsSync(path.join(themeDir, "assets/vendor/kuinetic/kuinetic.all.min.js")), `${id}: vendored kuinetic.all.min.js is shipped`);
    assert.ok(fs.existsSync(path.join(themeDir, "assets/vendor/kuinetic/LICENSE")), `${id}: its LICENSE ships next to it`);
    for (const partial of ["footer.html", "footer-minimal.html"]) {
      const markup = loadMarkup(path.join(themeDir, "render/partials", partial));
      const tags = [...markup.matchAll(/<script\b[^>]*src=["']([^"']*kuinetic\.all\.min\.js[^"']*)["'][^>]*>/gi)].map((m) => m[1]);
      assert.deepEqual(tags, [`/theme-assets/${id}/assets/vendor/kuinetic/kuinetic.all.min.js`], `${id}/${partial}: one local kUInetic tag`);
      assert.doesNotMatch(markup, /<script\b[^>]*src=["']https?:/i, `${id}/${partial}: no remote script`);
      assert.ok(!markup.includes("document.write("), `${id}/${partial}: no document.write`);
    }
  }
});

test("every rendered stock page runs exactly one kUInetic script, the theme's local copy", () => {
  for (const id of STOCK_THEMES) {
    const theme = loadTheme({ themeDir: path.join(ROOT, "content/themes/static", id), id, source: "site" });
    assert.equal(theme.status, "valid", `${id}: ${JSON.stringify(theme.errors)}`);
    for (const pageId of Object.keys(theme.pages)) {
      const html = renderStaticPage({ theme, pageId, menus: {} }) ?? "";
      const tags = [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script\b[^>]*src=["']([^"']*kuinetic\.all\.min\.js[^"']*)["']/gi)].map((m) => m[1]);
      assert.deepEqual(tags, [`/theme-assets/${id}/assets/vendor/kuinetic/kuinetic.all.min.js`], `${id}/${pageId}`);
      assert.ok(!html.includes("document.write("), `${id}/${pageId}: no document.write`);
    }
  }
});

// Owner 2026-10-30: every bundled theme and its reset source carries one removable library folder.
test("all bundled animation folders contain the same built 0.2.4 bundle, license and removal guide", () => {
  const themes = ["static/tovu-starter", "static/tovu-theme", "templated/fashion-modern", "templated/storefront"];
  let referenceBundle: Buffer | undefined;
  for (const root of ["content/themes", "content/themes/__original-themes__"]) {
    for (const theme of themes) {
      const themeDir = path.join(ROOT, root, theme);
      const library = path.join(themeDir, "assets/vendor/kuinetic");
      const bundle = fs.readFileSync(path.join(library, "kuinetic.all.min.js"));
      referenceBundle ??= bundle;
      assert.deepEqual(bundle, referenceBundle, `${themeDir}: matches every other bundled copy`);
      assert.match(fs.readFileSync(path.join(library, "LICENSE"), "utf8"), /MIT License[\s\S]*2026 AINSEP/);
      const readme = fs.readFileSync(path.join(library, "README.md"), "utf8");
      assert.match(readme, /0\.2\.4/);
      assert.match(readme, /To remove or swap the animation library/);
      assert.match(readme, /data-kui.*inert/);
      assert.ok(!fs.existsSync(path.join(themeDir, "scripts/vendor/kuinetic.all.min.js")), themeDir);
      assert.ok(!fs.existsSync(path.join(themeDir, "css/kuinetic-cloak.css")), themeDir);
      // These stock icon/manifest roots predate this change in both live and reset copies.
      // Keep the vendor-folder check strict without changing the product's v2 validator.
      const existingRoots = theme.startsWith("static/") ? ["icons", "manifest.webmanifest"] : [];
      const unexpectedIssues = checkApprovedRoots({ themeDir }).filter(issue =>
        issue.ruleId !== "structure-unapproved-root" || !existingRoots.includes(issue.path ?? ""));
      assert.deepEqual(unexpectedIssues, [], `${themeDir}: asset directory is an approved v2 root`);
    }
  }
});

test("every bundled Liquid page appends one marked local runtime", async () => {
  for (const root of ["content/themes", "content/themes/__original-themes__"]) {
    for (const id of ["fashion-modern", "storefront"]) {
      const theme = loadTheme({ themeDir: path.join(ROOT, root, "templated", id), id, source: "built-in" });
      assert.equal(theme.status, "valid", theme.errors.join("; "));
      assert.equal(Object.keys(theme.liquidTemplates).length, id === "fashion-modern" ? 4 : 3);
      for (const [templateId, source] of Object.entries(theme.liquidTemplates)) {
        assert.match(source, /<!-- kuinetic: remove these lines to drop the library -->\s*<script[^>]+kuinetic\.all\.min\.js["'][^>]*><\/script>\s*$/);
        const html = await renderSite({ theme, route: "home", liquidTemplateIdOverride: templateId, siteTitle: "Animation contract", posts: [] });
        const tags = [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<script\b[^>]*src=["']([^"']*kuinetic\.all\.min\.js[^"']*)["']/gi)].map((m) => m[1]);
        assert.deepEqual(tags, [`/theme-assets/${id}/assets/vendor/kuinetic/kuinetic.all.min.js`], `${root}/${id}/${templateId}`);
      }
    }
  }
});
