import assert from "node:assert/strict";
import test from "node:test";

import { derivePostSlugBase, isAutomaticPostSlug, MAX_SLUG_LENGTH, DERIVED_SLUG_SUFFIX_ROOM, SLUG_FORMAT_PATTERN } from "../slug.js";

test("derivePostSlugBase leaves room for a collision suffix, trims a trailing dash, and falls back to untitled", () => {
  assert.equal(derivePostSlugBase({ title: "Hello World" }), "hello-world");
  const long = derivePostSlugBase({ title: "a".repeat(200) });
  assert.equal(long.length, MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM);
  assert.equal(derivePostSlugBase({ title: `${"b".repeat(MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM - 1)} tail` }), "b".repeat(MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM - 1));
  assert.equal(derivePostSlugBase({ title: "!!!" }), "untitled");
});

test("isAutomaticPostSlug recognises the derived slug, its numeric collision suffixes, and untitled placeholders", () => {
  assert.equal(isAutomaticPostSlug({ title: "Hello World", slug: "hello-world" }), true);
  assert.equal(isAutomaticPostSlug({ title: "Hello World", slug: "hello-world-2" }), true);
  assert.equal(isAutomaticPostSlug({ title: "Anything", slug: "untitled" }), true);
  assert.equal(isAutomaticPostSlug({ title: "Anything", slug: "untitled-7" }), true);
});

test("isAutomaticPostSlug treats an edited slug as manual, including a non-numeric suffix on the derived base", () => {
  assert.equal(isAutomaticPostSlug({ title: "Hello World", slug: "my-own-slug" }), false);
  assert.equal(isAutomaticPostSlug({ title: "Hello World", slug: "hello-world-draft" }), false);
  assert.equal(isAutomaticPostSlug({ title: "Hello World", slug: "hello-world-" }), false);
});

// Stryker lane L14 (slug.ts 68.6 %): the regex anchors, quantifiers and character classes below were
// mutable without a failing test. One table per regex (AP4).
test("SLUG_FORMAT_PATTERN: full-match lowercase/digit/hyphen only — leading, trailing and embedded junk refused", () => {
  const cases: Array<[string, boolean]> = [
    ["a", true], ["0", true], ["-", true], ["a-b-0", true], ["a".repeat(MAX_SLUG_LENGTH), true],
    ["", false], ["A", false], ["aB", false], ["a b", false], ["a_b", false], ["a.b", false],
    ["!a", false], ["a!", false], ["a\n", false], ["\na", false], [" a", false], ["a/b", false], ["é", false],
  ];
  for (const [slug, ok] of cases) assert.equal(SLUG_FORMAT_PATTERN.test(slug), ok, JSON.stringify(slug));
});

test("isAutomaticPostSlug: untitled placeholder regex is anchored and digit-only (each alternation, 0/1/many digits)", () => {
  const cases: Array<[string, boolean]> = [
    ["untitled", true], ["untitled-1", true], ["untitled-123", true],
    ["untitled-", false], ["untitled-x", false], ["untitled-1x", false], ["x-untitled", false], ["untitledx", false],
    ["Untitled", false], ["untitled-1\n", false], ["untitled--1", false],
  ];
  for (const [slug, ok] of cases) assert.equal(isAutomaticPostSlug({ title: "Some Title", slug }), ok, JSON.stringify(slug));
});

test("isAutomaticPostSlug: a derived-base collision suffix must be ALL digits and follow '<base>-' exactly", () => {
  const cases: Array<[string, boolean]> = [
    ["some-title-12", true], ["some-title-1a", false], ["some-title-a1", false], ["some-title-12\n", false],
    ["xsome-title-2", false], ["some-title2", false], ["some-titl-2", false], ["some-title--2", false],
  ];
  for (const [slug, ok] of cases) assert.equal(isAutomaticPostSlug({ title: "Some Title", slug }), ok, JSON.stringify(slug));
});

test("derivePostSlugBase strips EVERY trailing hyphen at the cut, and only trailing ones", () => {
  const room = MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM;
  assert.equal(derivePostSlugBase({ title: `${"c".repeat(room - 3)} ${"x".repeat(10)}` }), `${"c".repeat(room - 3)}-xx`);
  assert.equal(derivePostSlugBase({ title: `${"c".repeat(room - 1)} x` }), "c".repeat(room - 1));
  assert.equal(derivePostSlugBase({ title: "a b" }), "a-b");
  assert.equal(derivePostSlugBase({ title: "" }), "untitled");
});
