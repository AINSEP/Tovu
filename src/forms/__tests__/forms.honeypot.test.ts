import assert from "node:assert/strict";
import test from "node:test";

import { isHoneypotTripped } from "../forms.js";

/**
 * @file Unit tests for `isHoneypotTripped` (C-004, REQ-08, AC-13, INV-04, behavior.spec.md §5.1).
 * present-and-non-empty-after-trim = true; absent/whitespace-only = false (EC-09).
 */

test("isHoneypotTripped: true when _hp is a non-empty string", () => {
  assert.equal(isHoneypotTripped({ hp: "spam-bot-filled-this-in" }), true);
});

test("isHoneypotTripped: false when _hp is absent (undefined)", () => {
  assert.equal(isHoneypotTripped({ hp: undefined }), false);
});

test("isHoneypotTripped: false when _hp is an empty string", () => {
  assert.equal(isHoneypotTripped({ hp: "" }), false);
});

test("isHoneypotTripped: EC-09/behavior.spec.md §7 — false when _hp is whitespace-only", () => {
  assert.equal(isHoneypotTripped({ hp: "   " }), false);
});

test("isHoneypotTripped: true when _hp has leading/trailing whitespace around real content", () => {
  assert.equal(isHoneypotTripped({ hp: "  x  " }), true);
});

test("isHoneypotTripped: false when _hp is null", () => {
  assert.equal(isHoneypotTripped({ hp: null }), false);
});
