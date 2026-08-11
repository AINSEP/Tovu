import assert from "node:assert/strict";
import test from "node:test";

import { scanHtmlEmbeds } from "#src/widgets/html-embeds";
import { extractHtmlEntryRefs } from "../../extractor";

/**
 * @file SPEC-047 Slice 3 — keeps `core/entry-refs/extractor.ts`'s `extractHtmlEntryRefs` and
 * `widgets/html-embeds.ts`'s `scanHtmlEmbeds` agreeing on what counts as a reference.
 *
 * **This suite's original premise is gone, and that is the point.** It was written when the two
 * functions were DELIBERATELY separate implementations of the same `data-embed-type` regex — a
 * tradeoff taken so `core/` need not import `widgets/` — and it existed to catch the two copies
 * drifting apart. A guard of that shape can only ever detect drift AFTER it has happened, and only
 * on the fixtures someone remembered to write.
 *
 * Since the 2026-08-10 marker unification both functions call `core/embeds/marker.ts`. There is one
 * definition, so the two cannot disagree about what a marker IS. What remains worth pinning is that
 * their two PROJECTIONS of a marker stay in step: the extractor keeps only types it has an
 * `EntryRefTargetKind` for and needs a usable id; the scanner reports every type it finds and leaves
 * "is this type known" to resolution time. So "agree" here means: every `(type, id)` pair the
 * extractor reports, the scanner reports too — the index never treats as real a reference the
 * renderer cannot see.
 *
 * Retired with the old premise: a fixture asserting that a marker with inner content must NOT match.
 * That encoded the old empty-`<div>`-only rule, which the shared parser deliberately widened so a
 * theme marker's authored fallback content survives. Keeping it would have pinned behavior the
 * migration set out to remove.
 */

const FIXTURES: readonly string[] = [
  `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`,
  // `form` was removed as an embed type on 2026-08-10 (see `embed-type-inventory.md`). Kept as a
  // fixture precisely BECAUSE it is retired: stored Page bodies written before the removal may still
  // carry one, and the invariant this suite exists for must hold for a dead type exactly as it does
  // for a live one — the scanner still reports it, the extractor no longer indexes it, and that
  // asymmetry is the safe direction (an unindexed reference never lets safe-delete believe something
  // is referenced that it cannot see).
  `<div data-embed-config='{"type":"form","id":"form-1"}'></div>`,
  `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>`,
  `<h1>Welcome</h1><p>Some copy.</p><div data-embed-config='{"type":"widget","id":"w1"}'></div><div data-embed-config='{"type":"media","id":"asset-1"}'></div>`,
  `<div class="slot" data-embed-config='{"type":"widget","id":"w1"}' data-extra="y"></div>`,
  `<div data-embed-config='{"type":"widget","id":"w1"}'>\n</div>`,
  // Inner content is now MATCHED, not skipped — a marker's authored content is a real fallback.
  `<div data-embed-config='{"type":"widget","id":"w1"}'><span>authored fallback</span></div>`,
  "<p>no embeds at all</p>",
  `<div data-embed-config='{"type":"widget","id":"w1"}'></div><div data-embed-config='{"type":"widget","id":"w1"}'></div><div data-embed-config='{"type":"media","id":"asset-1"}'></div>`,
  `<div data-embed-config='{"type":"widget","id":""}'></div>`,
  // Theme-owned types share the vocabulary but not this index — the scanner sees them, the
  // extractor has no target kind for them, and neither treats that as an error.
  `<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div><div data-embed-config='{"type":"widget","id":"w1"}'></div>`,
];

/** The extractor's locator format, `bodyHtml[embed:<type>#<occurrence>]`. Parsed here only to
 * recover the type for comparison — nothing in the product parses `fieldPath`. */
function fieldPathType(fieldPath: string): string {
  const match = fieldPath.match(/embed:([a-z0-9-]+)#/);
  if (!match) throw new Error(`unparseable fieldPath: ${fieldPath}`);
  return match[1];
}

for (const [i, html] of FIXTURES.entries()) {
  test(`html-entry-refs consistency fixture #${i}: every (type, id) the extractor indexes, the scanner also reports`, () => {
    const indexed = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html }).map(
      (r) => `${fieldPathType(r.fieldPath)}:${r.targetId}`
    );
    const scanned = new Set(
      scanHtmlEmbeds(html)
        .filter((r) => r.id !== null)
        .map((r) => `${r.type}:${r.id}`)
    );

    for (const ref of indexed) {
      assert.ok(scanned.has(ref), `extractor indexed ${ref}, which the scanner never reported — fixture: ${html}`);
    }
  });
}

test('html-entry-refs consistency: a media embed is indexed with targetKind "asset" (2026-08-07 §4) — never "entry", since a media asset lives in a different storage domain than the generic entries graph', () => {
  const html = `<div data-embed-config='{"type":"media","id":"asset-1","variant":"thumb"}'></div>`;

  assert.deepEqual(scanHtmlEmbeds(html), [{ type: "media", id: "asset-1", name: null, variant: "thumb" }]);

  const fromExtractor = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html });
  assert.equal(fromExtractor.length, 1);
  assert.equal(fromExtractor[0]?.targetKind, "asset");
  assert.equal(fromExtractor[0]?.targetId, "asset-1");
});

test("html-entry-refs consistency: an unregistered/future embed type is scanned but not indexed, with neither side needing a code change to tolerate it", () => {
  const html = `<div data-embed-config='{"type":"some-future-type","id":"x1"}'></div>`;

  assert.deepEqual(scanHtmlEmbeds(html), [{ type: "some-future-type", id: "x1", name: null, variant: null }]);
  assert.deepEqual(extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html }), []);
});

test("html-entry-refs consistency: a marker neither side can parse is dropped by BOTH, so they stay in step even on failure", () => {
  // The asymmetry that would matter: if the scanner tolerated a broken config the extractor rejected,
  // a page could render an embed that the where-used index has no row for — the precise state
  // safe-delete must never be in. One parser makes that unreachable; this pins it.
  const html = `<div data-embed-config='{"type":"widget","id":}'></div>`;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(scanHtmlEmbeds(html), []);
    assert.deepEqual(extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html }), []);
  } finally {
    console.warn = original;
  }
});
