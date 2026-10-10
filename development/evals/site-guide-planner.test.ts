import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSiteGuidePlanner, scoreSiteGuidePlanner } from "./site-guide-planner.js";

test("guide eval refuses native-looking plans that skipped learning, and requires both topics", () => {
  const explanation = (topic: string) => ({ toolId: "site_guide", input: { operation: "explain", topic } });
  assert.deepEqual(scoreSiteGuidePlanner({ trace: { calls: [], answer: "Use forms and widgets." } }), { passed: false, guideFirst: false, teachesNativeBuildingBlocks: false });
  const calls = [{ toolId: "site_guide", input: { operation: "overview" } }, explanation("forms"), explanation("widgets")];
  assert.deepEqual(scoreSiteGuidePlanner({ trace: { calls, answer: "Reuse native form definitions and contact-form widgets." } }), { passed: true, guideFirst: true, teachesNativeBuildingBlocks: true });
  assert.equal(scoreSiteGuidePlanner({ trace: { calls: calls.slice(0, 2), answer: "Use forms and widgets." } }).passed, false);
  assert.equal(scoreSiteGuidePlanner({ trace: { calls: [{ toolId: "theme_write_file", input: {} }, ...calls], answer: "Use forms and widgets." } }).guideFirst, false);
});
test("eval scaffold runs through an injected runner and reports each plugin/permission variant", async () => {
  const variants: string[] = [];
  const results = await evaluateSiteGuidePlanner({ model: "configured-cheap-model", runner: { run: async input => {
    assert.equal(input.prompt, "Design a planner directory site.");
    assert.equal(input.model, "configured-cheap-model"); assert.ok(input.system.includes('site_guide({"operation":"overview"})'));
    variants.push(input.variant); return { calls: [], answer: "No granted forms or widgets." };
  } } });
  assert.deepEqual(variants, ["enriched", "core-only", "restricted"]);
  assert.deepEqual(results.map(result => result.requiresPermissionReview), [false, false, true]);
});

test("form evidence requires a whole word or the exact native tool id", () => {
  const calls = [
    { toolId: "site_guide", input: { operation: "overview" } },
    { toolId: "site_guide", input: { operation: "explain", topic: "forms" } },
    { toolId: "site_guide", input: { operation: "explain", topic: "widgets" } },
  ];
  for (const answer of ["Use information and widgets.", "Choose a platform and widgets.", "Format the widgets."]) {
    assert.equal(scoreSiteGuidePlanner({ trace: { calls, answer } }).teachesNativeBuildingBlocks, false, answer);
  }
  for (const answer of ["Use a form and widgets.", "Use forms and widgets.", "Use forms_create_definition and widgets."]) {
    assert.equal(scoreSiteGuidePlanner({ trace: { calls, answer } }).passed, true, answer);
  }
});
