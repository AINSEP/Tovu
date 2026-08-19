import assert from "node:assert/strict";
import test from "node:test";

import { PostValidationError } from "../post.js";
import {
  extractPostPlainText,
  searchAdminPosts,
  toPostSearchDocument,
  toSearchTerms,
  DEFAULT_POST_SEARCH_LIMIT,
  MAX_INDEXED_BODY_CHARS,
  MAX_POST_SEARCH_LIMIT,
  type PostSearchPort,
  type PostSearchQuery,
} from "../search.js";

/**
 * @file Certification of the DOMAIN half of post search: the pure `bodyJson` -> text projection,
 * the query tokenizer, and `searchAdminPosts`' input rules.
 *
 * Split from `search-index.sqlite.test.ts` on purpose. Everything here is decidable without a
 * database, and the seam that makes that possible — a `PostSearchPort` the domain function talks to
 * rather than a SQL statement it builds — is the same seam that lets the two adapters share one
 * ranking implementation. Ranking, filtering and index sync are the adapter's contract and are
 * certified there, against a real FTS5 index.
 */

/** Records what `searchAdminPosts` actually hands the adapter — the thing under test in every
 * clamping/normalization case below. */
function recordingPort(): { port: PostSearchPort; calls: PostSearchQuery[] } {
  const calls: PostSearchQuery[] = [];
  return {
    calls,
    port: {
      async search(required) {
        calls.push(required);
        return [];
      },
    },
  };
}

const doc = (...blocks: unknown[]) => ({ type: "doc", content: blocks });
const para = (...texts: string[]) => ({ type: "paragraph", content: texts.map((text) => ({ type: "text", text })) });

// ---------------------------------------------------------------------------
// 1. extractPostPlainText — the projection the index actually stores
// ---------------------------------------------------------------------------

test("extractPostPlainText pulls the text out of a real TipTap document", () => {
  const body = doc(
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Pricing" }] },
    para("Plans start at ", "ten dollars", " a month."),
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [para("Includes support")] }],
    }
  );

  assert.equal(extractPostPlainText(body), "Pricing Plans start at ten dollars a month. Includes support");
});

test("extractPostPlainText keeps adjacent marked runs inside a paragraph fused, and separates blocks", () => {
  // "This is " + "bold" + " text." are three text nodes of ONE paragraph and must not gain spaces
  // between them; two paragraphs must not run their words together.
  const body = doc(para("This is ", "bold", " text."), para("Second paragraph."));
  assert.equal(extractPostPlainText(body), "This is bold text. Second paragraph.");
});

test("extractPostPlainText is vocabulary-blind — an unrecognized node type still contributes its text", () => {
  // The renderer's `default:` case would render this node's children with no formatting; search must
  // likewise not lose the words just because the node type is new (a plugin block, say).
  const body = doc({ type: "someFutureCallout", content: [para("important announcement")] });
  assert.equal(extractPostPlainText(body), "important announcement");
});

test("extractPostPlainText tolerates non-document input rather than throwing", () => {
  for (const value of [null, undefined, 42, "a string", [], {}, { type: "doc" }]) {
    assert.equal(extractPostPlainText(value), "", `${JSON.stringify(value) ?? "undefined"} must project to empty text`);
  }
});

test("extractPostPlainText ignores a text node whose 'text' is not a string", () => {
  assert.equal(extractPostPlainText(doc({ type: "paragraph", content: [{ type: "text", text: 12 }, { type: "text", text: "ok" }] })), "ok");
});

test("extractPostPlainText caps an unbounded document at MAX_INDEXED_BODY_CHARS", () => {
  const huge = doc(...Array.from({ length: 400 }, () => para("x".repeat(1000))));
  const text = extractPostPlainText(huge);

  assert.equal(text.length, MAX_INDEXED_BODY_CHARS, "the cap must be exact, not approximate");
});

test("extractPostPlainText stops at the depth cap instead of overflowing the stack", () => {
  // Deeper than MAX_BODY_DEPTH by a wide margin. The shallow text must survive; the deeply buried
  // text is simply not indexed, which is the documented degradation.
  let node: unknown = para("buried");
  for (let i = 0; i < 500; i += 1) node = { type: "blockquote", content: [node] };

  const text = extractPostPlainText(doc(para("shallow"), node));
  assert.match(text, /shallow/);
  assert.doesNotMatch(text, /buried/);
});

test("toPostSearchDocument carries id/title/slug through and projects only the body", () => {
  const document = toPostSearchDocument({ id: "p1", title: "Pricing", slug: "pricing", bodyJson: doc(para("Ten dollars.")) });
  assert.deepEqual(document, { postId: "p1", title: "Pricing", slug: "pricing", bodyText: "Ten dollars." });
});

