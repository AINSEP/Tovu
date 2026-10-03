import assert from "node:assert/strict";
import test from "node:test";
import { resolveSeverity } from "../profiles.js";

// F4.3/F6.2: install must distinguish polish from unread runtime fields.
test("polish stays advisory at install while publish rejects each missing requirement", () => {
  for (const ruleId of ["license-missing", "preview-thumbnail-missing", "description-missing"]) {
    assert.equal(resolveSeverity({ ruleId, profile: "author" }), "warning", ruleId);
    assert.equal(resolveSeverity({ ruleId, profile: "install" }), "warning", ruleId);
    assert.equal(resolveSeverity({ ruleId, profile: "publish" }), "error", ruleId);
  }
});

// F4.4: a newly named field catches replacing the naming policy with a known-id list.
test("new unimplemented field names warn only during authoring and near misses stay strict", () => {
  assert.equal(resolveSeverity({ ruleId: "v2-future-render-feature-unimplemented", profile: "author" }), "warning");
  assert.equal(resolveSeverity({ ruleId: "v2-future-render-feature-unimplemented", profile: "install" }), "error");
  assert.equal(resolveSeverity({ ruleId: "v2-future-render-feature-unimplemented", profile: "publish" }), "error");
  for (const ruleId of ["v2--unimplemented", "v2-future-unimplemented-extra", "prefix-v2-future-unimplemented", "references-missing-file", "unknown-rule"]) {
    for (const profile of ["author", "install", "publish"] as const) {
      assert.equal(resolveSeverity({ ruleId, profile }), "error", `${profile}: ${ruleId}`);
    }
  }
});
