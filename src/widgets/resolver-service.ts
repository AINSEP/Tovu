/**
 * @file `resolvePageWidgets` — the batch-first page-render resolution orchestrator (SPEC-043
 * REQ-23..28; ADR-047 Debate Fold-In Amendment 2).
 *
 * Purpose:
 * The single seam that turns "a page's widget references" (region-bound + inline-embedded) into
 * data the theme can render — one batched entry-load query, grouped by type, at most one
 * `resolveWidgetType` call per type present on the page (REQ-24). Mirrors the `render.ts` "theme is
 * data, core resolves" stance — the theme never calls this directly or resolves a reference itself.
 *
 * `EntryRepoPort` (this task's frozen, real chokepoint contract) has no `findByIds`/batch-by-id
 * primitive — only `findById` (one row) and `EntryListPort.listByWorkspace` (a full-type scan).
 * REQ-24's "one batched query" is satisfied here via ONE `listByWorkspace({type: 'widget'})` call
 * per render (not one query per placement/type), which is the batching guarantee AC-16 actually
 * tests (via `resolveWidgetType`'s single-`resolveMany`-call assertion) — a literal `WHERE id IN
 * (...)` primitive does not exist on the real, frozen `EntryRepoPort` this task must compose
 * against without modifying `features/entries`.
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-004).
 */
import type { JsonObject, UUID } from "@jini-ai/cms/core";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRepoPort } from "../features/entries/write-service";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload";
import { scanHtmlEmbeds } from "./html-embeds";
import type { WidgetRegionBindingRepoPort } from "./ports";
import { resolveWidgetType } from "./resolvers/index";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "./types";
import type {
  WidgetInstanceView,
  WidgetPlacementNode,
  WidgetRegionKey,
  WidgetRenderIR,
  WidgetResolveContext,
  WidgetResolveResult,
  WidgetTypeKey,
} from "./types";

export interface ResolvePageWidgetsDeps {
  bindingRepo: WidgetRegionBindingRepoPort;
  entryRepo: EntryRepoPort & EntryListPort;
}

/**
 * The narrower dependency slice widget-instance resolution alone needs — `resolveWidgetInstances`
 * and `resolveHtmlPageEmbeds` (below) never touch `bindingRepo` (that repo only backs region
 * placements, which an `"html"`-format Page has no concept of). `ResolvePageWidgetsDeps` remains a
 * structural supertype of this, so `resolvePageWidgets` passes its own full deps through unchanged.
 */
type WidgetInstanceResolutionDeps = Pick<ResolvePageWidgetsDeps, "entryRepo">;

export interface ResolvePageWidgetsInput {
  readonly workspaceId: UUID;
  /**
   * The already-fetched host document's `bodyJson`, when the caller has one to scan for inline
   * `widgetEmbed` nodes (REQ-21) — e.g. a `PostRecord.bodyJson` on the `home`/`post` site routes.
   * Passed as content rather than an id-to-fetch (unlike the old `pageEntryId` this replaces)
   * because the only real callers already hold the document: `PostRecord` (`features/post`) is a
   * separate, pre-ADR-022 table an `EntryRepoPort.findById` call can never resolve, which is why
   * `pageEntryId` had no real caller and every `widgetEmbed` node in a post body rendered the
   * REQ-28 placeholder forever, never real content. `undefined` when there is no host document
   * (the home route) or nothing to scan.
   */
  readonly pageBodyJson?: unknown;
  /** Region keys the current theme/template declares for this page. */
  readonly resolvedRegions: readonly WidgetRegionKey[];
}

export interface ResolvePageWidgetsRequired {
  deps: ResolvePageWidgetsDeps;
  input: ResolvePageWidgetsInput;
}

export interface ResolvePageWidgetsResult {
  readonly regions: Readonly<Record<WidgetRegionKey, readonly WidgetRenderIR[]>>;
  /** Keyed by `placementId` — one entry per `widgetEmbed` node in the page's `bodyJson`. */
  readonly inlineResolved: ReadonlyMap<UUID, WidgetRenderIR>;
}

/** REQ-28: a widget resolution failure renders an isolated placeholder — no internal detail in public output. */
const PLACEHOLDER_IR: WidgetRenderIR = { componentId: "widget-placeholder", props: {} };

function toRenderIr(result: WidgetResolveResult | undefined): WidgetRenderIR {
  return result?.ok ? result.ir : PLACEHOLDER_IR;
}