// ---------------------------------------------------------------------------
// 2. toSearchTerms — the FTS5 injection boundary
// ---------------------------------------------------------------------------

test("toSearchTerms lowercases and splits on anything non-alphanumeric", () => {
  assert.deepEqual(toSearchTerms("Pricing & Plans, v2!"), ["pricing", "plans", "v2"]);
});

test("toSearchTerms strips every FTS5 query operator — no caller string can reach MATCH as syntax", () => {
  // Each of these means something to FTS5: a phrase, a prefix, a boolean, a proximity operator, a
  // column filter. All must come back as plain terms or nothing at all.
  assert.deepEqual(toSearchTerms('"exact phrase"'), ["exact", "phrase"]);
  assert.deepEqual(toSearchTerms("pric*"), ["pric"]);
  assert.deepEqual(toSearchTerms("a NEAR/3 b"), ["a", "near", "3", "b"]);
  assert.deepEqual(toSearchTerms("title:secret"), ["title", "secret"]);
  assert.deepEqual(toSearchTerms("^anchored (grouped) -negated"), ["anchored", "grouped", "negated"]);
});

test("toSearchTerms returns nothing for a query with no letter or digit", () => {
  assert.deepEqual(toSearchTerms("  !!! ??? --- "), []);
});

// ---------------------------------------------------------------------------
// 3. searchAdminPosts — validation, defaults, clamping, filter pass-through
// ---------------------------------------------------------------------------

test("searchAdminPosts hands the port tokenized terms and the default limit", async () => {
  const { port, calls } = recordingPort();
  await searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "Where is Pricing?" } });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { workspaceId: "ws-1", terms: ["where", "is", "pricing"], limit: DEFAULT_POST_SEARCH_LIMIT });
});

test("searchAdminPosts passes kind and status through only when the caller set them", async () => {
  const { port, calls } = recordingPort();

  await searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "x", kind: "page", status: "published" } });
  assert.equal(calls[0].kind, "page");
  assert.equal(calls[0].status, "published");

  await searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "x" } });
  assert.equal("kind" in calls[1], false, "an omitted filter must be absent, not undefined-valued");
  assert.equal("status" in calls[1], false);
});

test("searchAdminPosts clamps limit into [1, MAX_POST_SEARCH_LIMIT] rather than rejecting", async () => {
  const { port, calls } = recordingPort();

  for (const limit of [10_000, MAX_POST_SEARCH_LIMIT + 1, 0, -5, 3.9]) {
    await searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "x", limit } });
  }

  assert.deepEqual(
    calls.map((call) => call.limit),
    [MAX_POST_SEARCH_LIMIT, MAX_POST_SEARCH_LIMIT, 1, 1, 3],
  );
});

test("searchAdminPosts rejects a query with no searchable term", async () => {
  const { port, calls } = recordingPort();

  await assert.rejects(
    () => searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "??? !!!" } }),
    (error: unknown) => {
      assert.ok(error instanceof PostValidationError, "must be the shape rejection the tool layer decorates with a schema");
      assert.match((error as Error).message, /at least one letter or digit/);
      return true;
    },
  );
  assert.equal(calls.length, 0, "the port must not be called at all — fail before touching storage");
});

test("searchAdminPosts rejects a non-finite limit rather than clamping NaN to 1", async () => {
  const { port, calls } = recordingPort();

  for (const limit of [Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      () => searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "x", limit } }),
      PostValidationError,
    );
  }
  assert.equal(calls.length, 0);
});

test("searchAdminPosts returns the port's hits unchanged — no re-ranking, no re-filtering", async () => {
  const hits = [
    { id: "b", kind: "post" as const, title: "B", slug: "b", status: "draft" as const, updatedAt: "2026-01-02T00:00:00.000Z", snippet: "", score: 1 },
    { id: "a", kind: "page" as const, title: "A", slug: "a", status: "published" as const, updatedAt: "2026-01-01T00:00:00.000Z", snippet: "", score: 9 },
  ];
  const port: PostSearchPort = { async search() { return hits; } };

  const result = await searchAdminPosts({ deps: { search: port }, input: { workspaceId: "ws-1", query: "x" } });

  // Deliberately asserting the ADAPTER's order survives, including this deliberately
  // out-of-score-order pair: relevance ordering is the index's job, and a second sort here would be
  // a silent disagreement with whatever BM25 decided.
  assert.deepEqual(result.hits, hits);
});
