import assert from "node:assert/strict";
import test from "node:test";

import { extractEntryRefs, extractHtmlEntryRefs } from "../../extractor";

/**
 * @file C-009 `extractEntryRefs` — SPEC-043 REQ-29..32, AC-21/22, INV-06.
 * TDD-certified against the stub in `extractor.ts`; currently RED — `extractEntryRefs` throws
 * "not implemented" and these assertions describe the real contract. This is the minimal
 * `entry_refs` slice the ADR-047 debate found does not yet exist as running code anywhere in this
 * repo (`src/navigation/resolver.ts`'s own comment names the gap) — widgets is the first real
 * consumer/populator.
 */

test("AC-21/REQ-30: a widget referenced in one widget_area placement produces exactly one widget-area-placement ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "area-footer",
    sourceEntryType: "widget_area",
    bodyJson: {
      schemaVersion: 1,
      placements: [{ placementId: "plc-1", widgetEntryId: "widget-social", enabled: true }],
    },
    fieldsExt: { widgets: { regionKey: "footer" } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "widget-area-placement");
  assert.equal(refs[0]?.targetId, "widget-social");
  assert.equal(refs[0]?.targetKind, "entry");
});

test("AC-21/REQ-30: a widget referenced by an inline widgetEmbed node produces a widget-embed ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-contact",
    sourceEntryType: "page",
    bodyJson: {
      type: "doc",
      content: [{ type: "widgetEmbed", attrs: { placementId: "plc-2", widgetEntryId: "widget-contact" } }],
    },
    fieldsExt: {},
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "widget-embed");
  assert.equal(refs[0]?.targetId, "widget-contact");
});

test("AC-22/REQ-31: a widget instance's ref-typed config field (formDefinitionId) extracts a config-field ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-contact",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "contact-form", config: { formDefinitionId: "form-1" } } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "config-field");
  assert.equal(refs[0]?.fieldPath, "fields.ext.widget.config.formDefinitionId");
  assert.equal(refs[0]?.targetKind, "entry");
  assert.equal(refs[0]?.targetId, "form-1");
});

test("REQ-32: a taxonomy-term-target config field (recent-entries' categoryTermId) is extracted with targetKind 'term', distinguishable from an entry-target row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-recent",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "recent-entries", config: { maxItems: 5, categoryTermId: "term-1" } } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.targetKind, "term", "a taxonomy-term target must never be indistinguishable from an entry-target reference (REQ-32's soft-reference distinction)");
  assert.equal(refs[0]?.targetId, "term-1");
});

test("INV-06: extraction is idempotent — re-extracting an unchanged entry produces the identical ref set (pure function of its input)", () => {
  const input = {
    workspaceId: "ws-1",
    sourceEntryId: "area-footer",
    sourceEntryType: "widget_area",
    bodyJson: {
      schemaVersion: 1,
      placements: [{ placementId: "plc-1", widgetEntryId: "widget-social", enabled: true }],
    },
    fieldsExt: { widgets: { regionKey: "footer" } },
  };

  const first = extractEntryRefs(input);
  const second = extractEntryRefs(input);
  assert.deepEqual(first, second);
});

test("REQ-29: extracting a widget instance with no references produces an empty ref set, not an error", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-text",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "text", config: { body: "plain copy, no refs" } } },
  });

  assert.deepEqual(refs, []);
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 — extractHtmlEntryRefs, the "html"-format Page sibling.
// ---------------------------------------------------------------------------

test("extractHtmlEntryRefs: a widget-type marker produces a page-html-embed ref row targeting the widget entry", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html: `<section><div data-embed-config='{"type":"widget","id":"widget-social"}'></div></section>`,
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "page-html-embed");
  assert.equal(refs[0]?.targetKind, "entry");
  assert.equal(refs[0]?.targetId, "widget-social");
});

test("extractHtmlEntryRefs: a form-type marker also produces an entry-target page-html-embed row — same targetKind convention as menuRef/formDefinitionId elsewhere", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html: `<div data-embed-config='{"type":"form","id":"form-contact-us"}'></div>`,
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "page-html-embed");
  assert.equal(refs[0]?.targetKind, "entry");
  assert.equal(refs[0]?.targetId, "form-contact-us");
});

test("extractHtmlEntryRefs: a page with both kinds of embed and plain content extracts exactly the embed refs, none for the plain content", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html:
      "<h1>Welcome</h1><p>Some copy.</p>" +
      `<div data-embed-config='{"type":"widget","id":"w1"}'></div>` +
      `<div data-embed-config='{"type":"form","id":"f1"}'></div>`,
  });

  assert.equal(refs.length, 2);
  assert.deepEqual(refs.map((r) => r.targetId).sort(), ["f1", "w1"]);
});

test("extractHtmlEntryRefs: a page with no embeds produces an empty ref set, not an error (REQ-29's spirit, carried over)", () => {
  const refs = extractHtmlEntryRefs({ workspaceId: "ws-1", sourceEntryId: "page-1", html: "<h1>No embeds here</h1>" });
  assert.deepEqual(refs, []);
});

test("extractHtmlEntryRefs: idempotent — re-extracting unchanged html produces the identical ref set (pure function of its input, matching extractEntryRefs' own INV-06 discipline)", () => {
  const input = { workspaceId: "ws-1", sourceEntryId: "page-1", html: `<div data-embed-config='{"type":"widget","id":"w1"}'></div>` };
  assert.deepEqual(extractHtmlEntryRefs(input), extractHtmlEntryRefs(input));
});

test("extractHtmlEntryRefs: a placeholder referencing a deleted/nonexistent widget is STILL indexed — indexing depends only on the placeholder's presence in html, never on whether the target currently resolves (this function takes no repo dependency at all, so it structurally cannot filter on resolution status; this is the exact case entry_refs exists to catch: a page whose reference silently stopped working)", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html: `<div data-embed-config='{"type":"widget","id":"widget-that-was-deleted"}'></div>`,
  });

  assert.equal(refs.length, 1, "a dangling reference must still produce an entry_refs row — that is the row REQ-34/REQ-42's safe-delete check needs to find");
  assert.equal(refs[0]?.targetId, "widget-that-was-deleted");
});

test("extractHtmlEntryRefs: a media-type embed is indexed with targetKind \"asset\" (2026-08-07) — a media asset lives in a different storage domain than the generic entries graph, so it is never tagged targetKind \"entry\"", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html: `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>`,
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "page-html-embed");
  assert.equal(refs[0]?.targetKind, "asset");
  assert.equal(refs[0]?.targetId, "asset-1");
});

test("extractHtmlEntryRefs: an unregistered/future embed type is scanned but not indexed — HTML_EMBED_TARGET_KINDS has no arm for it, and guessing a targetKind would be wrong data", () => {
  const refs = extractHtmlEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-1",
    html: `<div data-embed-config='{"type":"some-future-type","id":"x1"}'></div>`,
  });

  assert.deepEqual(refs, []);
});
