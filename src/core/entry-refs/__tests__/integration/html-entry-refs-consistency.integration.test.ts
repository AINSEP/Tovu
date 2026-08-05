import assert from "node:assert/strict";
import test from "node:test";

import { scanHtmlEmbeds } from "#src/widgets/html-embeds";
import { extractHtmlEntryRefs } from "../../extractor";

/**
 * @file SPEC-047 Slice 3 — keeps `core/entry-refs/extractor.ts`'s `extractHtmlEntryRefs` and
 * `widgets/html-embeds.ts`'s `scanHtmlEmbeds` honest against each other.
 *
 * The two functions are DELIBERATELY separate implementations of the same
 * `data-widget-embed`/`data-form-embed` pattern (see `extractHtmlEntryRefs`'s own doc for why: the
 * same "no cross-import between `core/` and `widgets/`" convention `collectWidgetEmbedRefs` already
 * establishes for the TipTap case). That tradeoff is only safe if the two scanners keep agreeing on
 * what counts as a reference — this suite is the guard, run against representative fixtures. It does
 * NOT belong in either module's own unit-test file: it exists specifically because those two files
 * must never import each other, so nothing inside either one can assert this on its own.
 */

const FIXTURES: readonly string[] = [
  '<div data-widget-embed="widget-1"></div>',
  '<div data-form-embed="form-1"></div>',
  '<h1>Welcome</h1><p>Some copy.</p><div data-widget-embed="w1"></div><div data-form-embed="f1"></div>',
  '<div class="slot" data-widget-embed="w1" data-extra="y"></div>',
  '<div data-widget-embed="w1">\n</div>',
  '<div data-widget-embed="w1"><span>not empty, must not match</span></div>',
  "<p>no embeds at all</p>",
  '<div data-widget-embed="w1"></div><div data-widget-embed="w1"></div><div data-form-embed="f1"></div>',
  '<div data-widget-embed=""></div>',
];

for (const [i, html] of FIXTURES.entries()) {
  test(`html-entry-refs consistency fixture #${i}: extractHtmlEntryRefs and scanHtmlEmbeds agree on the same (kind, id) multiset`, () => {
    const fromExtractor = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html }).map(
      (r) => `${r.fieldPath.includes("data-widget-embed") ? "widget" : "form"}:${r.targetId}`
    );
    const fromScanner = scanHtmlEmbeds(html).map((r) => `${r.kind}:${r.id}`);

    assert.deepEqual(fromExtractor.sort(), fromScanner.sort(), `fixture: ${html}`);
  });
}
