import assert from "node:assert/strict";
import test from "node:test";

import { extractPostPlainText, MAX_INDEXED_BODY_CHARS, toSearchTerms } from "../search.js";

/**
 * @file Hostile-shape and boundary tests for the search text extractors (Stryker lane L14:
 * `post/search.ts` 63.6 %; the `isNode` guard and the depth/budget stop were removable, AP3).
 * `bodyJson` comes from stored documents (and imports), so arrays, nulls, primitives and
 * pathological nesting must yield text safely, never throw or index garbage.
 */

const p = (...texts: string[]) => ({ type: "paragraph", content: texts.map((text) => ({ type: "text", text })) });

test("toSearchTerms: lowercases, NFC-normalises and keeps only letter/number runs", () => {
  assert.deepEqual(toSearchTerms("Hello, WORLD-42!"), ["hello", "world", "42"]);
  assert.deepEqual(toSearchTerms("Café ÉTÉ"), ["café", "été"]);
  assert.deepEqual(toSearchTerms("  -- ** "), []);
  assert.deepEqual(toSearchTerms(""), []);
});

test("extractPostPlainText: hostile root/child shapes contribute nothing and never throw", () => {
  for (const body of [null, undefined, 0, "text", true, [], [p("x")], { content: "x" }, { type: "text", text: 5 }]) {
    assert.equal(extractPostPlainText(body), "", JSON.stringify(body));
  }
  const doc = { type: "doc", content: [null, 7, "str", [p("hidden")], ["x"], p("kept"), { type: "text" }] };
  assert.equal(extractPostPlainText(doc), "kept");
});

test("extractPostPlainText: runs inside one block stay adjacent; blocks are separated by one space; unknown node types still contribute", () => {
  const doc = { type: "doc", content: [p("bold", " word"), { type: "plugin-block", content: [p("plugin text")] }, p("end")] };
  assert.equal(extractPostPlainText(doc), "bold word plugin text end");
});

test("extractPostPlainText: the text budget is exact at the cap", () => {
  const long = "a".repeat(MAX_INDEXED_BODY_CHARS + 10);
  assert.equal(extractPostPlainText({ type: "doc", content: [p(long), p("after")] }).length, MAX_INDEXED_BODY_CHARS);
  const exact = "b".repeat(MAX_INDEXED_BODY_CHARS);
  assert.equal(extractPostPlainText({ type: "doc", content: [p(exact)] }), exact);
});

test("extractPostPlainText: text nested deeper than the depth bound is not indexed (no unbounded recursion)", () => {
  let node: Record<string, unknown> = { type: "text", text: "deep" };
  for (let i = 0; i < 200; i++) node = { type: "wrap", content: [node] };
  assert.equal(extractPostPlainText(node), "");
  let shallow: Record<string, unknown> = { type: "text", text: "shallow" };
  for (let i = 0; i < 3; i++) shallow = { type: "wrap", content: [shallow] };
  assert.equal(extractPostPlainText(shallow), "shallow");
});

test("extractPostPlainText: depth bound is exactly 64 — text at depth 64 is indexed, at depth 65 it is not", () => {
  const wrapped = (levels: number) => {
    let node: Record<string, unknown> = { type: "text", text: `d${levels}` };
    for (let i = 0; i < levels; i++) node = { type: "wrap", content: [node] };
    return node;
  };
  assert.equal(extractPostPlainText(wrapped(64)), "d64");
  assert.equal(extractPostPlainText(wrapped(65)), "");
});
