import assert from "node:assert/strict";
import test from "node:test";

import { validateFieldDescriptors } from "../forms";
import type { FieldDescriptor } from "../types";

/**
 * @file Unit tests for `validateFieldDescriptors` (C-002, REQ-02, AC-03, INV-02).
 * Pure function, no I/O — closed vocabulary, 1-20 fields, label 1-200 chars, maxLength 1-5000
 * (forbidden for checkbox). See behavior.spec.md §4/§7 for the exact boundary matrix.
 */

function field(overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return { id: "name", label: "Name", type: "text", required: false, ...overrides };
}

test("validateFieldDescriptors: accepts a single valid text field", () => {
  const result = validateFieldDescriptors([field()]);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: accepts every vocabulary type (text/email/textarea/checkbox)", () => {
  const fields: FieldDescriptor[] = [
    field({ id: "a", type: "text" }),
    field({ id: "b", type: "email" }),
    field({ id: "c", type: "textarea" }),
    field({ id: "d", type: "checkbox" }),
  ];
  const result = validateFieldDescriptors(fields);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: rejects a field type outside the registered vocabulary (AC-03)", () => {
  const result = validateFieldDescriptors([field({ type: "date" as FieldDescriptor["type"] })]);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.fieldErrors.some((e) => e.field === "name" && e.reason.includes("type")));
  }
});

test("validateFieldDescriptors: rejects zero fields", () => {
  const result = validateFieldDescriptors([]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: accepts exactly 20 fields (behavior.spec.md §7 boundary)", () => {
  const fields = Array.from({ length: 20 }, (_, i) => field({ id: `f${i}`, label: `Field ${i}` }));
  const result = validateFieldDescriptors(fields);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: rejects 21 fields (behavior.spec.md §7 boundary)", () => {
  const fields = Array.from({ length: 21 }, (_, i) => field({ id: `f${i}`, label: `Field ${i}` }));
  const result = validateFieldDescriptors(fields);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: rejects an empty label", () => {
  const result = validateFieldDescriptors([field({ label: "" })]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: rejects a label over 200 chars", () => {
  const result = validateFieldDescriptors([field({ label: "x".repeat(201) })]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: accepts a label at exactly 200 chars", () => {
  const result = validateFieldDescriptors([field({ label: "x".repeat(200) })]);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: accepts maxLength within 1..5000 for a text field", () => {
  const result = validateFieldDescriptors([field({ maxLength: 100 })]);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: rejects maxLength 0", () => {
  const result = validateFieldDescriptors([field({ maxLength: 0 })]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: rejects maxLength over 5000", () => {
  const result = validateFieldDescriptors([field({ maxLength: 5001 })]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: rejects maxLength set on a checkbox field (behavior.spec.md §4)", () => {
  const result = validateFieldDescriptors([field({ type: "checkbox", maxLength: 100 })]);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.fieldErrors.some((e) => e.reason.toLowerCase().includes("checkbox")));
  }
});

test("validateFieldDescriptors: accepts a checkbox field with no maxLength", () => {
  const result = validateFieldDescriptors([field({ type: "checkbox" })]);
  assert.equal(result.valid, true);
});

test("validateFieldDescriptors: rejects duplicate field ids", () => {
  const result = validateFieldDescriptors([field({ id: "dup" }), field({ id: "dup", label: "Dup 2" })]);
  assert.equal(result.valid, false);
});

test("validateFieldDescriptors: rejects a field id outside ^[a-z][a-z0-9_]*$", () => {
  const result = validateFieldDescriptors([field({ id: "1bad" })]);
  assert.equal(result.valid, false);
});
