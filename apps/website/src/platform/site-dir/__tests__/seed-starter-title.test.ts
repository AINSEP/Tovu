import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { seedSiteThemes } from "../seed-site-themes.js";

test("D-05: the creation name seeds public HTML and JSON, including the reset copy, only once", () => {
  const root = mkdtempSync(join(tmpdir(), "tovu-starter-title-"));
  try {
    const stockDir = join(root, "stock");
    for (const prefix of ["", "__original-themes__"]) {
      const starter = join(stockDir, prefix, "static", "tovu-starter");
      mkdirSync(join(starter, "render", "pages"), { recursive: true });
      writeFileSync(join(starter, "render", "pages", "index.html"), '<title>Your Site</title><h1>Your Site</h1><a title="Your Site">Home</a>');
      writeFileSync(join(starter, "manifest.webmanifest"), '{"name":"Your Site","short_name":"Your Site","start_url":"/"}');
    }
    const siteThemesDir = join(root, "site", "themes");
    const siteName = 'Hunt <Alpha> & "Beta" $& 日本語';
    assert.equal(seedSiteThemes({ stockDir, siteThemesDir }, { siteName }).status, "seeded");
    for (const prefix of ["", "__original-themes__"]) {
      const starter = join(siteThemesDir, prefix, "static", "tovu-starter");
      assert.equal(readFileSync(join(starter, "render", "pages", "index.html"), "utf8"), '<title>Hunt &lt;Alpha&gt; &amp; &quot;Beta&quot; $&amp; 日本語</title><h1>Hunt &lt;Alpha&gt; &amp; &quot;Beta&quot; $&amp; 日本語</h1><a title="Hunt &lt;Alpha&gt; &amp; &quot;Beta&quot; $&amp; 日本語">Home</a>');
      assert.equal(readFileSync(join(starter, "manifest.webmanifest"), "utf8"), JSON.stringify({ name: siteName, short_name: siteName, start_url: "/" }, null, 2) + "\n");
    }
    const page = join(siteThemesDir, "static", "tovu-starter", "render", "pages", "index.html");
    writeFileSync(page, "Owner's edited title");
    assert.equal(seedSiteThemes({ stockDir, siteThemesDir }, { siteName: "Different" }).status, "already-present");
    assert.equal(readFileSync(page, "utf8"), "Owner's edited title");
    assert.equal(readFileSync(join(stockDir, "static", "tovu-starter", "manifest.webmanifest"), "utf8"), '{"name":"Your Site","short_name":"Your Site","start_url":"/"}');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