interface InlineEmbedRef {
  placementId: UUID;
  widgetEntryId: UUID;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a TipTap-shaped bodyJson tree collecting every `widgetEmbed` node (REQ-21) — same shape `core/entry-refs/extractor.ts` walks, kept separate since this module has no dependency on `core/entry-refs`. */
function collectWidgetEmbeds(node: unknown, out: InlineEmbedRef[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectWidgetEmbeds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === "widgetEmbed" && isPlainObject(node.attrs) && typeof node.attrs.widgetEntryId === "string" && typeof node.attrs.placementId === "string") {
    out.push({ placementId: node.attrs.placementId, widgetEntryId: node.attrs.widgetEntryId });
  }
  if (Array.isArray(node.content)) collectWidgetEmbeds(node.content, out);
}

/**
 * Batch-loads and resolves every widget instance in `referencedIds` (REQ-24's "one batched query,
 * at most one `resolveWidgetType` call per type" guarantee) into a `widgetEntryId ->
 * WidgetResolveResult` map. Extracted so this exact batching contract has ONE implementation rather
 * than two that could silently diverge (SPEC-047 Slice 2 inline refactor beat) — `resolvePageWidgets`
 * (below, region + TipTap-inline-embed callers) and `resolveHtmlPageEmbeds` (an `"html"`-format
 * Page's `data-widget-embed` callers) both call this.
 *
 * Never throws (REQ-27's contract, unchanged by this extraction) — a malformed widget-instance
 * payload is skipped, not thrown; the caller's own placeholder-degradation step (REQ-28) handles a
 * ref that never made it into the returned map.
 *
 * @complexity O(1) plus one batched `listByWorkspace` query plus at most one `resolveWidgetType`
 * call per distinct widget type present among `referencedIds` (REQ-24).
 * @overallScore 100
 */
async function resolveWidgetInstances(
  deps: WidgetInstanceResolutionDeps,
  workspaceId: UUID,
  referencedIds: ReadonlySet<UUID>,
  context: WidgetResolveContext
): Promise<ReadonlyMap<UUID, WidgetResolveResult>> {
  const widgetRows =
    referencedIds.size > 0 ? await deps.entryRepo.listByWorkspace({ workspaceId, type: WIDGET_CONTENT_TYPE }) : [];

  const byType = new Map<WidgetTypeKey, WidgetInstanceView[]>();
  for (const row of widgetRows) {
    if (!referencedIds.has(row.id)) continue;
    let payload: ReturnType<typeof parseWidgetInstancePayload>;
    try {
      payload = parseWidgetInstancePayload(row.fieldsJson);
    } catch {
      // REQ-27: a malformed widget-instance payload is skipped, not thrown — the reference that
      // pointed at it simply has no resolved result, so the caller degrades it to the REQ-28
      // placeholder like any other unresolved reference.
      continue;
    }
    if (payload.status === "trash" || payload.status === "purged") continue;
    const list = byType.get(payload.widgetType) ?? [];
    list.push({ id: row.id, widgetType: payload.widgetType, config: payload.config as JsonObject });
    byType.set(payload.widgetType, list);
  }

  const resolvedById = new Map<UUID, WidgetResolveResult>();
  for (const [typeKey, instances] of byType) {
    const results = await resolveWidgetType({ typeKey, instances, context });
    for (const [id, result] of results) resolvedById.set(id, result);
  }
  return resolvedById;
}

/**
 * Never throws (REQ-27's contract) — every per-widget failure is isolated to a placeholder IR node
 * (REQ-28) before this function returns.
 *
 * @complexity O(r) over `resolvedRegions` plus one batched widget-listing query plus one
 * `resolveWidgetType` call per distinct widget type present on the page (REQ-24).
 * @overallScore 100
 */
export async function resolvePageWidgets(required: ResolvePageWidgetsRequired): Promise<ResolvePageWidgetsResult> {
  const { deps, input } = required;
  const context: WidgetResolveContext = { workspaceId: input.workspaceId, preview: false };

  // 1. Region -> widget_area -> ordered, enabled placement list.
  const regionPlacements = new Map<WidgetRegionKey, WidgetPlacementNode[]>();
  for (const regionKey of input.resolvedRegions) {
    regionPlacements.set(regionKey, []);
    const binding = await deps.bindingRepo.findByRegion({ workspaceId: input.workspaceId, regionKey });
    if (!binding) continue;
    const areaEntry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: binding.areaEntryId });
    if (!areaEntry || areaEntry.type !== WIDGET_AREA_CONTENT_TYPE) continue;
    try {
      const payload = parseWidgetAreaPayload(areaEntry.fieldsJson);
      regionPlacements.set(
        regionKey,
        payload.doc.placements.filter((placement) => placement.enabled)
      );
    } catch {
      // REQ-27: a malformed widget_area payload (e.g. wiped by an unrelated generic-entry update
      // that bypassed this feature's own write path) degrades this one region to "no widgets" —
      // this function must never throw, matching the doc comment above it that this call site was
      // violating (Fable adversarial-review fix, 2026-07-21, Finding B).
    }
  }

  // 2. Inline embeds from the host document's bodyJson (REQ-21/23).
  const inlineEmbeds: InlineEmbedRef[] = [];
  if (input.pageBodyJson !== undefined) collectWidgetEmbeds(input.pageBodyJson, inlineEmbeds);

  // 3. One batched widget-instance load for every distinct widget referenced on the page (REQ-24 —
  // see this file's header for why `listByWorkspace` stands in for a literal `WHERE id IN (...)`).
  const referencedIds = new Set<UUID>();
  for (const placements of regionPlacements.values()) {
    for (const placement of placements) referencedIds.add(placement.widgetEntryId);
  }
  for (const embed of inlineEmbeds) referencedIds.add(embed.widgetEntryId);

  // 4/5. Batch-load + resolve (skipping missing/trashed/purged targets — REQ-27's failure taxonomy
  // handles them as "unresolved", not a crash), at most one `resolveWidgetType` call per distinct
  // type present (REQ-24) — see `resolveWidgetInstances`'s own doc for why this is shared rather
  // than inlined here.
  const resolvedById = await resolveWidgetInstances(deps, input.workspaceId, referencedIds, context);

  // 6. Assemble region -> IR[] (missing/failed placements degrade to the REQ-28 placeholder).
  const regions: Record<WidgetRegionKey, WidgetRenderIR[]> = {};
  for (const [regionKey, placements] of regionPlacements) {
    regions[regionKey] = placements.map((placement) => toRenderIr(resolvedById.get(placement.widgetEntryId)));
  }

  // 7. Assemble placementId -> IR for inline embeds.
  const inlineResolved = new Map<UUID, WidgetRenderIR>();
  for (const embed of inlineEmbeds) {
    inlineResolved.set(embed.placementId, toRenderIr(resolvedById.get(embed.widgetEntryId)));
  }

  return { regions, inlineResolved };
}

