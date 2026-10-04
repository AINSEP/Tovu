/** Quick wins A: reinstall defaults must not restore links to unpublished template pages. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../../../../..");
for (const relative of [
  "content/themes/static/tovu-theme/render/partials/footer.html",
  "content/themes/__original-themes__/static/tovu-theme/render/partials/footer.html",
  "sites/tovu-dev/themes/static/tovu-theme/render/partials/footer.html",
  "sites/tovu-dev/themes/__original-themes__/static/tovu-theme/render/partials/footer.html",
]) {
  test(`footer defaults: ${relative} uses menus with no unconditional fallback links`, () => {
    const footer = fs.readFileSync(path.join(root, relative), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    assert.match(footer, /"id":"footer-resources"/);
    assert.match(footer, /"id":"menu-footer-nav"/);
    assert.doesNotMatch(footer, /<a\b[^>]*\bhref=/i, "missing menus must render no guaranteed dead links");
  });
}
