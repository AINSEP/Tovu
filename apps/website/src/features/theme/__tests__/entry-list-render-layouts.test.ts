import assert from "node:assert/strict";
import test from "node:test";

import { ENTRY_LIST_DEFAULT_STYLE, renderEntryList, type EntryListItem, type EntryListRenderOptions } from "../entry-list-render.js";

/**
 * @file AW-7 Tier 1 (2026-10-04): the `accordion` and `carousel` collection-list layouts and the
 * opt-in FAQPage JSON-LD a zero-code Testimonials + FAQ plugin needs from core. The existing
 * cards/list/template contract lives in `entry-list-render.test.ts`.
 */

function faq(title: string, answer: unknown): EntryListItem {
  return { title, href: null, dateIso: "2026-10-01T00:00:00.000Z", dateLabel: "Oct 1, 2026", fields: [{ name: "answer", label: "Answer", kind: "text", value: answer }] };
}

function options(overrides: Partial<EntryListRenderOptions> = {}): EntryListRenderOptions {
  return { columns: 3, layout: "accordion", typeKey: "faq", ...overrides };
}

function jsonLd(html: string): unknown {
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  return match ? JSON.parse(match[1] as string) : undefined;
}

test("accordion: one <details> per entry, title as the summary, unlabeled field values as the body", () => {
  const html = renderEntryList([faq("Do you ship abroad?", "Yes, to 40 countries.")], options());
  assert.equal(
    html,
    '<div class="entry-list entry-list--faq entry-list--accordion" data-tovu-entry-list>' +
      '<details class="entry-accordion__item"><summary class="entry-accordion__question">Do you ship abroad?</summary>' +
      '<div class="entry-accordion__answer"><p class="entry-accordion__field entry-accordion__field--answer">Yes, to 40 countries.</p></div></details>' +
      "</div>"
  );
});

test("accordion: escapes every value and skips empty fields", () => {
  const item: EntryListItem = { ...faq("<b>Q</b>", "<script>x</script>"), fields: [{ name: "answer", label: "A", kind: "text", value: "<script>x</script>" }, { name: "note", label: "N", kind: "text", value: null }] };
  const html = renderEntryList([item], options()) as string;
  assert.ok(html.includes("&lt;b&gt;Q&lt;/b&gt;"));
  assert.ok(html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(!html.includes("entry-accordion__field--note"));
});

test("carousel: the card markup inside a horizontal, keyboard-scrollable track", () => {
  const html = renderEntryList([faq("Ada", "Great service")], options({ layout: "carousel", typeKey: "testimonial" }));
  assert.equal(
    html,
    '<div class="entry-list entry-list--testimonial entry-list--carousel" data-tovu-entry-list tabindex="0">' +
      '<article class="entry-card"><h3 class="entry-card__title">Ada</h3><dl class="entry-card__fields"><dt>Answer</dt><dd>Great service</dd></dl></article>' +
      "</div>"
  );
});

test("the default style ships zero-specificity rules for both new layouts", () => {
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list].entry-list--carousel)"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes("scroll-snap-type:x mandatory"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list].entry-list--accordion)"));
  assert.ok(ENTRY_LIST_DEFAULT_STYLE.includes(":where([data-tovu-entry-list] .entry-accordion__question)"));
});

test("faq-page structured data: one FAQPage block after the list, title = question, field values = answer", () => {
  const html = renderEntryList([faq("Q1", "A1"), faq("Q2", 42)], options({ structuredData: "faq-page" })) as string;
  assert.ok(html.startsWith('<div class="entry-list entry-list--faq entry-list--accordion"'));
  assert.deepEqual(jsonLd(html), {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Q1", acceptedAnswer: { "@type": "Answer", text: "A1" } },
      { "@type": "Question", name: "Q2", acceptedAnswer: { "@type": "Answer", text: "42" } },
    ],
  });
});

test("faq-page structured data: entries with no answer text are left out; none left means no block", () => {
  const html = renderEntryList([faq("Q1", ""), faq("Q2", "A2")], options({ structuredData: "faq-page" })) as string;
  assert.deepEqual((jsonLd(html) as { mainEntity: unknown[] }).mainEntity.length, 1);
  const none = renderEntryList([faq("Q1", null)], options({ structuredData: "faq-page" })) as string;
  assert.equal(jsonLd(none), undefined);
});

test("faq-page structured data cannot break out of its <script>", () => {
  const html = renderEntryList([faq("</script><script>alert(1)</script>", "a")], options({ structuredData: "faq-page" })) as string;
  assert.equal(html.match(/<\/script>/g)?.length, 1);
  assert.ok(html.includes("\\u003c/script>"));
});

test("faq-page structured data also follows an author template", () => {
  const html = renderEntryList([faq("Q1", "A1")], options({ template: "<p>{{title}}</p>", structuredData: "faq-page" })) as string;
  assert.ok(html.startsWith("<p>Q1</p>"));
  assert.equal((jsonLd(html) as { mainEntity: unknown[] }).mainEntity.length, 1);
});

test("boolean answers use the same Yes/No display as the visible list", () => {
  const item: EntryListItem = { ...faq("Open on Sundays?", true), fields: [{ name: "open", label: "Open", kind: "boolean", value: true }] };
  const html = renderEntryList([item], options({ structuredData: "faq-page" })) as string;
  assert.ok(html.includes(">Yes</p>"));
  assert.equal((jsonLd(html) as { mainEntity: Array<{ acceptedAnswer: { text: string } }> }).mainEntity[0]?.acceptedAnswer.text, "Yes");
});
