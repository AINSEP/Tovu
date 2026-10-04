import assert from "node:assert/strict";
import test from "node:test";

import { copyBodyJsonWithFreshEmbedPlacements } from "../duplicate-embeds.js";

/**
 * @file Certifies `content_post_duplicate`'s widgetEmbed handling in isolation — see
 * `duplicate-embeds.ts`'s own header for the full design rationale (why `widgetEntryId` is kept and
 * `placementId` is regenerated, not the other way around).
 */

test("a document with no widgetEmbed nodes round-trips as a structural clone", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => "unused");
  assert.deepEqual(copy, doc);
  assert.notEqual(copy, doc, "must be a new object, not the same reference");
});

test("a widgetEmbed node's placementId is replaced with a freshly minted one", () => {
  const doc = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "source-placement-1", widgetEntryId: "widget-abc" } }],
  };
  let mintCount = 0;
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => `fresh-${++mintCount}`);

  const embed = (copy.content as Array<Record<string, unknown>>)[0]!;
  const attrs = embed.attrs as Record<string, unknown>;
  assert.equal(attrs.placementId, "fresh-1", "placementId must be replaced with a newly minted id");
  assert.notEqual(attrs.placementId, "source-placement-1", "the source page's placementId must never appear on the copy");
});

test("a widgetEmbed node's widgetEntryId is carried over UNCHANGED — reusing the same widget instance is intended", () => {
  const doc = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "p1", widgetEntryId: "widget-abc" } }],
  };
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => "fresh-1");

  const embed = (copy.content as Array<Record<string, unknown>>)[0]!;
  const attrs = embed.attrs as Record<string, unknown>;
  assert.equal(attrs.widgetEntryId, "widget-abc", "the live widget reference must be preserved — this is a supported shared reference, not a bug");
});

test("multiple embeds each get their OWN distinct fresh placementId, in document order", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "widgetEmbed", attrs: { placementId: "p1", widgetEntryId: "widget-a" } },
      { type: "paragraph", content: [{ type: "text", text: "between" }] },
      { type: "widgetEmbed", attrs: { placementId: "p2", widgetEntryId: "widget-b" } },
    ],
  };
  const minted: string[] = [];
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => {
    const id = `fresh-${minted.length + 1}`;
    minted.push(id);
    return id;
  });

  const content = copy.content as Array<Record<string, unknown>>;
  assert.equal((content[0]!.attrs as Record<string, unknown>).placementId, "fresh-1");
  assert.equal((content[2]!.attrs as Record<string, unknown>).placementId, "fresh-2");
  assert.notEqual(minted[0], minted[1], "each embed must mint its own distinct id, not share one");
});

test("a widgetEmbed nested inside a blockquote is still found and regenerated (recursion into content)", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [{ type: "widgetEmbed", attrs: { placementId: "nested-source", widgetEntryId: "widget-xyz" } }],
      },
    ],
  };
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => "fresh-nested");

  const blockquote = (copy.content as Array<Record<string, unknown>>)[0]!;
  const nestedEmbed = (blockquote.content as Array<Record<string, unknown>>)[0]!;
  assert.equal((nestedEmbed.attrs as Record<string, unknown>).placementId, "fresh-nested");
});

test("a malformed widgetEmbed node (non-string placementId, or missing attrs) is left completely untouched, not crashed on", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "widgetEmbed", attrs: { placementId: 42, widgetEntryId: "widget-a" } },
      { type: "widgetEmbed" },
    ],
  };
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => "should-not-be-called");
  assert.deepEqual(copy, doc);
});

test("a 5000-deep document is copied with fresh placementIds minted in document order instead of overflowing the call stack", () => {
  const depth = 5000;
  let deep: Record<string, unknown> = { type: "widgetEmbed", attrs: { placementId: "old-deep", widgetEntryId: "w-deep" } };
  for (let i = 0; i < depth; i++) deep = { type: "blockquote", content: [deep] };
  const doc = {
    type: "doc",
    content: [
      { type: "widgetEmbed", attrs: { placementId: "old-first", widgetEntryId: "w-first" } },
      deep,
      { type: "widgetEmbed", attrs: { placementId: "old-last", widgetEntryId: "w-last" } },
    ],
  };
  let minted = 0;

  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => `new-${++minted}`) as { content: Array<Record<string, unknown>> };

  assert.deepEqual(copy.content[0], { type: "widgetEmbed", attrs: { placementId: "new-1", widgetEntryId: "w-first" } });
  assert.deepEqual(copy.content[2], { type: "widgetEmbed", attrs: { placementId: "new-3", widgetEntryId: "w-last" } });
  let node = copy.content[1];
  for (let i = 0; i < depth; i++) {
    assert.equal(node.type, "blockquote");
    node = (node.content as Array<Record<string, unknown>>)[0];
  }
  assert.deepEqual(node, { type: "widgetEmbed", attrs: { placementId: "new-2", widgetEntryId: "w-deep" } });
  assert.equal(minted, 3);
  assert.equal((doc.content[0].attrs as { placementId: string }).placementId, "old-first", "the source document must not be mutated");
});

test("the copied document isolates nested text, marks and attributes from the source", () => {
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "original", marks: [{ type: "link", attrs: { href: "/original" } }] }] }, { type: "widgetEmbed", attrs: { placementId: "source", widgetEntryId: "w", metadata: { label: "original" } } }] };
  const original = structuredClone(doc);
  const copy = copyBodyJsonWithFreshEmbedPlacements(doc, () => "fresh") as typeof doc;
  copy.content[0].attrs!.textAlign = "right";
  copy.content[0].content![0].text = "changed";
  copy.content[0].content![0].marks[0].attrs.href = "/changed";
  copy.content[1].attrs!.metadata!.label = "changed";
  assert.deepEqual(doc, original);
});
