import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTheme } from "../theme";

/**
 * @file `loadTheme()`'s static tier — the one tier that ships complete `pages/*.html` documents plus
 * root partials instead of a `templates/` route map, and whose loading therefore shares no branch
 * with any other tier.
 *
 * These certify the tier GATE as much as the reading: a static theme must be exempt from the
 * home+entry template requirement every other tier is held to, and a non-static theme must get no
 * pages, partials, or light tokens even when files with those exact names sit in its folder.
 */

const STATIC_THEMES_DIR = path.join(process.cwd(), "src/themes/static");

function makeStaticThemeDir(
  files: Record<string, string>,
  tier = "static",
  manifestExtra: Record<string, unknown> = {}
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-static-theme-"));
  fs.writeFileSync(
    path.join(dir, "theme.json"),
    JSON.stringify({ id: "t", name: "T", version: "1.0.0", tier, engine: 1, ...manifestExtra }),
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

test("the real static/basic theme loads valid with its pages, partials, light tokens and css", () => {
  const theme = loadTheme({
    themeDir: path.join(STATIC_THEMES_DIR, "basic"),
    id: "basic",
    source: "built-in",
  });

  assert.deepEqual(theme.errors, []);
  assert.equal(theme.status, "valid");
  assert.ok(theme.pages.index, "pages are keyed by filename minus .html");
  assert.ok(theme.pages["blog-post"]);
  // nav.html, footer.html and the footer-* variant are picked up from the theme ROOT, not pages/.
  assert.deepEqual(Object.keys(theme.partials).sort(), ["footer", "footer-minimal", "nav"]);
  assert.ok(Object.keys(theme.tokensLight).length > 0, "tokens.light.json is read for this tier");
  assert.ok(theme.css.length > 0, "static css comes from css/styles.css, not a root styles.css");
});

test("a static theme is exempt from the home+entry template requirement", () => {
  // Every other tier fails without templates/home + templates/entry. A static theme has no
  // templates/ route map at all, so holding it to that check would fail every static theme.
  const dir = makeStaticThemeDir({ "pages/index.html": "<html></html>" });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.deepEqual(theme.errors, []);
  assert.equal(theme.status, "valid");
});

test("a static theme with no pages/index.html is invalid", () => {
  const dir = makeStaticThemeDir({ "pages/about.html": "<html></html>" });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.includes("pages/index.html is required"));
  assert.ok(theme.pages.about, "the readable pages are still returned alongside the error");
});

test("a missing tokens.light.json is not an error — the theme just has no light variant", () => {
  const dir = makeStaticThemeDir({ "pages/index.html": "<html></html>" });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.deepEqual(theme.errors, []);
  assert.deepEqual(theme.tokensLight, {});
});

test("a malformed tokens.light.json is reported without losing the rest of the theme", () => {
  const dir = makeStaticThemeDir({
    "pages/index.html": "<html></html>",
    "nav.html": "<nav></nav>",
    "tokens.light.json": "{ not json",
  });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.some((e) => e.startsWith("tokens.light.json:")));
  assert.ok(theme.pages.index, "pages still load");
  assert.ok(theme.partials.nav, "partials still load");
});

test("a non-static theme gets no pages, partials or light tokens even when those files exist", () => {
  // The tier gate, asserted from the outside: these files are present on disk and must be ignored,
  // because only the static tier has any renderer that knows what to do with them.
  const dir = makeStaticThemeDir(
    {
      "pages/index.html": "<html></html>",
      "nav.html": "<nav></nav>",
      "tokens.light.json": JSON.stringify({ "--bg": "#fff" }),
      "templates/home.json": "{}",
      "templates/entry.json": "{}",
    },
    "declarative"
  );
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.deepEqual(theme.errors, []);
  assert.deepEqual(theme.pages, {});
  assert.deepEqual(theme.partials, {});
  assert.deepEqual(theme.tokensLight, {});
});

/**
 * The load-time content-marker guard (2026-08-11 owner decision, `ADS-memory/reports/continuity/
 * 2026-08-11-pages-template-decisions.md`): a declared `pageTemplate`/`postTemplate` entry that ships
 * no slot for its kind renders a structurally fine page with its actual content silently missing —
 * caught here, at load, rather than on a visitor's page view. Symmetric across both fields on purpose
 * (`validateTemplateDeclarations` in `theme.ts`, one function for both) — the owner's brief asked
 * for `pageTemplate` and explicitly invited adding the same check to `postTemplate` if the shape is
 * identical, which it is.
 */
test("a pageTemplate entry naming a file that does not exist is invalid, naming the entry", () => {
  const dir = makeStaticThemeDir({ "pages/index.html": "<html></html>" }, "static", {
    pageTemplate: ["missing-shell.html"],
  });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(theme.errors.includes("theme.json pageTemplate entry 'missing-shell.html' has no matching pages/missing-shell.html file"));
});

test("a pageTemplate entry whose file has no {\"type\":\"content\"} marker is invalid, naming the file", () => {
  const dir = makeStaticThemeDir(
    {
      "pages/index.html": "<html></html>",
      "pages/page-shell.html": "<html><body><p>No content slot here</p></body></html>",
    },
    "static",
    { pageTemplate: ["page-shell.html"] }
  );
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes('pages/page-shell.html is declared in theme.json pageTemplate but has no {"type":"content"} marker')
  );
});

test("a pageTemplate entry whose file DOES carry a content marker loads valid", () => {
  const dir = makeStaticThemeDir(
    {
      "pages/index.html": "<html></html>",
      "pages/page-shell.html": "<html><body><div data-embed-config='{\"type\":\"content\"}'></div></body></html>",
    },
    "static",
    { pageTemplate: ["page-shell.html"] }
  );
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.deepEqual(theme.errors, []);
  assert.equal(theme.status, "valid");
});

test("the symmetric guard also applies to postTemplate — a listed file with no post marker is invalid", () => {
  const dir = makeStaticThemeDir(
    {
      "pages/index.html": "<html></html>",
      "pages/blog-post.html": "<html><body><p>No post slot here</p></body></html>",
    },
    "static",
    { postTemplate: ["blog-post.html"] }
  );
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.equal(theme.status, "invalid");
  assert.ok(
    theme.errors.includes('pages/blog-post.html is declared in theme.json postTemplate but has no {"type":"post"} marker')
  );
});

test("a theme declaring no pageTemplate/postTemplate at all is unaffected by the guard", () => {
  const dir = makeStaticThemeDir({ "pages/index.html": "<html></html>" });
  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });

  assert.deepEqual(theme.errors, []);
  assert.equal(theme.status, "valid");
});
