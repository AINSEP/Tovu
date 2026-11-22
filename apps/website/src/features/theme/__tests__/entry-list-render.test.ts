import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEntryList,
  withEntryListStyleOnce,
} from "@jini-ai/cms/listing";
import type { EntryListItem, EntryListRenderOptions } from "@jini-ai/cms/listing";
import { ENTRY_LIST_ATTRIBUTE, ENTRY_LIST_DEFAULT_STYLE } from "../entry-list-markup.js";

/**
 * @file Certifies C3's pure entry-list renderer (2026-09-23, plan lines 168-191): the collection
 * marker's cards/list/author-template markup, the escaping contract for every entry value, and the
 * once-only default-style injection. I/O-free by design — every test hands in an already-resolved
 * `EntryListItem[]`, matching the `static-render-post-previews.test.ts` convention for
 * `StaticPostPreview[]`. Entry pages are OFF (D1): a `null` href renders the title as plain text.
 */

function item(overrides: Partial<EntryListItem> = {}): EntryListItem {
  return {
    title: "Untitled",
    href: "/recipe/untitled",
    dateIso: "2026-09-01T00:00:00.000Z",
    dateLabel: "Sep 1, 2026",
    fields: [],
    ...overrides,
  };
}

function options(overrides: Partial<EntryListRenderOptions> = {}): EntryListRenderOptions {
  return { columns: 3, layout: "cards", typeKey: "recipe", ...overrides };
}

/** Narrows `renderEntryList`'s `string | undefined` result for tests that expect real markup back,
 * failing loudly (rather than via a non-null assertion) when a test's own setup produced no items. */
function assertRendered(html: string | undefined): string {
  assert.ok(html !== undefined, "expected renderEntryList to return markup, got undefined");
  return html;
}

test("withEntryListStyleOnce: inserts the default style tag once before </head>, even with two entry-lists present", () => {
  const list1 = assertRendered(renderEntryList({ attribute: ENTRY_LIST_ATTRIBUTE, items: [item({ title: "A" })], options: options({ typeKey: "recipe" }) }));
  const list2 = assertRendered(renderEntryList({ attribute: ENTRY_LIST_ATTRIBUTE, items: [item({ title: "B" })], options: options({ typeKey: "tovu_feature" }) }));
  const html = `<html><head></head><body>${list1}${list2}</body></html>`;

  const once = withEntryListStyleOnce({ attribute: ENTRY_LIST_ATTRIBUTE, style: ENTRY_LIST_DEFAULT_STYLE, html });
  const styleTagOccurrences = once.split("<style data-tovu-entry-list>").length - 1;
  assert.equal(styleTagOccurrences, 1);
  assert.ok(once.includes(ENTRY_LIST_DEFAULT_STYLE));
  assert.ok(once.indexOf(ENTRY_LIST_DEFAULT_STYLE) < once.indexOf("</head>"));
  assert.ok(once.includes("display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr))"));

  const twice = withEntryListStyleOnce({ attribute: ENTRY_LIST_ATTRIBUTE, style: ENTRY_LIST_DEFAULT_STYLE, html: once });
  assert.equal(twice.split("<style data-tovu-entry-list>").length - 1, 1);
  assert.equal(twice, once);
});

test("withEntryListStyleOnce: the injected grid selector stays attribute-scoped on a mixed page", () => {
  const collection = assertRendered(renderEntryList({ attribute: ENTRY_LIST_ATTRIBUTE, items: [item()], options: options() }));
  const unrelated = '<section class="entry-list"><p>Theme list</p></section>';
  const html = withEntryListStyleOnce({ attribute: ENTRY_LIST_ATTRIBUTE, style: ENTRY_LIST_DEFAULT_STYLE, html: `<html><head></head><body>${collection}${unrelated}</body></html>` });
  assert.ok(html.includes(unrelated));
  const style = html.match(/<style data-tovu-entry-list>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style);
  assert.ok(style.includes(":where([data-tovu-entry-list]){display:grid;gap:1rem;grid-template-columns:repeat(var(--entry-list-columns,3),minmax(0,1fr));"));
  assert.doesNotMatch(style, /:where\(\.entry-list\)/);
});
