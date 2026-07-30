import assert from "node:assert/strict";
import test from "node:test";

import { countWords, WORD_COUNT_MANIFEST } from "../../index";

/**
 * @file `word-count` built-in — SPEC-005 REQ-09, AC-01, RT-005's pinned tokenization algorithm.
 *
 * TDD-certified against the stub in `../../index.ts`; currently RED — `countWords` throws "not
 * implemented". These assertions describe the contract the Programmer stage must satisfy.
 */

function textNode(text: string) {
  return { type: "text", text };
}

function paragraph(...children: unknown[]) {
  return { type: "paragraph", content: children };
}

test("RT-005/AC-01: a 5-word single-paragraph body counts exactly 5", () => {
  const bodyJson = { type: "doc", content: [paragraph(textNode("the quick brown fox jumps"))] };
  assert.equal(countWords(bodyJson), 5);
});

test("RT-005: text nodes are concatenated depth-first ACROSS multiple paragraphs with a single space, then re-tokenized", () => {
  const bodyJson = {
    type: "doc",
    content: [paragraph(textNode("hello world")), paragraph(textNode("goodbye"), textNode("moon"))],
  };
  // "hello world" + " " + "goodbye" + "moon" (two text nodes in one paragraph, no separator
  // between them per RT-005's literal wording — "concatenating all text-node string values...
  // with single spaces" describes the join between EVERY collected text-node value, not just
  // between paragraphs) → "hello world goodbye moon" → 4 tokens.
  assert.equal(countWords(bodyJson), 4);
});

test("RT-005: an empty document (no text nodes) counts 0", () => {
  assert.equal(countWords({ type: "doc", content: [] }), 0);
});

test("RT-005: consecutive/irregular whitespace inside a single text node collapses to the correct token count (split on /\\s+/)", () => {
  const bodyJson = { type: "doc", content: [paragraph(textNode("one   two\tthree\nfour"))] };
  assert.equal(countWords(bodyJson), 4);
});

test("RT-005: a text node containing only whitespace contributes zero tokens, not an empty-string token", () => {
  const bodyJson = { type: "doc", content: [paragraph(textNode("   "), textNode("real word"))] };
  assert.equal(countWords(bodyJson), 2);
});

test("RT-005: non-text nodes (e.g. an image node with no `text` property) are ignored, not counted or errored on", () => {
  const bodyJson = {
    type: "doc",
    content: [{ type: "image", attrs: { src: "x.png" } }, paragraph(textNode("caption text"))],
  };
  assert.equal(countWords(bodyJson), 2);
});

test("RT-005: nested content (a blockquote containing a paragraph containing text) is walked depth-first regardless of nesting depth", () => {
  const bodyJson = {
    type: "doc",
    content: [{ type: "blockquote", content: [paragraph(textNode("deeply nested five word text"))] }],
  };
  assert.equal(countWords(bodyJson), 5);
});

test("REQ-09: WORD_COUNT_MANIFEST declares exactly the three v1 capabilities, one hook attachment, one integer field, and tier-3 (1.1.1)", () => {
  assert.deepEqual([...WORD_COUNT_MANIFEST.capabilities].sort(), ["content.extend", "content.read", "hooks.attach"]);
  assert.deepEqual([...WORD_COUNT_MANIFEST.hooks], ["content.entry.beforeSave"]);
  assert.equal(WORD_COUNT_MANIFEST.fields.length, 1);
  assert.equal(WORD_COUNT_MANIFEST.fields[0].path, "ext.word-count.count");
  assert.equal(WORD_COUNT_MANIFEST.fields[0].type, "integer");
  assert.equal(WORD_COUNT_MANIFEST.fields[0].queryable, false);
  assert.equal(WORD_COUNT_MANIFEST.tier, "tier-3");
});
