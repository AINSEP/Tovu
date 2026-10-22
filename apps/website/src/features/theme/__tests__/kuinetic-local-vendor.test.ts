import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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
      assert.doesNotMatch(raw, /<script\b[^>]*src=["'][^"']*kuinetic/i, `${relative}: kUInetic loads once from the footer partial, not per page`);
      assert.match(raw, /data-embed-config='\{"type":"partial","id":"footer"/, `${relative}: must include the footer partial that loads kUInetic`);
    }
  }
  assert.equal(pages, 2 * (6 + 13), "tovu-starter (6) + tovu-theme (13) pages, live and original");
});

test("each stock footer partial loads the theme's local kUInetic exactly once", () => {
  for (const themeDir of stockThemeDirs()) {
    const id = path.basename(themeDir);
    assert.ok(fs.existsSync(path.join(themeDir, "scripts/vendor/kuinetic.all.js")), `${id}: vendored kuinetic.all.js is shipped`);
    assert.ok(fs.existsSync(path.join(themeDir, "scripts/vendor/kuinetic-LICENSE.md")), `${id}: its LICENSE ships next to it`);
    for (const partial of ["footer.html", "footer-minimal.html"]) {
      const markup = loadMarkup(path.join(themeDir, "render/partials", partial));
      const tags = [...markup.matchAll(/<script\b[^>]*src=["']([^"']*kuinetic[^"']*)["'][^>]*>/gi)].map((m) => m[1]);
      assert.deepEqual(tags, [`/theme-assets/${id}/scripts/vendor/kuinetic.all.js`], `${id}/${partial}: one local kUInetic tag`);
      assert.doesNotMatch(markup, /<script\b[^>]*src=["']https?:/i, `${id}/${partial}: no remote script`);
      assert.ok(!markup.includes("document.write("), `${id}/${partial}: no document.write`);
    }
  }
});
