import assert from "node:assert/strict";
import test from "node:test";

import { scanHtmlEmbeds } from "#src/widgets/html-embeds";
import { extractHtmlEntryRefs } from "../../extractor";

/**
 * @file SPEC-047 Slice 3 (generalized 2026-08-07) — keeps `core/entry-refs/extractor.ts`'s
 * `extractHtmlEntryRefs` and `widgets/html-embeds.ts`'s `scanHtmlEmbeds` honest against each other.
 *
 * The two functions are DELIBERATELY separate implementations of the same `data-embed-type` pattern
 * (see `extractHtmlEntryRefs`'s own doc for why: the same "no cross-import between `core/` and
 * `widgets/`" convention `collectWidgetEmbedRefs` already establishes for the TipTap case). That
 * tradeoff is only safe if the two scanners keep agreeing on what counts as a reference — this suite
 * is the guard, run against representative fixtures. It does NOT belong in either module's own
 * unit-test file: it exists specifically because those two files must never import each other, so
 * nothing inside either one can assert this on its own.
 *
 * `extractHtmlEntryRefs` only ever indexes types it has a known `EntryRefTargetKind` mapping for
 * (`widget`/`form` -> `"entry"`, `media` -> `"asset"`, as of 2026-08-07 §4) — it silently omits any
 * embed type it has no mapping for (a genuinely unregistered/future type). `scanHtmlEmbeds`, by
 * contrast, reports EVERY embed type it finds, known or not — it never gates on type. So "the two
 * scanners agree" here means: for every `(type, id)` pair `extractHtmlEntryRefs` DOES report,
 * `scanHtmlEmbeds` must report it too (never silently drops a ref the entry_refs index treats as
 * real) — checked both ways for widget/form/media fixtures, and via an explicit one-way assertion
 * for the unregistered-type fixture where extractor is expected to omit what the scanner still finds.
 */

const TARGET_KIND_FIXTURES: readonly string[] = [
  '<div data-embed-type="widget" data-embed-id="widget-1"></div>',
  '<div data-embed-type="form" data-embed-id="form-1"></div>',
  '<div data-embed-type="media" data-embed-id="asset-1"></div>',
  '<h1>Welcome</h1><p>Some copy.</p><div data-embed-type="widget" data-embed-id="w1"></div><div data-embed-type="form" data-embed-id="f1"></div>',
  '<div class="slot" data-embed-type="widget" data-embed-id="w1" data-extra="y"></div>',
  '<div data-embed-type="widget" data-embed-id="w1">\n</div>',
  '<div data-embed-type="widget" data-embed-id="w1"><span>not empty, must not match</span></div>',
  "<p>no embeds at all</p>",
  '<div data-embed-type="widget" data-embed-id="w1"></div><div data-embed-type="widget" data-embed-id="w1"></div><div data-embed-type="form" data-embed-id="f1"></div>',
  '<div data-embed-type="widget" data-embed-id=""></div>',
];

function fieldPathType(fieldPath: string): string {
  const match = fieldPath.match(/data-embed-type=([a-z0-9-]+)#/);
  if (!match) throw new Error(`unparseable fieldPath: ${fieldPath}`);
  return match[1];
}

for (const [i, html] of TARGET_KIND_FIXTURES.entries()) {
  test(`html-entry-refs consistency fixture #${i}: extractHtmlEntryRefs and scanHtmlEmbeds agree on the same (type, id) multiset for widget/form/media embeds`, () => {
    const fromExtractor = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html }).map(
      (r) => `${fieldPathType(r.fieldPath)}:${r.targetId}`
    );
    const fromScanner = scanHtmlEmbeds(html)
      .filter((r) => r.id !== null)
      .map((r) => `${r.type}:${r.id}`);

    assert.deepEqual(fromExtractor.sort(), fromScanner.sort(), `fixture: ${html}`);
  });
}

test('html-entry-refs consistency: a media embed is indexed with targetKind "asset" (2026-08-07 §4) — never "entry", since a media asset lives in a different storage domain than the generic entries graph', () => {
  const html = '<div data-embed-type="media" data-embed-id="asset-1" data-embed-variant="thumb"></div>';

  const fromScanner = scanHtmlEmbeds(html);
  assert.deepEqual(fromScanner, [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);

  const fromExtractor = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html });
  assert.equal(fromExtractor.length, 1);
  assert.equal(fromExtractor[0]?.targetKind, "asset");
  assert.equal(fromExtractor[0]?.targetId, "asset-1");
});

test("html-entry-refs consistency: an unregistered/future embed type token is scanned by scanHtmlEmbeds (unknown-vs-known is a resolution-time question) but not indexed by extractHtmlEntryRefs, with neither scanner requiring a code change to handle it", () => {
  const html = '<div data-embed-type="some-future-type" data-embed-id="x1"></div>';

  const fromScanner = scanHtmlEmbeds(html);
  assert.deepEqual(fromScanner, [{ type: "some-future-type", id: "x1", name: null, variant: null }]);

  const fromExtractor = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html });
  assert.deepEqual(fromExtractor, []);
});
