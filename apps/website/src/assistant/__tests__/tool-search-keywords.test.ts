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

/**
 * `admin.capture_screenshot` (`frontend-control-capabilities.ts`) is reached only through
 * `search_tools`/`execute_delegated_tool`, same as every other tool in the catalog — see
 * `agent-daemon-server.ts`'s system overlay. A tool an operator would ask for in plain language
 * ("does this look right", "take a screenshot") but that ranks on its own description's vocabulary
 * alone is, per this module's own header, "functionally, a tool that does not exist." This pins the
 * keyword entry the same way `identity_user_create`'s "invite" case is pinned above.
 */
test("admin.capture_screenshot folds visual/screenshot vocabulary an operator would actually type", () => {
  const indexed = indexedDescriptionFor("admin.capture_screenshot", "Captures a picture of the admin screen.");
  assert.match(indexed, /\bscreenshot\b/, "the literal word an operator is most likely to type must be indexed");
  assert.match(indexed, /\blook\b|\blooks\b/, "'does this look right' phrasing must be indexed");
});

/**
 * `assistant_ask_choice` (`ask-choice-tool.ts`) is the tool the system overlay now names for
 * "ask the administrator a decision/confirmation/choice" — but a model searching for it plausibly
 * types the DECISION's vocabulary ("confirm", "approve"), not the tool's own noun phrase. Pinned
 * the same way `admin.capture_screenshot`'s "look"/"screenshot" case is pinned above: the model was
 * measured to reach for its own bare/guessed tool name before this file existed at all, and a tool
 * that only ranks on its own description is, per this module's header, "functionally, a tool that
 * does not exist."
 */
test("assistant_ask_choice folds decision/confirmation vocabulary an operator would actually type", () => {
  const indexed = indexedDescriptionFor("assistant_ask_choice", "Asks the administrator a real question through an interactive form.");
  assert.match(indexed, /\bconfirm\b/, "'confirm this action' phrasing must be indexed");
  assert.match(indexed, /\bchoice\b|\bchoices\b/, "'give the user a choice' phrasing must be indexed");
  assert.match(indexed, /\bapprove\b|\bapproval\b/, "'get approval first' phrasing must be indexed");
});

