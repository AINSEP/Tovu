import assert from "node:assert/strict";
import test from "node:test";

import { safeAspectRatio, safeTextAlign } from "../style-values.js";

// D1 (architecture-p2-plan-2026-09-24 §D1/D3) — CSS-injection allowlists for the two author-supplied
// values render.ts interpolates straight into a `style="…"` attribute. escapeHtml alone cannot stop
// a value that STAYS inside the attribute's quotes from smuggling a second declaration.

test("safeTextAlign: the three real align keywords pass through unchanged", () => {
  assert.equal(safeTextAlign("center"), "center");
  assert.equal(safeTextAlign("right"), "right");
  assert.equal(safeTextAlign("justify"), "justify");
});

test("safeTextAlign: 'left' (the CSS default) is rejected — the caller omits the attribute for it, same as any other unrecognized value", () => {
  assert.equal(safeTextAlign("left"), null);
});

test("safeTextAlign: a value that starts with a real keyword and smuggles a second declaration is rejected whole, not truncated to the keyword", () => {
  assert.equal(safeTextAlign("center;background:url(x)"), null);
  assert.equal(safeTextAlign("left;background:url(x)"), null);
});

test("safeTextAlign: an unrecognized keyword is rejected", () => {
  assert.equal(safeTextAlign("start"), null);
  assert.equal(safeTextAlign(""), null);
});

test("safeAspectRatio: a real ratio passes through unchanged, including internal whitespace", () => {
  assert.equal(safeAspectRatio("4 / 3"), "4 / 3");
  assert.equal(safeAspectRatio("16/9"), "16/9");
  assert.equal(safeAspectRatio("1.5 / 2.25"), "1.5 / 2.25");
});

test("safeAspectRatio: a value that starts with a real ratio and smuggles a second declaration is rejected whole", () => {
  assert.equal(safeAspectRatio("1;background:url(x)"), null);
  assert.equal(safeAspectRatio("1/1;position:fixed"), null);
});

test("safeAspectRatio: non-ratio-shaped values are rejected", () => {
  assert.equal(safeAspectRatio("auto"), null);
  assert.equal(safeAspectRatio(""), null);
  assert.equal(safeAspectRatio("16 / "), null);
});
