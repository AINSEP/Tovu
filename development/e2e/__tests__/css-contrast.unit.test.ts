import assert from "node:assert/strict";
import test from "node:test";
import { compositeOver, contrastRatio, controlEdgeContrast, parseComputedColor } from "../support/css-contrast.js";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≈ ${expected}`);

test("a transparent border is not read as black: the control's fill becomes its edge", () => {
  assert.deepEqual(parseComputedColor("rgba(0, 0, 0, 0)"), [0, 0, 0, 0]);
  // White panel, transparent border, black fill: the fill is measured (21:1).
  close(controlEdgeContrast({ surface: "rgb(255, 255, 255)", border: "rgba(0, 0, 0, 0)", background: "rgb(0, 0, 0)" }), 21);
  // Nothing visible at all: no edge, ratio 1 — the old parser reported 21:1 here.
  close(controlEdgeContrast({ surface: "rgb(255, 255, 255)", border: "rgba(0, 0, 0, 0)", background: "rgba(0, 0, 0, 0)" }), 1);
});

test("a half-transparent border composites over the control's fill", () => {
  const edge = compositeOver(parseComputedColor("rgba(0, 0, 0, 0.5)"), parseComputedColor("rgb(255, 255, 255)"));
  close(edge[0], 0.5);
  close(contrastRatio(edge, parseComputedColor("rgb(255, 255, 255)")), 3.98);
  close(controlEdgeContrast({ surface: "rgb(255, 255, 255)", border: "rgba(0, 0, 0, 0.5)", background: "rgba(0, 0, 0, 0)" }), 3.98);
});

test("oklch and color(srgb) parse with their alpha", () => {
  close(contrastRatio(parseComputedColor("oklch(1 0 0)"), parseComputedColor("oklch(0 0 0)")), 21);
  assert.equal(parseComputedColor("oklch(0.5 0.1 200 / 0.25)")[3], 0.25);
  assert.deepEqual(parseComputedColor("color(srgb 1 0.5 0 / 0.4)"), [1, 0.5, 0, 0.4]);
  assert.throws(() => parseComputedColor("hsl(0 0% 0%)"), /unparsed color hsl/);
});
