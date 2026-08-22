import assert from "node:assert/strict";
import test from "node:test";

import { indexedDescriptionFor, stripSearchKeywords, TOOL_SEARCH_KEYWORDS } from "../tool-search-keywords.js";

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

/**
 * `capability_search`/`capability_get` — added 2026-08-22 after `caseb` measured a real operator turn
 * ("use whatever design guidance this workspace has available") never calling `capability_search`
 * across 9 tool-catalog searches (`ADS-memory/reports/2026-08-22-case-b-discovery-measurement.md`).
 * These entries are deliberately CATEGORY words for what a capability card generically is — installed
 * guidance content — not domain words for what today's one installed plugin happens to cover.
 */
test("capability_search folds in category words for installed guidance content", () => {
  const indexed = indexedDescriptionFor(
    "capability_search",
    "Searches every discoverable capability this workspace has available beyond the ordinary tool catalog.",
  );
  for (const term of [/\bskill\b/, /\bplaybook\b/, /\bguide\b/, /\breference\b/, /\binstructions\b/]) {
    assert.match(indexed, term, `expected capability_search's indexed text to contain ${term}`);
  }
});

test("capability_get folds in the same category vocabulary as capability_search", () => {
  const indexed = indexedDescriptionFor("capability_get", "Reads one capability's full content by id.");
  for (const term of [/\bskill\b/, /\bguide\b/, /\breference\b/, /\binstructions\b/]) {
    assert.match(indexed, term, `expected capability_get's indexed text to contain ${term}`);
  }
});

/**
 * Regression guard for the anti-overfitting rule this file's own module doc states for
 * `capability_search`/`capability_get` specifically: today's only installed Agent Plugin happens to
 * be design-flavored, but a workspace with an SEO or copywriting plugin needs this same tool to rank
 * for THOSE operators' words instead. Hardcoding "design"/"brand"/"style"/"visual" here would score
 * well on the one query that got measured and be actively wrong for every other domain a future
 * plugin might cover — see this file's module doc and `tool-search-quality.eval.ts`'s overfitting
 * warning for the general form of this rule.
 */
test("capability_search/capability_get keywords never hardcode today's one installed plugin's domain", () => {
  for (const toolId of ["capability_search", "capability_get"]) {
    const keywords = TOOL_SEARCH_KEYWORDS[toolId] ?? "";
    for (const domainWord of [/\bdesign\b/, /\bbrand\b/, /\bstyle\b/, /\bvisual\b/, /\bux\b/, /\bui\b/]) {
      assert.doesNotMatch(keywords, domainWord, `capability_search/capability_get keywords must stay domain-neutral; found ${domainWord}`);
    }
  }
});