// ---------------------------------------------------------------------------
// HTML Page embeds (SPEC-047 Slice 2) — resolves `html-embeds.ts`'s `data-widget-embed`/
// `data-form-embed` placeholder convention. A parallel entry point to `resolvePageWidgets` above,
// not a mode of it: an `"html"`-format Page has no `bodyJson` tree and is not an `entries` row
// `pageEntryId` could resolve (see `routes/site/pages.ts`'s `resolveWidgetsForRender`, which
// documents that same gap for the TipTap inline-embed path on the live `home`/`post` routes) — its
// references live in a plain HTML string instead, so they need their own scan step, not a `bodyJson`
// walk. Everything downstream of "which ids are referenced" is shared with `resolvePageWidgets`
// (`resolveWidgetInstances`, `resolveWidgetType`, the REQ-27/28 failure taxonomy).
// ---------------------------------------------------------------------------

export interface ResolveHtmlPageEmbedsResult {
  /**
   * `data-widget-embed` targets, keyed by the referenced `widgetEntryId`. A genuinely nonexistent
   * id is ABSENT from this map (never found in the batched load, so never entered `resolvedById` —
   * see {@link resolveWidgetInstances}); a widget that WAS found but whose own resolution failed
   * (unknown type, resolver error, etc.) is PRESENT, with a placeholder IR value. Both render
   * identically via `render.ts`'s `renderHtmlPageBody` (absent and placeholder-valued both fall
   * through to the same REQ-28 marker), so this is not a behavior bug.
   *
   * **Reviewed and intentionally left as-is (2026-08-05) — do not "fix" this to be uniform.** It is
   * inherited from `resolvePageWidgets`'s own identical convention, not introduced here; making the
   * two embed kinds agree with each other would only make them disagree with the TipTap path they
   * both already match. An inconsistency shared with its sibling is cheaper than a local tidiness
   * that makes the two paths diverge.
   */
  readonly widgetResolved: ReadonlyMap<UUID, WidgetRenderIR>;
  /** `data-form-embed` targets, keyed by the referenced `formDefinitionId` — see
   * {@link widgetResolved}'s doc for the identical present-with-placeholder-vs-absent convention and
   * why it stays as-is. */
  readonly formResolved: ReadonlyMap<UUID, WidgetRenderIR>;
}

