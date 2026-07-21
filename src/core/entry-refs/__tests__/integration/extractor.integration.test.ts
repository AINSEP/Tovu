import assert from "node:assert/strict";
import test from "node:test";

import { extractEntryRefs } from "../../extractor";

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
