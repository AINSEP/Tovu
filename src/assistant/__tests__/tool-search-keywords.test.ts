import assert from "node:assert/strict";
import test from "node:test";

import { indexedDescriptionFor, stripSearchKeywords } from "../tool-search-keywords.js";

/**
 * @file This module's own fold/strip contract, tested directly. Previously only exercised
 * indirectly through `tool-catalog-query.test.ts`, which always forwards a real boolean for
 * `includeDoc2query` (never omits it), so `indexedDescriptionFor`'s own `?? true` default, and the
 * no-keywords/no-doc2query "nothing to fold" path, were never reached.
 */

const KEYWORD_MARKER = " — also known as: ";

test("folds both keywords and doc2query questions in by default", () => {
  const indexed = indexedDescriptionFor("identity_user_create", "Creates a new human operator user.");

  assert.ok(indexed.startsWith(`Creates a new human operator user.${KEYWORD_MARKER}`));
  assert.match(indexed, /\binvite\b/, "TOOL_SEARCH_KEYWORDS vocabulary must be folded in");
  assert.notEqual(indexed, "Creates a new human operator user.", "doc2query questions must add text beyond the keywords alone");
});

test("includeDoc2query: false folds keywords only, omitting the doc2query questions", () => {
  const withQuestions = indexedDescriptionFor("identity_user_create", "Creates a new human operator user.");
  const withoutQuestions = indexedDescriptionFor("identity_user_create", "Creates a new human operator user.", { includeDoc2query: false });

  assert.match(withoutQuestions, /\binvite\b/, "the operator-noun keywords still fold in");
  assert.notEqual(withoutQuestions, withQuestions, "excluding doc2query must shorten the folded tail");
  assert.ok(withoutQuestions.length < withQuestions.length);
});

test("a tool id with neither keywords nor a doc2query entry is returned unchanged, with no marker appended", () => {
  const indexed = indexedDescriptionFor("not-a-real-tool-id", "Some description.");
  assert.equal(indexed, "Some description.");
  assert.doesNotMatch(indexed, /also known as:/);
});

test("an empty description with nothing to fold returns the empty string, not the marker alone", () => {
  assert.equal(indexedDescriptionFor("not-a-real-tool-id", ""), "");
});

test("an empty description WITH something to fold returns just the tail, with no leading marker", () => {
  const indexed = indexedDescriptionFor("identity_user_create", "");
  assert.equal(indexed.startsWith(KEYWORD_MARKER), false, "no description means no marker prefix, just the vocabulary itself");
  assert.match(indexed, /\binvite\b/);
});

test("stripSearchKeywords recovers the exact authored description from a folded string", () => {
  const original = "Creates a new human operator user.";
  const indexed = indexedDescriptionFor("identity_user_create", original);
  assert.equal(stripSearchKeywords(indexed), original);
});

test("stripSearchKeywords returns text with no marker unchanged — most tools have no keywords entry at all", () => {
  assert.equal(stripSearchKeywords("Plain description, never folded."), "Plain description, never folded.");
});
