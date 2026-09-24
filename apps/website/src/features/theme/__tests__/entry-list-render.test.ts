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

test("renderEntryList: cards layout wraps items in an entry-card inside the columned grid container, marked with data-tovu-entry-list (review fix 3a's style-scoping hook)", () => {
  const html = assertRendered(renderEntryList([item({ title: "A" })], options({ columns: 4 })));
  assert.ok(html.startsWith('<div class="entry-list entry-list--recipe" data-tovu-entry-list style="--entry-list-columns:4">'));
  assert.ok(html.includes('<article class="entry-card">'));
});

test("renderEntryList: list layout wraps items in an entry-list__item inside a ul, no columns style, marked with data-tovu-entry-list", () => {
  const html = assertRendered(renderEntryList([item({ title: "A" })], options({ layout: "list" })));
  assert.ok(html.startsWith('<ul class="entry-list entry-list--recipe entry-list--list" data-tovu-entry-list>'));
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

test("withEntryListStyleOnce: inserts the default style tag once before </head>, even with two entry-lists present", () => {
  const list1 = assertRendered(renderEntryList([item({ title: "A" })], options({ typeKey: "recipe" })));
  const list2 = assertRendered(renderEntryList([item({ title: "B" })], options({ typeKey: "tovu_feature" })));
  const html = `<html><head></head><body>${list1}${list2}</body></html>`;

  const once = withEntryListStyleOnce(html);
  const styleTagOccurrences = once.split("<style data-tovu-entry-list>").length - 1;
  assert.equal(styleTagOccurrences, 1);
  assert.ok(once.indexOf(ENTRY_LIST_DEFAULT_STYLE) < once.indexOf("<body>"));

  const twice = withEntryListStyleOnce(once);
  assert.equal(twice.split("<style data-tovu-entry-list>").length - 1, 1);
});

test("withEntryListStyleOnce: leaves html untouched when there is no [data-tovu-entry-list] wrapper", () => {
  const html = "<html><head></head><body>no lists here</body></html>";
  assert.equal(withEntryListStyleOnce(html), html);
});

// ---------------------------------------------------------------------------
// Review fix 3a (2026-09-23): the style must be scoped to THIS module's own wrapper attribute,
// never a bare `.entry-list` class — a theme's unrelated `entry-list`-classed markup (declarative
// tier's own post/product index, `render.ts`'s `entryList`/`productEntryList`) must never trigger
// the collection card grid CSS just because it shares that one class name.
// ---------------------------------------------------------------------------

test("withEntryListStyleOnce: a theme's own unrelated .entry-list markup (no data-tovu-entry-list attribute) never triggers the style — the exact trap this fix closes", () => {
  const html =
    '<html><head></head><body><section class="entry-list entry-list--index"><div class="wrap">' +
    "<ol class=\"entries\"><li class=\"entry\">real post, not a collection card</li></ol></div></section></body></html>";
  assert.equal(withEntryListStyleOnce(html), html, "a bare .entry-list class must never inject the collection card style");
});

// ---------------------------------------------------------------------------
// Template placeholder contexts (2026-09-23 review): every attribute context, not only
// double-quoted href/src, must keep an entry value from becoming script or a new attribute.
// ---------------------------------------------------------------------------

function linkItem(link: string): EntryListItem {
  return item({ fields: [{ name: "link", label: "Link", kind: "text", value: link }] });
}

function renderTemplate(template: string, entry: EntryListItem): string {
  return assertRendered(renderEntryList([entry], options({ template })));
}

test("renderEntryList template mode: a javascript: value in a SINGLE-quoted href is neutralized", () => {
  assert.equal(renderTemplate("<a href='{{fields.link}}'>go</a>", linkItem("javascript:alert(1)")), "<a href='#'>go</a>");
});

test("renderEntryList template mode: a javascript: value in an UNQUOTED href is neutralized", () => {
  assert.equal(renderTemplate("<a href={{fields.link}}>go</a>", linkItem("javascript:alert(1)")), "<a href=#>go</a>");
});

test("renderEntryList template mode: an unquoted attribute value cannot break out into a new attribute", () => {
  const viaUrl = renderTemplate("<a href={{fields.link}}>go</a>", linkItem("https://x.test onmouseover=alert(1)"));
  const viaTitle = renderTemplate("<a title={{title}}>go</a>", item({ title: "x onmouseover=alert(1)" }));
  for (const html of [viaUrl, viaTitle]) {
    assert.ok(!/\sonmouseover\s*=/i.test(html), `no event-handler attribute may appear: ${html}`);
  }
  assert.equal(viaTitle, "<a title=x&#32;onmouseover&#61;alert(1)>go</a>");
});

test("renderEntryList template mode: other URL attributes (action, formaction, poster) get the same scheme check", () => {
  const entry = linkItem("javascript:alert(1)");
  assert.equal(renderTemplate('<form action="{{fields.link}}"></form>', entry), '<form action="#"></form>');
  assert.equal(renderTemplate('<button formaction="{{fields.link}}">b</button>', entry), '<button formaction="#">b</button>');
  assert.equal(renderTemplate('<video poster="{{fields.link}}"></video>', entry), '<video poster="#"></video>');
});

test("renderEntryList template mode: placeholders inside on* handlers and srcdoc are dropped, not escaped", () => {
  const entry = item({ title: "');alert(1);('" });
  assert.equal(renderTemplate(`<button onclick="go('{{title}}')">b</button>`, entry), `<button onclick="go('')">b</button>`);
  const script = item({ title: "<script>alert(1)</script>" });
  assert.equal(renderTemplate('<iframe srcdoc="{{title}}"></iframe>', script), '<iframe srcdoc=""></iframe>');
});

test("renderEntryList template mode: a URL composed from an author prefix plus a placeholder keeps working", () => {
  const entry = item({ fields: [{ name: "id", label: "Id", kind: "text", value: "a b&c" }] });
  assert.equal(renderTemplate('<a href="https://x.test/{{fields.id}}">go</a>', entry), '<a href="https://x.test/a b&amp;c">go</a>');
});

test("renderEntryList template mode: a substituted value is never re-expanded as a placeholder", () => {
  const entry = item({ title: "T", href: "/r/{{title}}" });
  assert.equal(renderTemplate('<a href="{{url}}">{{url}}</a>', entry), '<a href="/r/{{title}}">/r/{{title}}</a>');
});

test("renderEntryList template mode: author-literal attribute values without placeholders are left exactly as written", () => {
  const entry = item();
  assert.equal(renderTemplate('<a href="docs/x?a=1&amp;b=2" onclick="track()">{{title}}</a>', entry), '<a href="docs/x?a=1&amp;b=2" onclick="track()">Untitled</a>');
});
