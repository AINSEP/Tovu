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

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 — `"html"`-format Page bodies (`body_html`, a plain string, not a `bodyJson`
// tree). A sibling entry point to `extractEntryRefs` above, not a mode of it: an html Page is
// written through `features/pages/html-document-store.ts`'s `PagesHtmlDocumentStore`, a completely
// separate write path from the `entries` chokepoint `extractEntryRefs` is called from (ADR-056
// CIC-3 — Pages bypass that chokepoint entirely), so it needs its own call site, not a widened
// `ExtractEntryRefsInput`.
// ---------------------------------------------------------------------------

/**
 * `widgets/html-embeds.ts`'s `data-embed-type` pattern, duplicated here deliberately rather than
 * imported — the SAME tradeoff {@link collectWidgetEmbedRefs} above already makes for the TipTap
 * `widgetEmbed` case (this file takes no injected widgets dependency, so `core/` stays importable by
 * `widgets/` and never the reverse — see this file's own header on why `core` is beneath `widgets`
 * in this codebase's layering). Correctness drift between the two copies — "what entry_refs
 * indexes" silently disagreeing with "what render.ts actually embeds" — is guarded by
 * `__tests__/integration/html-entry-refs-consistency.integration.test.ts`, which asserts both
 * scanners agree on the same fixture HTML, rather than by a shared import. `type` stays a free
 * string here too (2026-08-07 generalization) — a fourth embed type must never require a change to
 * this file any more than to `html-embeds.ts` itself.
 */
const HTML_EMBED_PATTERN_SOURCE = String.raw`<div\b[^>]*?\bdata-embed-type\s*=\s*"([a-z][a-z0-9-]*)"[^>]*?>\s*<\/div>`;

/** Mirrors `html-embeds.ts`'s `extractAttrValue` — pulls one `attr="VALUE"` out of a matched embed
 * div's full tag text, `null` when absent. */
function extractHtmlAttrValue(tagText: string, attrName: string): string | null {
  const match = tagText.match(new RegExp(`\\b${attrName}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : null;
}

/** Mirrors `widgets/html-embeds.ts`'s `MAX_HTML_EMBEDS_PER_PAGE` — the index must never grow past
 * what a render can actually resolve, so the same resource bound applies here too. */
const MAX_HTML_PAGE_EMBED_REFS = 50;

/** Mirrors `widgets/html-embeds.ts`'s id sanity bound. */
const MAX_HTML_EMBED_REF_ID_LENGTH = 200;

/**
 * Embed types this function currently knows how to target-map into `entry_refs`, and which
 * {@link EntryRefTargetKind} each maps to. `widget`/`form` -> `"entry"` (mirrors
 * `MENU_REGISTRATION`'s `menuRef`/`CONTACT_FORM_REGISTRATION`'s `formDefinitionId` both being
 * extracted as `"entry"`-target refs elsewhere in this codebase even though neither a menu nor a
 * Forms definition is a literal `entries`-table row; `targetKind` marks "a durable content object",
 * not literal table membership). `media` -> `"asset"` (2026-08-07,
 * `IMPLEMENTATION-PLAN-data-embed-type-2026-08-07.md` §4 — a media asset lives in a genuinely
 * different storage domain than the generic `entries` graph, so it gets its own target kind rather
 * than overloading `"entry"` the way the first two do). A type absent from this map is still
 * SCANNED (the pattern above matches any `data-embed-type` token, per this file's 2026-08-07
 * generalization) but produces no row: an unrecognized/future type has no known target-kind mapping
 * yet, and guessing one would be actively wrong data, not just incomplete. Widening this map is
 * exactly the "one place to change" a new indexable type needs; the regex above never does.
 */
const HTML_EMBED_TARGET_KINDS: ReadonlyMap<string, EntryRefTargetKind> = new Map([
  ["widget", "entry"],
  ["form", "entry"],
  ["media", "asset"],
]);

/**
 * REQ-30-style — extracts one `entry_refs` row per `data-embed-type` placeholder found in `html`,
 * up to {@link MAX_HTML_PAGE_EMBED_REFS}. `targetKind` is looked up per embed type via
 * {@link HTML_EMBED_TARGET_KINDS} — an embed type with no entry there (unrecognized/future type)
 * produces no row rather than a guessed `targetKind`. Pure, never throws, matching
 * `extractEntryRefs`'s own contract.
 *
 * A reference whose `data-embed-id` is absent, empty, or beyond {@link MAX_HTML_EMBED_REF_ID_LENGTH}
 * produces no row — `EntryRefRow.targetId` is a required `UUID`, so an unusable id has nothing to
 * populate it with (mirrors `scanHtmlEmbeds`'s own id-normalization, but this function drops the
 * occurrence entirely rather than reporting a null-id row, since an indexable-or-not decision is
 * exactly what this function's contract already commits to for every other ref kind it extracts).
 *
 * **Indexes REFERENCES, never RESOLUTIONS — by construction, not by discipline.** This function
 * takes no repo/resolver dependency (only a plain `html` string), so it has no way to check whether
 * a placeholder's target currently exists, let alone resolves. A `data-embed-type` div pointing at a
 * deleted widget produces a row here exactly like one pointing at a live widget does. This is
 * required, not incidental: `entry_refs`' whole purpose is catching "deleting a widget silently
 * breaks a page" (SPEC-043 REQ-34/REQ-42's safe-delete/where-used check), and that is precisely the
 * page whose reference has stopped resolving — indexing only what currently resolves would make the
 * one broken page the one page the integrity check silently ignores. `resolver-service.ts`'s
 * `resolveHtmlPageEmbeds` (a completely separate function, called from the render path, never from
 * here) is where "does this currently resolve" is answered — this function never asks.
 *
 * @complexity O(n) over `html`'s length for the regex scan.
 * @overallScore 100
 */
export function extractHtmlEntryRefs(input: {
  readonly workspaceId: UUID;
  readonly sourceEntryId: UUID;
  readonly html: string;
}): readonly EntryRefRow[] {
  const refs: EntryRefRow[] = [];
  let occurrence = 0;
  const pattern = new RegExp(HTML_EMBED_PATTERN_SOURCE, "gi");

  for (const match of input.html.matchAll(pattern)) {
    occurrence += 1;
    const typeToken = match[1]?.toLowerCase();
    const targetKind = HTML_EMBED_TARGET_KINDS.get(typeToken);
    if (!targetKind) continue;
    const id = extractHtmlAttrValue(match[0], "data-embed-id");
    if (!id || id.length === 0 || id.length > MAX_HTML_EMBED_REF_ID_LENGTH) continue;

    refs.push({
      workspaceId: input.workspaceId,
      sourceEntryId: input.sourceEntryId,
      sourceKind: "page-html-embed",
      fieldPath: `bodyHtml[data-embed-type=${typeToken}#${occurrence}]`,
      targetKind,
      targetId: id,
    });
    if (refs.length >= MAX_HTML_PAGE_EMBED_REFS) break;
  }

  return refs;
}
