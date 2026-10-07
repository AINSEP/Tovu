/** Todo 15d: parse shipped CSS with PostCSS. Browser launch is unavailable in this sandbox. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";

for (const theme of ["tovu-starter", "tovu-theme"]) {
  for (const prefix of ["", "__original-themes__/"]) {
    const path = `content/themes/${prefix}static/${theme}/css/theme.css`;
    test(`15d ${path}: every heading gets emergency wrapping at 360px with no desktop override`, () => {
      const root = postcss.parse(readFileSync(path, "utf8"));
      const headings = new Set<string>();
      root.walkRules((rule) => {
        rule.walkDecls("overflow-wrap", (declaration) => {
          if (declaration.value !== "anywhere") return;
          const selectors = rule.selectors.filter((selector) => /^h[1-6]$/.test(selector));
          if (!selectors.length) return;
          assert.equal(rule.parent?.type, "atrule", "wrapping must be scoped to narrow screens");
          const media = rule.parent as postcss.AtRule;
          assert.equal(media.name, "media");
          const limit = /max-width:\s*(\d+)px/.exec(media.params);
          assert.ok(limit && Number(limit[1]) >= 360 && Number(limit[1]) <= 720, `unexpected breakpoint ${media.params}`);
          selectors.forEach((selector) => headings.add(selector));
          assert.deepEqual(rule.nodes.map((node) => node.type === "decl" ? node.prop : node.type), ["overflow-wrap"], "retain all typography and layout rules");
        });
      });
      assert.deepEqual([...headings].sort(), ["h1", "h2", "h3", "h4", "h5", "h6"]);
    });
  }
}
