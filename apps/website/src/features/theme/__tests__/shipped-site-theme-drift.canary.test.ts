import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { relativeFilePaths } from "../sync-originals.js";
import { loadTheme } from "../theme.js";
import { renderStaticPage, resolveTemplate } from "../static-render.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const STOCK_DIR = path.join(REPO_ROOT, "content/themes/static/tovu-theme");
const REFERENCE_PATH = "sites/tovu-dev/themes/static/tovu-theme";
const REFERENCE_DIR = path.join(REPO_ROOT, REFERENCE_PATH);
// Tracking a site draft later does not promote it into release stock. Keep the draft named
// by the parity contract below site-only; every other tracked reference file must still match.
const SITE_ONLY_DRAFT = "render/pages/posts-2-sidebars.html";

/**
 * Only this repository's TRACKED reference is a release parity contract. Real installations
 * remain customizable; never copy stock over them or compare arbitrary sites to stock.
 * Git's read-only tracked-file list deliberately excludes local drafts (e.g. posts-2-sidebars)
 * and cannot turn a deleted reference tree into a vacuously green check.
 *
 * NOTICE prose can differ as provenance accumulates. HTML comments can also differ: stock
 * already fixed literal body tags in comments that confuse string-based render injection.
 * Keep that newer fix while promoting the site's runtime markup. Everything else, including
 * binary assets, CSS, JS, tokens, manifest and the complete tracked file set, must match.
 */
test("release stock matches the tracked site reference, without promoting local drafts", () => {
  const referenceFiles = execFileSync("git", ["ls-files", "-z", "--", REFERENCE_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).split("\0").filter(Boolean).map((file) => file.slice(REFERENCE_PATH.length + 1))
    .filter((file) => file !== SITE_ONLY_DRAFT).sort();
  assert.ok(referenceFiles.includes("theme.json"), "the tracked reference must exist; do not skip a missing site");
  assert.ok(!fs.existsSync(path.join(STOCK_DIR, SITE_ONLY_DRAFT)), "the site-only draft must not be promoted into release stock");
  assert.deepEqual(relativeFilePaths(STOCK_DIR), referenceFiles,
    "stock/reference file sets drifted: reconcile added, deleted or renamed files before releasing");

  for (const file of referenceFiles) {
    if (file === "NOTICE.md") continue;
    const stock = fs.readFileSync(path.join(STOCK_DIR, file));
    const reference = fs.readFileSync(path.join(REFERENCE_DIR, file));
    if (file.endsWith(".html")) {
      const runtimeMarkup = (bytes: Buffer): string => bytes.toString("utf8").replace(/<!--[\s\S]*?-->/g, "");
      assert.equal(runtimeMarkup(stock), runtimeMarkup(reference), `${file}: stock/reference runtime markup drifted`);
    } else {
      assert.deepEqual(stock, reference, `${file}: stock/reference bytes drifted`);
    }
  }
});

test("release stock declares current content templates and an explicit publication policy", () => {
  const theme = loadTheme({ themeDir: STOCK_DIR, id: "tovu-theme", source: "site" });
  assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
  assert.deepEqual(theme.manifest.publishedPages, [], "reinstall must not republish demo pages implicitly");
  // The authored `pages` declaration is not exposed on the runtime ThemeManifest.
  const manifest = JSON.parse(fs.readFileSync(path.join(STOCK_DIR, "theme.json"), "utf8"));
  assert.deepEqual(manifest.pages, ["index", "about", "pricing", "docs", "changelog", "download", "signin", "signup"]);
  assert.deepEqual(theme.manifest.templates, ["posts-default.html", "posts-sidebar.html", "pages-default.html", "index", "listing-default.html"]);
  for (const choice of theme.manifest.templates ?? []) {
    assert.ok(theme.pages[choice.replace(/\.html$/, "")], `${choice}: declared template must exist`);
  }
  for (const [legacy, current] of [
    ["blog-post.html", "posts-default"],
    ["blog-sidebar-template.html", "posts-sidebar"],
    ["page-shell.html", "pages-default"],
  ]) {
    const resolved = resolveTemplate({ theme, templateChoice: legacy });
    assert.equal(resolved.kind, "template", `${legacy}: stored choices must survive the rename`);
    assert.equal(resolved.kind === "template" ? resolved.pageId : undefined, current);
  }
});

test("reinstall stock renders nested header links and menu-owned footer links", () => {
  const theme = loadTheme({ themeDir: STOCK_DIR, id: "tovu-theme", source: "site" });
  assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
  const item = (label: string, href: string) => ({ label, href, available: true, isCurrent: false, children: [] });
  const html = renderStaticPage({
    theme,
    pageId: "pages-default",
    menus: {
      "menu-header-nav": [{ ...item("Docs", "/docs"), children: [item("Nested upgrade sentinel", "/nested-upgrade-sentinel")] }],
      "footer-resources": [item("Footer resources sentinel", "/footer-resources-sentinel")],
      "menu-footer-nav": [item("Footer legal sentinel", "/footer-legal-sentinel")],
    },
  });
  assert.ok(html, "current page template must render after a reinstall");
  assert.ok(html.includes('href="/nested-upgrade-sentinel"'), "flat navigation silently loses children");
  assert.ok(html.includes('class="menu-list depth-1"'), "header must preserve tree structure");
  assert.ok(html.includes('href="/footer-resources-sentinel"'), "resources must resolve the stored menu");
  assert.ok(html.includes('href="/footer-legal-sentinel"'), "legal links must resolve the stored menu");
});
