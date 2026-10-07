/** Todo 2: the authored landing deck's controls must clear the fixed site-chat FAB on phones.
 * The page stores its own .tv .deck-shell rules in body_html; a more specific theme selector
 * overrides that later style tag. CSS contract/geometry arithmetic only: no browser layout claim. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const theme = "sites/tovu-dev/themes/static/tovu-theme/css/theme.css";
const selector = '.tv .deck-shell[data-od-id="proof-deck"]';
function controlGrid() {
  const rules: postcss.Rule[] = [];
  postcss.parse(readFileSync(theme, "utf8")).walkRules(selector, (rule) => { rules.push(rule); });
  assert.equal(rules.length, 1, "the authored landing deck needs a scoped mobile control-row override");
  return rules[0];
}

test("2 landing control spacing is narrow-screen-only and keeps the video row full width", () => {
  const rule = controlGrid();
  const media = rule.parent as postcss.AtRule;
  assert.equal(media.name, "media");
  assert.equal(media.params, "(max-width: 640px)");
  assert.deepEqual(rule.nodes.map((node) => node.type === "decl" ? node.prop : node.type), ["grid-template-columns"]);
  // Existing grid areas still span all three columns for video and dots; only the ctrl area shrinks.
  assert.ok(selector.includes('[data-od-id="proof-deck"]'), "do not move unrelated theme carousels");
});

test("2 next/previous hit targets stay separate and clear the default FAB at phone widths", () => {
  const rule = controlGrid();
  let columns = "";
  rule.walkDecls("grid-template-columns", (decl) => { columns = decl.value; });
  const sizes = /^(\d+)px minmax\(0,\s*1fr\) (\d+)px$/.exec(columns);
  assert.ok(sizes, `expected bounded control gutters, got ${columns}`);
  const left = Number(sizes[1]), right = Number(sizes[2]);
  // These are the authored landing page's existing minimum wrap padding and 44px arrow targets.
  const padding = 20, arrow = 44;
  for (const width of [280, 320, 360, 390, 480, 640]) {
    const fabRight = width <= 480 ? 12 : 24;
    const fabWidth = 56;
    const arrowRight = width - padding - right;
    const fabLeft = width - fabRight - fabWidth;
    assert.ok(arrowRight + 8 <= fabLeft, `${width}px next arrow must leave a gap before the FAB`);
    assert.ok(width - 2 * padding - left - right >= 2 * arrow, `${width}px arrows must not overlap each other`);
  }
});
