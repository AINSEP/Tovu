import assert from "node:assert/strict";
import test from "node:test";
import * as trust from "../trust.js";
import type { RemoteToolDescriptorAnnotations } from "../ports.js";

// Exhaustive combinations catch a remote contradiction overriding even an explicit read grant.
for (const listed of [false, true]) {
  for (const readOnlyHint of [undefined, false, true]) {
    for (const destructiveHint of [undefined, false, true]) {
      test(`operator read decision: listed=${listed}, readOnlyHint=${readOnlyHint}, destructiveHint=${destructiveHint}`, () => {
        assert.equal(typeof trust.isOperatorDeclaredReadOnly, "function", "the operator read trust decision must be exported");
        const annotations: RemoteToolDescriptorAnnotations = {
          ...(readOnlyHint === undefined ? {} : { readOnlyHint }),
          ...(destructiveHint === undefined ? {} : { destructiveHint }),
        };
        assert.equal(trust.isOperatorDeclaredReadOnly("inspect", annotations, new Set(listed ? ["inspect"] : [])),
          listed && readOnlyHint !== false && destructiveHint !== true);
      });
    }
  }
}
test("missing read list and absent annotations never grant read-only from a remote hint", () => {
  assert.equal(typeof trust.isOperatorDeclaredReadOnly, "function");
  assert.equal(trust.isOperatorDeclaredReadOnly("inspect", { readOnlyHint: true }, undefined), false);
  assert.equal(trust.isOperatorDeclaredReadOnly("inspect", undefined, new Set(["inspect"])), true);
});
