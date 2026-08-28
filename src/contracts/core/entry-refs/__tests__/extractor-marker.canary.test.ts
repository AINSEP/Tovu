import assert from "node:assert/strict";
import test from "node:test";

import { scanHtmlEmbeds } from "#src/features/widgets/html-embeds";
import { extractHtmlEntryRefs } from "../extractor.js";

/**
 * @file Canaries for `extractHtmlEntryRefs` on the shared marker parser (2026-08-10 unification).
 *
 * This is the integrity path, not a render path, and it fails in the one direction that is worse
 * than an error: `entry_refs` is what safe-delete's where-used check reads, so a reference this
 * function drops does not degrade the feature, it INVERTS it — the delete is reported safe
 * *because* the row protecting the target went missing. Nothing downstream can tell the difference
 * between "no reference exists" and "the reference could not be parsed".
 *
 * Hence the two canaries that matter most here are about what happens when parsing FAILS, and about
 * the extractor and the renderer agreeing on what a reference is. The second used to be enforced by
 * `html-entry-refs-consistency.integration.test.ts` comparing two independently-written regexes;
 * both now call one parser, so the property holds by construction and this only pins that the two
 * projections of it stay in step.
 */

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const SOURCE = "00000000-0000-4000-8000-000000000002";
const WIDGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function extract(html: string) {
  return extractHtmlEntryRefs({ workspaceId: WORKSPACE, sourceEntryId: SOURCE, html });
}

/** Run `fn` with `console.warn` captured. Restored in `finally` so one failing canary cannot
 * silence the warnings of every test that runs after it. */
function captureWarnings(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return lines;
}

test("canary: an indexable marker produces a row with the right target kind", () => {
  const rows = extract(`<div data-embed-config='{"type":"widget","id":"${WIDGET}"}'></div>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetKind, "entry");
  assert.equal(rows[0].targetId, WIDGET);
  assert.equal(rows[0].sourceKind, "page-html-embed");
});

test("canary: media targets a different storage domain and keeps its own target kind", () => {
  const rows = extract(`<div data-embed-config='{"type":"media","id":"${ASSET}","variant":"thumb"}'></div>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetKind, "asset");
});

test("canary: a REJECTED marker is LOUD — never a silent drop", () => {
  // The failure this whole file exists for. A single stray character makes the config unparseable;
  // the reference is real and in the markup, and this index cannot see it. Silence here means
  // safe-delete later reports "unused" about something a live page still embeds.
  const warnings = captureWarnings(() => {
    const rows = extract(`<div data-embed-config='{"type":"widget","id":}'></div>`);
    assert.deepEqual(rows, [], "an unparseable marker cannot produce a row — there is nothing to index");
  });

  assert.equal(warnings.length, 1, "exactly one warning per rejected marker");
  assert.match(warnings[0], /UNINDEXED/, "the warning must name the consequence, not just the parse error");
  assert.match(warnings[0], /safe-delete/i, "and must say what breaks, so it is actionable in a log");
  assert.ok(warnings[0].includes(SOURCE), "and must identify which entry, or it cannot be chased down");
});

test("canary: a well-formed document warns about nothing", () => {
  // The other half. A warning that fires routinely gets filtered out of logs, and then the real one
  // is invisible too — so the quiet case has to be genuinely quiet.
  const warnings = captureWarnings(() => {
    extract(
      `<div data-embed-config='{"type":"widget","id":"${WIDGET}"}'></div>` +
        `<nav data-embed-config='{"type":"menu","id":"primary-nav"}'>fallback</nav>`
    );
  });
  assert.deepEqual(warnings, []);
});

test("canary: a theme-owned marker type produces no row, and no warning either", () => {
  // `partial`/`menu` parse fine and are simply not this index's concern — an unmapped type is a
  // decision, not a failure, and must not be confused with the rejection case above.
  const warnings = captureWarnings(() => {
    const rows = extract(
      `<div data-embed-config='{"type":"partial","id":"nav","current":"index"}'></div>` +
        `<nav data-embed-config='{"type":"menu","id":"docs-themes-menu","variant":"tree"}'>fallback</nav>`
    );
    assert.deepEqual(rows, []);
  });
  assert.deepEqual(warnings, []);
});

test("canary: occurrence numbering counts every marker, so a locator survives a type being indexed later", () => {
  // The old local counter only advanced on markers this file already knew how to index, so adding a
  // type to HTML_EMBED_TARGET_KINDS would silently renumber every locator after it.
  const rows = extract(
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>` +
      `<div data-embed-config='{"type":"widget","id":"${WIDGET}"}'></div>`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fieldPath, "bodyHtml[embed:widget#2]", "the widget is the SECOND marker in the document");
});

test("canary: an unusable id is dropped, because targetId has nothing to hold", () => {
  const tooLong = "x".repeat(201);
  assert.deepEqual(extract(`<div data-embed-config='{"type":"widget","id":"${tooLong}"}'></div>`), []);
  assert.deepEqual(extract(`<div data-embed-config='{"type":"widget"}'></div>`), []);
  // A non-string id is exactly as unusable as a missing one, and must not be coerced.
  assert.deepEqual(extract(`<div data-embed-config='{"type":"widget","id":7}'></div>`), []);
});

test("canary: the index and the renderer agree on what counts as a reference", () => {
  // Both call `scanEmbedMarkers`. This pins that the two PROJECTIONS of it stay in step — the
  // property the old two-independent-regexes consistency test could only check after drift.
  const html =
    `<div data-embed-config='{"type":"widget","id":"${WIDGET}"}'></div>` +
    `<div data-embed-config='{"type":"media","id":"${ASSET}"}'></div>` +
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`;

  const indexed = extract(html).map((r) => r.targetId);
  const rendered = scanHtmlEmbeds(html).filter((r) => r.type !== "partial" && r.id !== null).map((r) => r.id);
  assert.deepEqual(indexed, rendered);
});
