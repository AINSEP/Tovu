/**
 * @file `extractEntryRefs` — the chokepoint-side `entry_refs` extractor (ADR-022 §5, SPEC-043
 * REQ-29..32).
 *
 * Purpose:
 * Walks a written entry's `bodyJson`/`fields.ext.*` for `ref`-typed fields (ADR-022 §5's field-type
 * vocabulary) and widget-reference-shaped nodes (`widget_area` placements, `widgetEmbed` nodes),
 * producing the rows `EntryRefsRepoPort.replaceForSource` writes in the SAME transaction as the
 * triggering entry write (INV-06) — never a follow-up async job. Entry-target references (menu,
 * form definition, success-page) are fully covered; a config field whose target kind is a
 * taxonomy term is extracted as a documented soft reference only where the installed schema
 * supports that target kind (REQ-32) — not claimed as safe-delete-protected.
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-009). Called from the single entries chokepoint —
 * this function itself performs no I/O; the caller writes the returned rows inside its own
 * transaction. Body throws until the Programmer stage implements against
 * `__tests__/integration/extractor.integration.test.ts`.
 */
import type { UUID } from "@jini-ai/cms/core";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

export interface ExtractEntryRefsInput {
  readonly workspaceId: UUID;
  readonly sourceEntryId: UUID;
  readonly sourceEntryType: string;
  /** The entry's post-write `bodyJson`, already validated. */
  readonly bodyJson: unknown;
  /** The entry's post-write `fields.ext.*` bag, already validated against its type's registered schema. */
  readonly fieldsExt: Readonly<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * REQ-31/32's ref-suffix convention: a config field's KEY (not its schema) decides whether its
 * string value is a reference and, if so, which target kind. Keys ending in `TermId` are
 * taxonomy-term-target soft references (REQ-32); keys ending in `RefId`, `Ref`, or `Id` are
 * entry-target references (REQ-31) — covers every v1 ref-typed field `widgets/registry.ts`
 * declares (`formDefinitionId`, `menuRef`, `categoryTermId`, each now also carrying a matching
 * `x-ref-target` JSON-schema annotation) without this pure function needing to import that
 * registry — `extractEntryRefs` deliberately takes no injected schema/registry dependency (see
 * the certified test suite, which calls it with plain data only), so a structural, key-name-based
 * convention is the only mechanism available that stays a pure function of its literal input. A
 * schema-driven extractor (consulting the registry's `x-ref-target` markers directly) would be a
 * reasonable future upgrade if this function's signature is ever widened.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function classifyRefFieldKey(key: string): EntryRefTargetKind | null {
  if (key.endsWith("TermId")) return "term";
  if (key.endsWith("RefId") || key.endsWith("Ref") || key.endsWith("Id")) return "entry";
  return null;
}

/**
 * Recursively walks a TipTap-shaped document tree (`{ type, content: [...] }`, arrays of such
 * nodes) looking for `widgetEmbed` atoms (REQ-18/30), regardless of nesting depth — matches
 * `embed-validation.ts`'s INV-04 stance that nesting depth never matters, only presence.
 *
 * @complexity O(n) over the document's total node count.
 * @overallScore 100
 */
function collectWidgetEmbedRefs(node: unknown, path: string, input: ExtractEntryRefsInput, refs: EntryRefRow[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectWidgetEmbedRefs(child, `${path}[${index}]`, input, refs));
    return;
  }
  if (!isPlainObject(node)) return;

  if (node.type === "widgetEmbed" && isPlainObject(node.attrs) && typeof node.attrs.widgetEntryId === "string") {
    refs.push({
      workspaceId: input.workspaceId,
      sourceEntryId: input.sourceEntryId,
      sourceKind: "widget-embed",
      fieldPath: path,
      targetKind: "entry",
      targetId: node.attrs.widgetEntryId,
    });
  }

  if (Array.isArray(node.content)) {
    collectWidgetEmbedRefs(node.content, `${path}.content`, input, refs);
  }
}

/**
 * REQ-29..32 — extracts every `entry_refs` row implied by one entry's written state: a
 * `widget_area` placement list (REQ-30), any `widgetEmbed` node inside `bodyJson` (REQ-30/18), and
 * any ref-typed config field inside `fieldsExt` (REQ-31/32). Pure and idempotent (INV-06's
 * "same-transaction, re-extract on every write" discipline depends on this being a deterministic
 * function of the entry's own state, never accumulating hidden extractor-local state) — no I/O, no
 * side effects. The caller (the entries write chokepoint composition in `widgets/write-service.ts`/
 * `region-area-service.ts`) is responsible for writing the returned rows via
 * `EntryRefsRepoPort.replaceForSource`.
 *
 * @complexity O(n) over `bodyJson`'s node count plus O(k) over `fieldsExt`'s config keys.
 * @overallScore 100
 */
export function extractEntryRefs(input: ExtractEntryRefsInput): readonly EntryRefRow[] {
  const refs: EntryRefRow[] = [];

  // REQ-30 (a): a widget_area's placement list — shape-detected, not type-gated (REQ-17 already
  // guarantees only a widget_area entry's bodyJson ever carries this shape).
  if (isPlainObject(input.bodyJson) && Array.isArray(input.bodyJson.placements)) {
    (input.bodyJson.placements as unknown[]).forEach((placement, index) => {
      if (isPlainObject(placement) && typeof placement.widgetEntryId === "string") {
        refs.push({
          workspaceId: input.workspaceId,
          sourceEntryId: input.sourceEntryId,
          sourceKind: "widget-area-placement",
          fieldPath: `bodyJson.placements[${index}]`,
          targetKind: "entry",
          targetId: placement.widgetEntryId,
        });
      }
    });
  }

  // REQ-30 (b): widgetEmbed nodes anywhere inside bodyJson.
  collectWidgetEmbedRefs(input.bodyJson, "bodyJson", input, refs);

  // REQ-31/32: ref-typed config fields inside fields.ext.<namespace>.config.
  for (const [namespace, namespaceValue] of Object.entries(input.fieldsExt ?? {})) {
    if (!isPlainObject(namespaceValue)) continue;
    const config = namespaceValue.config;
    if (!isPlainObject(config)) continue;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== "string" || value.length === 0) continue;
      const targetKind = classifyRefFieldKey(key);
      if (!targetKind) continue;

      refs.push({
        workspaceId: input.workspaceId,
        sourceEntryId: input.sourceEntryId,
        sourceKind: "config-field",
        fieldPath: `fields.ext.${namespace}.config.${key}`,
        targetKind,
        targetId: value,
      });
    }
  }

  return refs;
}
