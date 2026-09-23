import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEntryList,
  withEntryListStyleOnce,
  ENTRY_LIST_DEFAULT_STYLE,
} from "../entry-list-render.js";
import type { EntryListItem, EntryListRenderOptions } from "../entry-list-render.js";

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

test("renderEntryList: empty items gives undefined", () => {
  assert.equal(renderEntryList([], options()), undefined);
});

test("renderEntryList: title and field values are HTML-escaped in card markup", () => {
  const html = assertRendered(
    renderEntryList(
      [
        item({
          title: "<script>alert(1)</script>",
          fields: [{ name: "summary", label: "Summary", kind: "text", value: '"quoted" & <b>bold</b>' }],
        }),
      ],
      options(),
    ),
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&quot;quoted&quot; &amp; &lt;b&gt;bold&lt;/b&gt;"));
});

test("renderEntryList: href null renders the title as plain text with no <a>", () => {
  const html = assertRendered(renderEntryList([item({ title: "No Link", href: null })], options()));
  assert.ok(!html.includes("<a "));
  assert.ok(html.includes('<h3 class="entry-card__title">No Link</h3>'));
});

test("renderEntryList: a non-null href links the title", () => {
  const html = assertRendered(renderEntryList([item({ title: "Linked", href: "/recipe/linked" })], options()));
  assert.ok(html.includes('<h3 class="entry-card__title"><a href="/recipe/linked">Linked</a></h3>'));
});

test("renderEntryList: boolean field values render as Yes/No", () => {
  const html = assertRendered(
    renderEntryList(
      [
        item({
          fields: [
            { name: "vegetarian", label: "Vegetarian", kind: "boolean", value: true },
            { name: "spicy", label: "Spicy", kind: "boolean", value: false },
          ],
        }),
      ],
      options(),
    ),
  );
  assert.ok(html.includes("<dt>Vegetarian</dt><dd>Yes</dd>"));
  assert.ok(html.includes("<dt>Spicy</dt><dd>No</dd>"));
});

test("renderEntryList: cards layout wraps items in an entry-card inside the columned grid container", () => {
  const html = assertRendered(renderEntryList([item({ title: "A" })], options({ columns: 4 })));
  assert.ok(html.startsWith('<div class="entry-list entry-list--recipe" style="--entry-list-columns:4">'));
  assert.ok(html.includes('<article class="entry-card">'));
});

test("renderEntryList: list layout wraps items in an entry-list__item inside a ul, no columns style", () => {
  const html = assertRendered(renderEntryList([item({ title: "A" })], options({ layout: "list" })));
  assert.ok(html.startsWith('<ul class="entry-list entry-list--recipe entry-list--list">'));
  assert.ok(html.includes('<li class="entry-list__item">'));
  assert.ok(!html.includes("--entry-list-columns"));
});

test("renderEntryList template mode: repeats the template once per item, no card markup added", () => {
  const html = renderEntryList(
    [item({ title: "First" }), item({ title: "Second" })],
    options({ template: "<p>{{title}}</p>" }),
  );
  assert.equal(html, "<p>First</p><p>Second</p>");
});

test("renderEntryList template mode: title/url/date/fields placeholders all resolve and escape", () => {
  const html = renderEntryList(
    [
      item({
        title: "Tea & Cake",
        href: "/recipe/tea",
        dateLabel: "Sep 2, 2026",
        fields: [{ name: "serves", label: "Serves", kind: "text", value: 4 }],
      }),
    ],
    options({ template: '<a href="{{url}}">{{title}}</a><span>{{date}}</span><span>{{fields.serves}}</span>' }),
  );
  assert.equal(html, '<a href="/recipe/tea">Tea &amp; Cake</a><span>Sep 2, 2026</span><span>4</span>');
});

test("renderEntryList template mode: a javascript: field value inside href= is neutralized via safeHref", () => {
  const html = renderEntryList(
    [item({ fields: [{ name: "link", label: "Link", kind: "text", value: "javascript:alert(1)" }] })],
    options({ template: '<a href="{{fields.link}}">go</a>' }),
  );
  assert.equal(html, '<a href="#">go</a>');
});

test("withEntryListStyleOnce: inserts the default style once before </head>, even with two entry-lists present", () => {
  const list1 = assertRendered(renderEntryList([item({ title: "A" })], options({ typeKey: "recipe" })));
  const list2 = assertRendered(renderEntryList([item({ title: "B" })], options({ typeKey: "tovu_feature" })));
  const html = `<html><head></head><body>${list1}${list2}</body></html>`;

  const once = withEntryListStyleOnce(html);
  const occurrences = once.split("data-tovu-entry-list").length - 1;
  assert.equal(occurrences, 1);
  assert.ok(once.indexOf(ENTRY_LIST_DEFAULT_STYLE) < once.indexOf("<body>"));

  const twice = withEntryListStyleOnce(once);
  assert.equal(twice.split("data-tovu-entry-list").length - 1, 1);
});

test("withEntryListStyleOnce: leaves html untouched when there is no entry-list", () => {
  const html = "<html><head></head><body>no lists here</body></html>";
  assert.equal(withEntryListStyleOnce(html), html);
});
