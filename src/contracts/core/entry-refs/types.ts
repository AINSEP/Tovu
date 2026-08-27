/**
 * @file Core type definitions for `entry_refs` (ADR-022 §5, ADR-047 Debate Fold-In Amendment 3, SPEC-043).
 *
 * Purpose:
 * `entry_refs` is core content-model infrastructure — the derived, rebuildable reference-integrity
 * index ADR-022 §5 and ADR-029 §3 both describe, populated at the single entries write chokepoint.
 * It **does not exist as running code before SPEC-043** (confirmed during the ADR-047 debate:
 * `src/navigation/resolver.ts`'s own comment states it "has no compatible ADR-022 schema yet").
 * This file is its first real, running definition — placed under `core/`, not `widgets/`, since
 * any future feature reusing ADR-022 §5's `ref` field-type vocabulary should get coverage from the
 * same extractor for free, not a widgets-specific one.
 *
 * Architectural role:
 * INTERFACES + TYPES ONLY (no feature logic).
 */
import type { UUID } from "@jini-ai/cms/core";

/**
 * What kind of thing a reference's *source* location is. Widgets are the
 * first real populator: `widget-area-placement` (a `widget_area` entry's
 * `bodyJson.placements` list), `widget-embed` (a `widgetEmbed` node inside any
 * entry's `bodyJson`), and `config-field` (a `ref`-typed field inside a
 * widget instance's own `fields.ext.widget.*` config, e.g. Contact Form's
 * `formDefinitionId`).
 *
 * `page-html-embed` (SPEC-047 Slice 3) — a `data-embed-type` placeholder
 * (`widgets/html-embeds.ts`'s convention) inside an `"html"`-format Page's `body_html`. A distinct
 * kind from `widget-embed` on purpose: the source location is a plain HTML string, not a `bodyJson`
 * TipTap node, and it is populated by `features/pages/html-document-store.sqlite.ts`'s write path, not the
 * `entries` chokepoint every other kind above comes from.
 */
export type EntryRefSourceKind = "widget-area-placement" | "widget-embed" | "config-field" | "page-html-embed";

/**
 * What kind of thing a reference *targets*. Term-target coverage is narrower than entry-target
 * (SPEC-043 REQ-32). `"asset"` (2026-08-07, `IMPLEMENTATION-PLAN-data-embed-type-2026-08-07.md`
 * §4) is a media asset (`MediaRepoPort`, `@jini-ai/cms/media`) — a genuinely different storage
 * domain from the generic `entries` graph `"entry"` denotes, so a `data-embed-type="media"` Page
 * embed is indexed as `"asset"` rather than overloading `"entry"` the way a menu/Forms-definition
 * reference already does (see `extractHtmlEntryRefs`'s own doc for why that overload was judged
 * acceptable for those two but not for media).
 */
export type EntryRefTargetKind = "entry" | "term" | "asset";

/**
 * One row of the derived `entry_refs` index. Extracted/retracted in the same
 * transaction as the source entry's write (INV-06) — never a follow-up async
 * job. Rebuildable from live entries at any time, same species as
 * `nav_location_bindings`/`widget_region_bindings`.
 */
export interface EntryRefRow {
  readonly workspaceId: UUID;
  readonly sourceEntryId: UUID;
  readonly sourceKind: EntryRefSourceKind;
  /** JSON-path-shaped locator within the source (e.g. `bodyJson.placements[2]`, `fields.ext.widget.config.formDefinitionId`). */
  readonly fieldPath: string;
  readonly targetKind: EntryRefTargetKind;
  readonly targetId: UUID;
}
