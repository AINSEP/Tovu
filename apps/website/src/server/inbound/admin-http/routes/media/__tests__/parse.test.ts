import assert from "node:assert/strict";
import test from "node:test";

import { MediaValidationError } from "#src/features/media/index";
import { parseOptionalSlugField, parseOptionalStringField, parseOptionalTitleField } from "../parse.js";

/**
 * @file Direct tests for `parse.ts`'s three field parsers. `upload.test.ts`/`update.test.ts` reach
 * the `alt`/`caption`/`credit` and `title: null` branches over HTTP; the `slug` null/wrong-type
 * rejections and `title`'s wrong-type rejection had no test at all.
 */

function rejectsWith(fn: () => unknown, message: string): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof MediaValidationError, `expected MediaValidationError, got ${String(err)}`);
    assert.equal(err.message, message);
    return true;
  });
}

test("parseOptionalStringField: undefined stays omitted, null clears to '', a string passes through untouched", () => {
  assert.equal(parseOptionalStringField(undefined, "alt"), undefined);
  assert.equal(parseOptionalStringField(null, "alt"), "");
  assert.equal(parseOptionalStringField("  A cabin  ", "alt"), "  A cabin  ");
  assert.equal(parseOptionalStringField("", "alt"), "");
});

test("parseOptionalStringField: a non-string is rejected naming the field and its real shape (array, not object)", () => {
  rejectsWith(() => parseOptionalStringField(42, "credit"), "media.credit must be a string or null, got number");
  rejectsWith(() => parseOptionalStringField(["a"], "credit"), "media.credit must be a string or null, got array");
  rejectsWith(() => parseOptionalStringField({ a: 1 }, "credit"), "media.credit must be a string or null, got object");
});

test("parseOptionalTitleField: undefined stays omitted and a string passes through; null and non-strings are rejected", () => {
  assert.equal(parseOptionalTitleField(undefined), undefined);
  assert.equal(parseOptionalTitleField("Hero"), "Hero");
  rejectsWith(() => parseOptionalTitleField(null), "media.title cannot be cleared to null; title is required and cannot be empty");
  rejectsWith(() => parseOptionalTitleField(7), "media.title must be a string, got number");
  rejectsWith(() => parseOptionalTitleField(["Hero"]), "media.title must be a string, got array");
});

test("parseOptionalSlugField: undefined stays omitted and a string passes through unnormalized; null and non-strings are rejected", () => {
  assert.equal(parseOptionalSlugField(undefined), undefined);
  assert.equal(parseOptionalSlugField("Woodnest-Cabin"), "Woodnest-Cabin", "normalization belongs to the service, not this parser");
  rejectsWith(() => parseOptionalSlugField(null), "media.slug cannot be cleared to null; slug is required and cannot be empty");
  rejectsWith(() => parseOptionalSlugField(false), "media.slug must be a string, got boolean");
  rejectsWith(() => parseOptionalSlugField(["a"]), "media.slug must be a string, got array");
});
