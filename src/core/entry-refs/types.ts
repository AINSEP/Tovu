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
import type { UUID } from "../ports";

/**
 * What kind of thing a reference's *source* location is. Widgets are the
 * first real populator: `widget-area-placement` (a `widget_area` entry's
 * `bodyJson.placements` list), `widget-embed` (a `widgetEmbed` node inside any
 * entry's `bodyJson`), and `config-field` (a `ref`-typed field inside a
 * widget instance's own `fields.ext.widget.*` config, e.g. Contact Form's
 * `formDefinitionId`).
 */
export type EntryRefSourceKind = "widget-area-placement" | "widget-embed" | "config-field";

/** What kind of thing a reference *targets*. Term-target coverage is narrower than entry-target (SPEC-043 REQ-32). */
export type EntryRefTargetKind = "entry" | "term";

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
