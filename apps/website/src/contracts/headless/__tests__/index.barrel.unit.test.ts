import assert from "node:assert/strict";
import test from "node:test";

import * as headless from "../index.js";
import * as approvals from "../assistant-tool-approval-policy.js";
import * as permanentDeletes from "../assistant-permanent-deletes-policy.js";
import * as secrets from "../secret-form-cards.js";
import * as installSource from "../plugin-install-source.js";

/** @file The browser contract barrel exposes metadata unchanged; implementations stay with their owners. */
test("the headless barrel exposes exactly the owning modules' runtime values", () => {
  const expected: Record<string, unknown> = {
    ...approvals, ...permanentDeletes, ...secrets, ...installSource,
  };
  assert.deepEqual(Object.keys(headless).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.equal((headless as Record<string, unknown>)[name], value, name);
  }
});
