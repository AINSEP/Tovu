import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { seedStarterTitle } from "../../seed-starter-title.js";

/** L11 "unmeasured": the creation name is HTML-escaped into the stock starter and its reset
 * snapshot, written raw into the JSON manifest, and nothing else is touched. */
function starter(t: import("node:test").TestContext) {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-starter-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  for (const prefix of ["", "__original-themes__"]) {
    const dir = path.join(themesDir, prefix, "static", "tovu-starter");
    fs.mkdirSync(path.join(dir, "render", "pages"), { recursive: true });
    fs.writeFileSync(path.join(dir, "render", "pages", "index.html"), `<title>Your Site</title><meta content="Your Site"><h1>Your Site</h1>`);
    fs.writeFileSync(path.join(dir, "manifest.webmanifest"), JSON.stringify({ name: "Your Site", short_name: "Site", start_url: "/" }));
    fs.writeFileSync(path.join(dir, "render", "pages", "about.html"), "Your Site");
  }
  return themesDir;
}
const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), "utf8");

test("the name is HTML-escaped in every stock page and its reset snapshot", (t) => {
  const themesDir = starter(t);
  const name = `Tom & Jerry's <"Café">`;
  seedStarterTitle({ themesDir, siteName: name });
  const escaped = "Tom &amp; Jerry&#39;s &lt;&quot;Café&quot;&gt;";
  for (const prefix of ["", "__original-themes__"]) {
    assert.equal(read(themesDir, prefix, "static", "tovu-starter", "render", "pages", "index.html"),
      `<title>${escaped}</title><meta content="${escaped}"><h1>${escaped}</h1>`, prefix || "live");
    assert.deepEqual(JSON.parse(read(themesDir, prefix, "static", "tovu-starter", "manifest.webmanifest")), { name, short_name: name, start_url: "/" });
    assert.equal(read(themesDir, prefix, "static", "tovu-starter", "render", "pages", "about.html"), "Your Site", "unlisted files are untouched");
  }
});

test("a replacement pattern in the name is inserted literally", (t) => {
  const themesDir = starter(t);
  seedStarterTitle({ themesDir, siteName: "$& $1 $$" });
  assert.match(read(themesDir, "static", "tovu-starter", "render", "pages", "index.html"), /^<title>\$&amp; \$1 \$\$<\/title>/);
});

test("missing starter files and a missing manifest are skipped without error", (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-starter-empty-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  assert.doesNotThrow(() => seedStarterTitle({ themesDir, siteName: "X" }));
  assert.deepEqual(fs.readdirSync(themesDir), []);
});