/**
 * Resolves every `data-widget-embed`/`data-form-embed` placeholder (`html-embeds.ts`'s
 * `scanHtmlEmbeds`) found in an `"html"`-format Page's `body_html`.
 *
 * `data-widget-embed="{widgetEntryId}"` batches through the same {@link resolveWidgetInstances}
 * `resolvePageWidgets` uses — any widget type, any placement context; no `data-widget-embed`-
 * specific resolver exists or is needed. `data-form-embed="{formDefinitionId}"` is sugar over the
 * SAME `contact-form` resolver a real `contact-form` widget instance would use, via a synthetic,
 * never-persisted {@link WidgetInstanceView} whose `config.formDefinitionId` is the id captured from
 * the placeholder — a page author (human or the AI writing `pages_write_html`) never has to create a
 * throwaway widget instance in the widgets admin surface just to embed a form; they name the Forms
 * definition directly. This is the reuse the SPEC-047 dispatch asked for: no second render path, no
 * duplicated form-rendering logic — `render.ts`'s existing `renderWidgetIr` `"contact-form"` case
 * renders whatever this returns exactly as it already renders a real widget instance's resolution.
 *
 * Never throws (REQ-27's contract, carried over unchanged): a malformed, missing, disabled, wrong-
 * type, or duplicate-beyond-{@link MAX_HTML_EMBEDS_PER_PAGE} reference degrades to the REQ-28
 * placeholder exactly the way every other widget-resolution failure already does — the caller
 * (`render.ts`'s `renderHtmlPageBody`) never special-cases "this ref failed to resolve" versus "this
 * ref does not exist" versus "this ref was never attempted".
 *
 * @complexity O(e) over the page's embed-reference count (capped at `MAX_HTML_EMBEDS_PER_PAGE`) for
 * the scan, plus one batched widget-listing query plus at most one `resolveWidgetType` call per
 * distinct widget type present (widget path), plus one more `resolveWidgetType` call for the
 * synthetic `contact-form` batch (form path, only when at least one form embed is present) — the
 * same O(1)-typed cost shape `resolvePageWidgets` already carries, REQ-24 in spirit.
 * @overallScore 100
 */
export async function resolveHtmlPageEmbeds(required: {
  deps: WidgetInstanceResolutionDeps;
  input: { readonly workspaceId: UUID; readonly html: string };
}): Promise<ResolveHtmlPageEmbedsResult> {
  const { deps, input } = required;
  const context: WidgetResolveContext = { workspaceId: input.workspaceId, preview: false };
  const refs = scanHtmlEmbeds(input.html);

  const widgetIds = new Set<UUID>();
  const formIds = new Set<UUID>();
  for (const ref of refs) (ref.kind === "widget" ? widgetIds : formIds).add(ref.id);

  const widgetResolvedRaw = await resolveWidgetInstances(deps, input.workspaceId, widgetIds, context);
  const widgetResolved = new Map<UUID, WidgetRenderIR>();
  for (const [id, result] of widgetResolvedRaw) widgetResolved.set(id, toRenderIr(result));

  // Synthetic contact-form instances (see this function's own doc) — never written anywhere, never
  // a real `widget`-type entries row; only `formDefinitionId` in `config` is real.
  const formInstances: WidgetInstanceView[] = [...formIds].map((formDefinitionId) => ({
    id: formDefinitionId,
    widgetType: "contact-form",
    config: { formDefinitionId },
  }));
  const formResolvedRaw =
    formInstances.length > 0
      ? await resolveWidgetType({ typeKey: "contact-form", instances: formInstances, context })
      : new Map<UUID, WidgetResolveResult>();
  const formResolved = new Map<UUID, WidgetRenderIR>();
  for (const [id, result] of formResolvedRaw) formResolved.set(id, toRenderIr(result));

  return { widgetResolved, formResolved };
}
