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
import type { EntryListPort, EntryRecord, EntryRepoPort } from "../entries/index.js";
import { CORE_PUBLIC_TRANSFORM_NAME, findMediaByIdOrSlug, getLatestTransformDefinition } from "../media/index.js";
import type { MediaContentTypeStorePort, MediaRepoPort, TransformDefinitionRepoPort } from "../media/index.js";
import type { PostRepoPort } from "../post/index.js";
import { findPublishedPostById } from "../post/index.js";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload.js";
import { scanHtmlEmbeds } from "./html-embeds.js";
import type { PageHtmlEmbedRef } from "./html-embeds.js";
import type { WidgetRegionBindingRepoPort } from "./ports.js";
import { resolveWidgetType } from "./resolvers/index.js";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "./types.js";
import type {
  WidgetInstanceView,
  WidgetPlacementNode,
  WidgetRegionKey,
  WidgetRenderIR,
  WidgetResolveContext,
  WidgetResolveResult,
  WidgetTypeKey,
} from "./types.js";

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
/** Parses one entries row into a {@link WidgetInstanceView}, or `null` when it should be skipped
 *  (REQ-27: a malformed payload, or an instance already trashed/purged). */
function parseWidgetInstanceRow(row: EntryRecord): WidgetInstanceView | null {
  let payload: ReturnType<typeof parseWidgetInstancePayload>;
  try {
    payload = parseWidgetInstancePayload(row.fieldsJson);
  } catch {
    // REQ-27: a malformed widget-instance payload is skipped, not thrown — the reference that
    // pointed at it simply has no resolved result, so the caller degrades it to the REQ-28
    // placeholder like any other unresolved reference.
    return null;
  }
  if (payload.status === "trash" || payload.status === "purged") return null;
  return { id: row.id, widgetType: payload.widgetType, config: payload.config as JsonObject };
}

/** Groups every referenced, resolvable widget row by its widget type (REQ-24's "one `resolveWidgetType`
 *  call per type" grouping step). */
function groupWidgetInstancesByType(
  widgetRows: readonly EntryRecord[],
  referencedIds: ReadonlySet<UUID>
): Map<WidgetTypeKey, WidgetInstanceView[]> {
  const byType = new Map<WidgetTypeKey, WidgetInstanceView[]>();
  for (const row of widgetRows) {
    if (!referencedIds.has(row.id)) continue;
    const instance = parseWidgetInstanceRow(row);
    if (!instance) continue;
    const list = byType.get(instance.widgetType) ?? [];
    list.push(instance);
    byType.set(instance.widgetType, list);
  }
  return byType;
}

async function resolveWidgetInstances(
  deps: WidgetInstanceResolutionDeps,
  workspaceId: UUID,
  referencedIds: ReadonlySet<UUID>,
  context: WidgetResolveContext
): Promise<ReadonlyMap<UUID, WidgetResolveResult>> {
  const widgetRows =
    referencedIds.size > 0 ? await deps.entryRepo.listByWorkspace({ workspaceId, type: WIDGET_CONTENT_TYPE }) : [];
  const byType = groupWidgetInstancesByType(widgetRows, referencedIds);

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
/** Step 1: region -> widget_area -> ordered, enabled placement list. A malformed widget_area
 *  payload or an unresolvable binding/area degrades that one region to "no widgets" (REQ-27) rather
 *  than throwing. */
async function resolveRegionPlacements(
  deps: ResolvePageWidgetsDeps,
  workspaceId: UUID,
  resolvedRegions: readonly WidgetRegionKey[]
): Promise<Map<WidgetRegionKey, WidgetPlacementNode[]>> {
  const regionPlacements = new Map<WidgetRegionKey, WidgetPlacementNode[]>();
  for (const regionKey of resolvedRegions) {
    regionPlacements.set(regionKey, []);
    const binding = await deps.bindingRepo.findByRegion({ workspaceId, regionKey });
    if (!binding) continue;
    const areaEntry = await deps.entryRepo.findById({ workspaceId, id: binding.areaEntryId });
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
  return regionPlacements;
}

/** Step 3: every distinct widget id referenced on the page, from BOTH region placements and inline
 *  embeds — the set `resolveWidgetInstances` batch-loads against (REQ-24). */
function collectReferencedWidgetIds(
  regionPlacements: ReadonlyMap<WidgetRegionKey, WidgetPlacementNode[]>,
  inlineEmbeds: readonly InlineEmbedRef[]
): Set<UUID> {
  const referencedIds = new Set<UUID>();
  for (const placements of regionPlacements.values()) {
    for (const placement of placements) referencedIds.add(placement.widgetEntryId);
  }
  for (const embed of inlineEmbeds) referencedIds.add(embed.widgetEntryId);
  return referencedIds;
}

export async function resolvePageWidgets(required: ResolvePageWidgetsRequired): Promise<ResolvePageWidgetsResult> {
  const { deps, input } = required;
  const context: WidgetResolveContext = { workspaceId: input.workspaceId, preview: false };

  const regionPlacements = await resolveRegionPlacements(deps, input.workspaceId, input.resolvedRegions);

  // 2. Inline embeds from the host document's bodyJson (REQ-21/23).
  const inlineEmbeds: InlineEmbedRef[] = [];
  if (input.pageBodyJson !== undefined) collectWidgetEmbeds(input.pageBodyJson, inlineEmbeds);

  // 3. One batched widget-instance load for every distinct widget referenced on the page (REQ-24 —
  // see this file's header for why `listByWorkspace` stands in for a literal `WHERE id IN (...)`).
  const referencedIds = collectReferencedWidgetIds(regionPlacements, inlineEmbeds);

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
  return { regions, inlineResolved: assembleInlineResolved(inlineEmbeds, resolvedById) };
}

/** placementId -> IR for every inline embed; a missing/trashed/failed widget degrades to the REQ-28
 *  placeholder IR. Shared by {@link resolvePageWidgets} and {@link resolvePostContentWidgetContext}. */
function assembleInlineResolved(
  inlineEmbeds: readonly InlineEmbedRef[],
  resolvedById: ReadonlyMap<UUID, WidgetResolveResult>
): Map<UUID, WidgetRenderIR> {
  const inlineResolved = new Map<UUID, WidgetRenderIR>();
  for (const embed of inlineEmbeds) {
    inlineResolved.set(embed.placementId, toRenderIr(resolvedById.get(embed.widgetEntryId)));
  }
  return inlineResolved;
}

// ---------------------------------------------------------------------------
// HTML Page embeds (SPEC-047 Slice 2, registry-restructured 2026-08-07 per
// `project-tovu-generic-embed-contract`) — resolves `html-embeds.ts`'s `data-embed-type`
// placeholder convention. A parallel entry point to `resolvePageWidgets` above, not a mode of it: an
// `"html"`-format Page has no `bodyJson` tree and is not an `entries` row `pageEntryId` could
// resolve (see `routes/site/pages.ts`'s `resolveWidgetsForRender`, which documents that same gap for
// the TipTap inline-embed path on the live `home`/`post` routes) — its references live in a plain
// HTML string instead, so they need their own scan step, not a `bodyJson` walk. Everything
// downstream of "which ids are referenced" is shared with `resolvePageWidgets`
// (`resolveWidgetInstances`, `resolveWidgetType`, the REQ-27/28 failure taxonomy).
// ---------------------------------------------------------------------------

/**
 * One embed type's resolver: given every {@link PageHtmlEmbedRef} of that type found on the page,
 * resolve as many as possible into a map keyed by the referenced id. A ref whose `id` is `null`
 * (missing or out-of-bounds `id` key in the marker config) can never be resolved — a resolver skips it and should
 * log a resolver-internal miss (see `HTML_EMBED_RESOLVERS`'s own doc for why this is a DIFFERENT log
 * line from "unknown embed type"). The returned map's "present-with-placeholder-vs-absent" shape
 * (a genuinely nonexistent target is ABSENT; a found-but-broken target is PRESENT with a placeholder
 * IR) mirrors {@link resolveWidgetInstances}'s own convention — both render identically via
 * `render.ts`'s `renderHtmlPageBody`, so this is not a behavior bug, same as the pre-restructuring
 * `widgetResolved`/`formResolved` shape this replaces.
 */
/**
 * `resolveHtmlPageEmbeds`'s full dependency set — a structural superset of
 * {@link WidgetInstanceResolutionDeps} (the `widget` resolver's own narrower need) plus the
 * OPTIONAL `mediaRepo`/`transformRepo` pair the `media` resolver needs. Optional, not required
 * (mirrors `PagesHtmlDocumentStoreDeps.entryRefsRepo`'s own "optional dependency" precedent), so
 * every pre-existing widget-only call site and test keeps compiling and behaving unchanged; a
 * `media` embed present with no `mediaRepo`/`transformRepo` supplied simply cannot resolve (logged,
 * degrades to the REQ-28 placeholder like any other unresolved reference) rather than forcing every
 * call site that never touches media to thread media dependencies through anyway.
 */
export interface ResolveHtmlPageEmbedsDeps extends WidgetInstanceResolutionDeps {
  readonly mediaRepo?: MediaRepoPort;
  readonly transformRepo?: TransformDefinitionRepoPort;
  readonly postRepo?: PostRepoPort;
  /**
   * Video/embed capability (2026-08-24) — optional, same "degrade gracefully when absent" contract
   * `mediaRepo`/`transformRepo` already have. When present, {@link resolveMediaTypeEmbeds} uses it
   * to tell a video asset from an image one (keyed by `MediaRecord.source.sha256`, the same key
   * `routes/admin/media/upload.ts` already records under). Absent (every pre-existing call site
   * before this feature, and any future one that never touches media) means every asset resolves as
   * an image exactly as it always has — this is additive, not a behavior change for images.
   */
  readonly mediaContentTypeStore?: MediaContentTypeStorePort;
  /**
   * Template-preview pending-body fix (2026-08-12) — an explicitly-passed, per-call override for
   * exactly one entity id's content, consulted ONLY by {@link resolveContentTypeEmbeds}. Lets
   * `routes/admin/posts/template-preview.ts` preview the operator's unsaved, in-editor `bodyJson`
   * through the real render pipeline: without this, the current entity's own `{"type":"content"}`
   * slot (`injectCurrentEntityContentId`) always re-fetches by id via {@link findPublishedPostById},
   * which returns the last-SAVED row and silently discards any in-memory override the caller built
   * (`ADS-memory/reports/implementation/2026-08-11-template-preview-render-bug.md` documents the
   * sibling `templateChoice`-only bug this closes the `bodyJson` half of).
   *
   * Deliberately per-call, never a shared/global/module-level cache — threaded fresh through this
   * `deps` object on every `resolveHtmlPageEmbeds` call, so two concurrent preview requests for
   * different posts (or the same post from two browser tabs) can never observe each other's pending
   * body. `undefined` for every pre-existing call site; behavior for those is byte-identical to
   * before this field existed.
   *
   * `title`/`slug`/`updatedAt` are carried alongside `bodyJson` because {@link resolveContentTypeEmbeds}'s
   * resolved `"post-content"` IR needs all four regardless of source — this is the same shape a real
   * `findPublishedPostById` result already provides, just supplied directly instead of fetched.
   */
  readonly pendingContentOverride?: {
    readonly id: UUID;
    readonly title: string;
    readonly slug: string;
    readonly updatedAt: string;
    readonly bodyJson: JsonObject;
  };
}

type HtmlEmbedResolver = (
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
) => Promise<ReadonlyMap<string, WidgetRenderIR>>;

/**
 * Resolves every DISTINCT `slug` among `refs` (id-less refs only — {@link resolveWidgetTypeEmbeds}
 * never consults `slug` when `id` is present, see that function's own doc) to its widget entry's real
 * id, via one {@link EntryRepoPort.findBySlug} call per distinct slug, run concurrently
 * (`Promise.all`) — mirrors `resolveMediaTypeEmbeds`'s own per-ref fan-out for a lookup this port has
 * no batch primitive for. A slug with no matching widget warns and is simply absent from the returned
 * map — {@link resolveWidgetTypeEmbeds} degrades that exactly like a nonexistent `id` (REQ-27/28's
 * never-throws, degrade-to-placeholder discipline, unchanged for this new lookup path).
 *
 * `entries_workspace_type_slug_unique` (`workspaceId, type, slug`) makes "more than one match"
 * structurally impossible — unlike the dormant `name` fallback's own design, which had to hedge
 * against ambiguity because nothing backed it with a real unique index. That is why this function has
 * no "zero or >1 matches -> placeholder" branch: zero is the only failure shape a `findBySlug` call
 * against a UNIQUE-constrained column can produce.
 *
 * @complexity O(s) over the distinct slugs present, one `findBySlug` call each, run concurrently.
 */
async function resolveWidgetSlugsToIds(
  slugRefs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, UUID>> {
  const distinctSlugs = new Set(slugRefs.map((ref) => ref.slug as string));
  const idBySlug = new Map<string, UUID>();

  await Promise.all(
    Array.from(distinctSlugs).map(async (slug) => {
      const entry = await deps.entryRepo.findBySlug({ workspaceId: context.workspaceId, type: WIDGET_CONTENT_TYPE, slug });
      if (!entry) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "widget" reference — no widget with that slug', {
          workspaceId: context.workspaceId,
          slug,
        });
        return;
      }
      idBySlug.set(slug, entry.id);
    })
  );

  return idBySlug;
}

/** `data-embed-type="widget"` batches through the same {@link resolveWidgetInstances}
 * `resolvePageWidgets` uses — any widget type, any placement context; no widget-embed-specific
 * resolver logic exists or is needed beyond this thin adapter (plus, as of 2026-08-31, the `slug`
 * lookup {@link resolveWidgetSlugsToIds} performs). Behavior for an `id`-carrying ref is carried over
 * unchanged from the pre-restructuring `resolveHtmlPageEmbeds` widget path.
 *
 * **`id` is authoritative when present; `slug` is consulted only for a ref with no `id` at all** —
 * matches `html-embeds.ts`'s own doc on the two keys. A ref's `slug` is resolved to a real entry id
 * FIRST, then folded into the SAME `ids` set the id-carrying refs already populate, so id- and
 * slug-addressed widgets share {@link resolveWidgetInstances}'s one batched `listByWorkspace` query
 * (REQ-24) rather than paying for a second one. The returned map is keyed by whatever the MARKER
 * itself carried (`ref.id` for an id-based ref, `ref.slug` for a slug-based one) — never by the
 * resolved id a slug-based ref never had in its own markup — because `render.ts`'s
 * `renderHtmlPageBody` looks results up using that same marker-authored key (`ref.id ?? ref.slug`);
 * see that function's own doc.
 *
 * @complexity O(r) over `refs`, plus {@link resolveWidgetSlugsToIds}'s own O(s) slug-lookup cost, plus
 * {@link resolveWidgetInstances}'s one batched query and at most one `resolveWidgetType` call per
 * distinct widget type present (REQ-24) — unchanged from before this function gained `slug` support.
 */
/** Every id {@link resolveWidgetInstances} must batch-load for `refs` — an id-carrying ref's own
 * `id` directly, plus every slug-carrying ref's resolved id (`idBySlug`) folded into the SAME set,
 * so id- and slug-addressed widgets share one batched query (REQ-24). Warns once per ref carrying
 * neither a usable `id` nor `slug` at all. Split out of {@link resolveWidgetTypeEmbeds} to keep that
 * function's own complexity low (Programmer workflow 5a3) — this loop is pure bookkeeping, not a
 * second decision. */
function collectWidgetIdsToLoad(
  refs: readonly PageHtmlEmbedRef[],
  idBySlug: ReadonlyMap<string, UUID>,
  context: WidgetResolveContext
): Set<UUID> {
  const ids = new Set<UUID>();
  for (const ref of refs) {
    if (ref.id !== null) {
      ids.add(ref.id);
    } else if (ref.slug === null) {
      console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "widget" reference — missing or invalid "id"/"slug" in data-embed-config', {
        workspaceId: context.workspaceId,
      });
    }
  }
  for (const id of idBySlug.values()) ids.add(id);
  return ids;
}

/** Builds the final result, keyed by whatever the MARKER itself carried (`ref.id` for an id-based
 * ref, `ref.slug` for a slug-based one — never the resolved id a slug-based ref never had in its own
 * markup, see {@link resolveWidgetTypeEmbeds}'s own doc for why). `resolvedRaw` only carries an entry
 * for an id that named a REAL, non-trashed widget row (`resolveWidgetInstances`'s own doc) — a
 * nonexistent id/slug must stay ABSENT from the result, never present-with-placeholder, preserving
 * this file's present-vs-absent convention (`resolveHtmlPageEmbeds`'s own doc) unchanged from before
 * `slug` support existed. Split out of {@link resolveWidgetTypeEmbeds} for the same complexity reason
 * as {@link collectWidgetIdsToLoad}. */
function buildResolvedWidgetMap(
  refs: readonly PageHtmlEmbedRef[],
  idBySlug: ReadonlyMap<string, UUID>,
  resolvedRaw: ReadonlyMap<UUID, WidgetResolveResult>
): Map<string, WidgetRenderIR> {
  const resolved = new Map<string, WidgetRenderIR>();
  for (const ref of refs) {
    const resolvedId = ref.id ?? (ref.slug !== null ? idBySlug.get(ref.slug) : undefined);
    const lookupKey = ref.id ?? ref.slug;
    if (resolvedId !== undefined && lookupKey !== null && resolvedRaw.has(resolvedId)) {
      resolved.set(lookupKey, toRenderIr(resolvedRaw.get(resolvedId)));
    }
  }
  return resolved;
}

async function resolveWidgetTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  const slugRefs = refs.filter((ref) => ref.id === null && ref.slug !== null);
  const idBySlug = await resolveWidgetSlugsToIds(slugRefs, deps, context);
  const ids = collectWidgetIdsToLoad(refs, idBySlug, context);
  const resolvedRaw = await resolveWidgetInstances(deps, context.workspaceId, ids, context);
  return buildResolvedWidgetMap(refs, idBySlug, resolvedRaw);
}

/** Mirrors `render.ts`'s own `MAX_MEDIA_REF_ID_LENGTH`/`PLAUSIBLE_MEDIA_REF_ID_PATTERN` shape check
 * for an `assetId`/`transformName` that will eventually become a `/m/` URL path segment —
 * duplicated here rather than imported for the same reason `core/entry-refs/extractor.ts`
 * duplicates `html-embeds.ts`'s scan pattern instead of importing it: `widgets/` (this file) must
 * not depend on `server/http/site/render.ts`, which sits above it in this codebase's layering. Both
 * copies guard the SAME hazard — this copy stops a malformed id/name from being used as a
 * repo-lookup key at resolve time; `render.ts`'s copy (`renderWidgetMediaImage`) re-checks
 * defense-in-depth immediately before URL templating. */
const MAX_MEDIA_REF_ID_LENGTH = 200;
const PLAUSIBLE_MEDIA_REF_ID_PATTERN = /^[^\s/]+$/;

function isPlausibleMediaRefId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_MEDIA_REF_ID_LENGTH && PLAUSIBLE_MEDIA_REF_ID_PATTERN.test(value);
}

/**
 * `data-embed-type="media"` resolver (SPEC-047, 2026-08-07) — NEW logic, not adapted from
 * `resolveWidgetType`: a media embed targets an assets-domain record (`MediaRepoPort`), never a
 * `widget`-type entries row, so it shares nothing with `resolveWidgetInstances`'s batching shape
 * beyond the same REQ-27/28 never-throws/degrade-to-absent discipline every resolver here follows.
 *
 * `data-embed-id` is the `assetId`; `data-embed-variant` is the transform name, defaulting to
 * {@link CORE_PUBLIC_TRANSFORM_NAME} (`"public"`, confirmed live against `media/bootstrap.ts`'s own
 * boot registration, not assumed from the plan doc) when the author omits `data-embed-variant`.
 * Builds the same `/m/{assetId}/{transformName}.v{version}/...` URL contract `render.ts`'s TipTap
 * `image` case already uses — this function only resolves the DATA (`{assetId, transformName,
 * version, alt, width, height, cssClass}`); `render.ts`'s `renderWidgetMediaImage`/`renderImageTag`
 * own the actual URL templating and escaping (the "reuse, don't reimplement" split this dispatch was
 * asked for, mirroring how `resolveWidgetTypeEmbeds` resolves data and `renderWidgetIr` renders it).
 *
 * **Scope limitation versus the original implementation plan — CLOSED for video, still open for
 * everything else (2026-08-24).** The plan's step 3 called for dispatching by the asset's STORED
 * MIME TYPE. `MediaRecord` (`@jini-ai/cms/media`) still has no mime/contentType field of its own —
 * that remains an upstream `@jini-ai/cms` gap, not fixed here — but this host now has a
 * Tovu-owned side channel for it: `mediaContentTypeStore` (`media/content-type-store.ts`), keyed by
 * `record.source.sha256`, already populated at upload time (`routes/admin/media/upload.ts`) for the
 * admin Media screen's own Images/Videos filter. When present and it knows the asset's type as
 * `video/*`, this resolver now skips the image-transform lookup entirely and resolves a `video`-kind
 * IR instead — `render.ts`'s `renderWidgetMediaImage` branches on it. Everything else (no store
 * supplied, a sha256 miss, or a non-video type) falls through to the exact image-only behavior this
 * resolver has always had. Audio is still unhandled — no audio player exists anywhere in this
 * codebase to dispatch to, and nothing in this pass's scope asked for one.
 *
 * Never throws (REQ-27): a missing `mediaRepo`/`transformRepo` dependency, an id/name that fails
 * {@link isPlausibleMediaRefId}'s shape check, a nonexistent asset, or an unregistered transform name
 * all leave that ref's id absent from the returned map — `render.ts`'s `renderHtmlPageBody` degrades
 * an absent id to the REQ-28 placeholder exactly as it does for every other resolver here.
 *
 * @complexity O(e) over the media refs present (already capped at `MAX_HTML_EMBEDS_PER_PAGE`
 * upstream by `scanHtmlEmbeds`) — one `MediaRepoPort.findById` plus, for a non-video asset, at most
 * one `getLatestTransformDefinition` call per ref, run concurrently via `Promise.all` (mirrors
 * `pages.ts`'s `resolveMediaAssetMetadataForRender`'s own per-asset `findById` fan-out — the same
 * frozen-no-batch-primitive situation `MediaRepoPort` discloses there). A video asset additionally
 * costs one `mediaContentTypeStore.getMany` call (single-element, same no-batch shape) but skips the
 * transform lookup entirely, so the per-ref cost never exceeds the pre-existing image path's.
 * @overallScore 100
 */
/** One resolved `MediaRepoPort.findById` row — inferred rather than imported since this file has no
 *  standing `MediaRecord` import (see `resolveMediaPublicUrls`'s own file for why `media/`'s public
 *  types stay narrow at each import site). */
type ResolvedMediaRecord = NonNullable<Awaited<ReturnType<MediaRepoPort["findById"]>>>;

/** Shape-narrows a media ref into a usable `{assetId, transformName}` pair, or `undefined` when the
 *  ref's `id`/`variant` fails {@link isPlausibleMediaRefId}'s check — split out of
 *  {@link resolveOneMediaEmbed} so that function's own branch count stays proportional to "which
 *  resolution step failed", not also this shape check. */
/**
 * T10 (2026-09-16 embed-attributes plan): `ref.id ?? ref.slug` — a `"media"` marker accepts a `slug`
 * the same way a `"widget"` marker already does ({@link resolveWidgetTypeEmbeds}'s own doc,
 * 2026-08-31): `id` wins when both are present and `slug` is never even consulted, matching
 * `resolveOneMediaEmbed`'s own doc on its `refAssetId` — the value returned here IS that map key, and
 * is passed straight into `findMediaByIdOrSlug`, which has always accepted either shape; only this
 * shape-check gate was missing it before. Named `assetId` still (not `idOrSlug`) since that field is
 * renamed at its one call site immediately.
 */
function parseMediaEmbedRef(
  ref: PageHtmlEmbedRef,
  context: WidgetResolveContext
): { assetId: string; transformName: string } | undefined {
  const assetId = ref.id ?? ref.slug;
  const transformName = ref.variant ?? CORE_PUBLIC_TRANSFORM_NAME;
  if (assetId === null || !isPlausibleMediaRefId(assetId) || !isPlausibleMediaRefId(transformName)) {
    console.warn(
      '[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — missing or invalid "id"/"slug"/"variant" in data-embed-config',
      { workspaceId: context.workspaceId }
    );
    return undefined;
  }
  return { assetId, transformName };
}

/** Builds the non-video (image-transform) IR for a resolved asset — the transform lookup + prop
 *  assembly {@link resolveOneMediaEmbed} defers to once it knows the asset isn't a video. `undefined`
 *  when `transformName` names no registered transform. */
async function buildMediaImageIr(
  assetId: string,
  transformName: string,
  transformRepo: TransformDefinitionRepoPort,
  record: ResolvedMediaRecord,
  context: WidgetResolveContext
): Promise<WidgetRenderIR | undefined> {
  const definition = await getLatestTransformDefinition({
    deps: { transformRepo },
    input: { workspaceId: context.workspaceId, name: transformName },
  });
  if (!definition) {
    console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — transform not registered', {
      workspaceId: context.workspaceId,
      assetId,
      transformName,
    });
    return undefined;
  }
  return {
    componentId: "media-image",
    props: {
      assetId,
      transformName,
      version: definition.version,
      alt: record.alt,
      width: record.width,
      height: record.height,
      cssClass: record.cssClass,
      htmlAttributes: record.htmlAttributes,
    },
  };
}

/** One media ref's resolved id + IR, or `undefined` when it could not be resolved — extracted so
 *  {@link resolveMediaTypeEmbeds}'s own `Promise.all` callback is a thin per-ref dispatch, never the
 *  decision itself. `mediaRepo`/`transformRepo` are passed non-optional here: the caller has already
 *  guarded their absence before ever constructing this per-ref work. */
async function resolveOneMediaEmbed(
  ref: PageHtmlEmbedRef,
  mediaRepo: MediaRepoPort,
  transformRepo: TransformDefinitionRepoPort,
  mediaContentTypeStore: MediaContentTypeStorePort | undefined,
  context: WidgetResolveContext
): Promise<{ assetId: string; ir: WidgetRenderIR } | undefined> {
  const parsed = parseMediaEmbedRef(ref, context);
  if (!parsed) return undefined;
  // `refAssetId` is exactly what the marker's `data-embed-id` says — a theme author may write
  // either the asset's `id` or its `slug` (2026-09-07). It stays the MAP KEY this function returns
  // (`resolveMediaTypeEmbeds`'s caller looks up the resolved map by the marker's own literal id, so
  // the key must match what was typed, not what it resolved to) — only the `props.assetId` used to
  // BUILD the served URL is normalized to the canonical `record.id` below, so a later slug rename
  // never breaks a URL already baked into previously-rendered HTML.
  const { assetId: refAssetId, transformName } = parsed;

  const record = await findMediaByIdOrSlug({ deps: { mediaRepo }, input: { workspaceId: context.workspaceId, idOrSlug: refAssetId } });
  if (!record) {
    console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — no such asset', {
      workspaceId: context.workspaceId,
      assetId: refAssetId,
    });
    return undefined;
  }
  const canonicalAssetId = record.id;

  const contentType = mediaContentTypeStore
    ? (await mediaContentTypeStore.getMany({ workspaceId: context.workspaceId, sha256s: [record.source.sha256] })).get(
        record.source.sha256
      )
    : undefined;
  if (contentType?.startsWith("video/")) {
    // Video needs no transform lookup at all: `render.ts`'s video branch points straight at
    // `/m/{assetId}/original` (the byte-passthrough route — see that route's own doc for why
    // video can't go through the image-transform pipeline below), so `transformName`/`version`
    // would be unused props for this IR.
    return {
      assetId: refAssetId,
      ir: {
        componentId: "media-image",
        props: {
          assetId: canonicalAssetId,
          contentType,
          alt: record.alt,
          width: record.width,
          height: record.height,
          cssClass: record.cssClass,
          htmlAttributes: record.htmlAttributes,
        },
      },
    };
  }

  const ir = await buildMediaImageIr(canonicalAssetId, transformName, transformRepo, record, context);
  return ir ? { assetId: refAssetId, ir } : undefined;
}

async function resolveMediaTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  const resolved = new Map<string, WidgetRenderIR>();
  const { mediaRepo, transformRepo, mediaContentTypeStore } = deps;
  if (!mediaRepo || !transformRepo) {
    if (refs.length > 0) {
      console.warn(
        '[widgets] resolveHtmlPageEmbeds: "media" embeds present but no mediaRepo/transformRepo dependency was supplied — every occurrence degrades to the placeholder',
        { workspaceId: context.workspaceId, occurrences: refs.length }
      );
    }
    return resolved;
  }

  const entries = await Promise.all(
    refs.map((ref) => resolveOneMediaEmbed(ref, mediaRepo, transformRepo, mediaContentTypeStore, context))
  );
  for (const entry of entries) {
    if (entry) resolved.set(entry.assetId, entry.ir);
  }

  return resolved;
}

/** Scans a TipTap-shaped `bodyJson` tree for every ref-based `image`/`media` node's `assetId`
 *  (ADR-027 §4's `{assetId, transformName}` shape) — both the legacy image-only ref shape and the
 *  generic `media` node (2026-09-11, `render.ts`'s `renderDocMedia`'s own doc) share this collection,
 *  since both key their sizing/content-type override off the SAME `mediaAssetMetadata` map by
 *  `assetId` alone. Widened 2026-09-11 (owner-reported, verifying the admin Preview-tab fix: a
 *  `media` node embedded in a post's body rendered as a placeholder through this exact
 *  "post-content" IR path, even with the asset/transform fine, because this collector only ever
 *  recognized `"image"`) to match `routes/site/pages.ts`'s own `collectMediaRefAssetIds`, which was
 *  widened the same day — renamed from `isRefBasedImageNode`/`collectImageAssetIds` accordingly. Same
 *  walk shape as that module's copy, still duplicated rather than imported: that module sits above
 *  this one in the codebase's layering (this file's `resolveMediaTypeEmbeds`'s own doc discloses the
 *  same constraint for `render.ts`). A legacy `image` node (only `attrs.src`, no `assetId`) is never
 *  added — nothing here needs a sizing/version override for that shape. */
/** A TipTap `image` or `media` node carrying the `{assetId, transformName}` ref shape (vs. a legacy
 *  `image` node's `attrs.src`-only shape, which `media` has no equivalent of at all — see this file's
 *  header on `Media`/`renderDocMedia` for why). */
function isRefBasedMediaNode(obj: Record<string, unknown>): obj is Record<string, unknown> & { attrs: Record<string, unknown> } {
  return (obj.type === "image" || obj.type === "media") && typeof obj.attrs === "object" && obj.attrs !== null;
}

function collectMediaRefAssetIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectMediaRefAssetIds(child, out);
    return;
  }
  if (typeof node !== "object" || node === null) return;

  const obj = node as Record<string, unknown>;
  if (isRefBasedMediaNode(obj)) {
    const assetId = obj.attrs.assetId;
    if (typeof assetId === "string") out.add(assetId);
  }
  if (Array.isArray(obj.content)) collectMediaRefAssetIds(obj.content, out);
}

/**
 * Owner-reported bug (2026-08-12, widened 2026-09-11 to also collect the generic `media` node — see
 * {@link collectMediaRefAssetIds}'s own doc) — resolves the `mediaTransformVersions`/
 * `mediaAssetMetadata` context a "post-content" IR's embedded TipTap doc needs to render its OWN
 * ref-based `image`/`media` nodes as real pictures instead of the filename-labelled placeholder.
 * Before this function existed,
 * NEITHER value was ever resolved for this render path at all: `render.ts`'s `renderWidgetPostContent`
 * called `renderDocNode(bodyJson)` with no media context, which silently defaults both to empty maps
 * — every ref-based image's transform lookup was unconditionally a miss, regardless of whether the
 * asset/transform genuinely existed (confirmed live: asset uploaded, `"public"` transform
 * registered, `/m/` rendition route returning 200 — and still a placeholder, because nothing upstream
 * ever looked any of that up for this render path). See `renderWidgetPostContent`'s own doc in
 * `render.ts` for the full trace.
 *
 * Mirrors `routes/site/pages.ts`'s `resolveMediaTransformVersionsForRender`/
 * `resolveMediaAssetMetadataForRender` — the identical resolution the generic (non-template) render
 * path already performs for `renderSite` — reusing THIS file's own `getLatestTransformDefinition`/
 * `mediaRepo.findById` primitives (already proven correct here by {@link resolveMediaTypeEmbeds}, the
 * sibling `"media"` embed resolver) rather than a third implementation of either lookup.
 *
 * Returns plain JSON, not `Map`s: `WidgetRenderIR.props` is a `JsonObject`, and this file must not
 * import `render.ts` (see this file's layering note above) to build a real `Map` and hand it across
 * that boundary directly. `render.ts`'s `readMediaTransformVersions`/`readMediaAssetMetadata`
 * reconstruct the `Map`s `renderDocNode` needs from this exact shape.
 *
 * Never throws (REQ-27, same discipline every resolver in this file follows): a `bodyJson` with no
 * ref-based images, or missing `mediaRepo`/`transformRepo` deps, resolves to empty objects —
 * `render.ts`'s `image` case already degrades an absent transform-version/metadata entry to the
 * placeholder, never a crash.
 *
 * Single-transform-name shortcut deliberately mirrored from `resolveMediaTransformVersionsForRender`
 * (not a per-node scan of every distinct `transformName` present): `registerTransform` has exactly
 * one caller anywhere in this codebase (`ensureCoreMediaTransform`), which only ever registers
 * {@link CORE_PUBLIC_TRANSFORM_NAME} — see that function's own doc for the full disclosure and what
 * widening this would take.
 *
 * Widened 2026-09-11 to also resolve `contentType` (`render.ts`'s `MediaAssetRenderMeta.contentType`'s
 * own doc), closing the gap that doc's own history section used to describe: this function's caller
 * is NOT limited to "a page embeds this post" — `routes/site/pages.ts`'s `renderViaTemplate` reaches
 * this same function (via `resolveContentTypeEmbeds`'s DB branch) for a post rendered at its OWN
 * public URL through a static-tier theme template, so a video asset in a post's own body was
 * silently rendering as `<img>` there too, not only when embedded into a page. Resolved via
 * `deps.mediaContentTypeStore`, keyed by the resolved record's `source.sha256` (the bytes' identity,
 * not the asset id) — the identical mechanism `resolveOneMediaEmbed` (this file's own sibling `media`
 * embed-type resolver) and `resolveMediaAssetMetadataForRender` (`routes/site/pages.ts`) both already
 * use, batched into ONE `getMany` call across every resolved asset rather than one call per asset
 * (that function's own shape, not `resolveOneMediaEmbed`'s per-ref shape, since this function already
 * gathers every ref up front). `mediaContentTypeStore` absent, or a sha256 with no recorded type,
 * both degrade `contentType` to `null` — read by `render.ts`'s `renderDocMedia` as "not video", never
 * a crash or a guess.
 *
 * @complexity O(a) over the distinct ref-based `assetId`s the body references, each behind one
 * `mediaRepo.findById` call, run concurrently via `Promise.all` alongside the single transform-
 * definition lookup — same shape `resolveMediaAssetMetadataForRender` and `resolveMediaTypeEmbeds`
 * both already use for their own per-asset fan-out — PLUS one further batched
 * `MediaContentTypeStorePort.getMany` call across every resolved asset's sha256 at once, run after
 * that fan-out resolves (its input is those results), mirroring `resolveMediaAssetMetadataForRender`'s
 * identical two-step shape.
 */
async function resolvePostContentMediaContext(
  deps: ResolveHtmlPageEmbedsDeps,
  bodyJson: JsonObject,
  context: WidgetResolveContext
): Promise<{ mediaTransformVersions: JsonObject; mediaAssetMetadata: JsonObject }> {
  const { mediaRepo, transformRepo, mediaContentTypeStore } = deps;
  const assetIds = new Set<string>();
  collectMediaRefAssetIds(bodyJson, assetIds);
  if (assetIds.size === 0 || !mediaRepo || !transformRepo) {
    return { mediaTransformVersions: {}, mediaAssetMetadata: {} };
  }

  const [definition, resolvedRecords] = await Promise.all([
    getLatestTransformDefinition({
      deps: { transformRepo },
      input: { workspaceId: context.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
    }),
    Promise.all(
      Array.from(assetIds).map(async (assetId): Promise<readonly [string, ResolvedMediaRecord] | undefined> => {
        const record = await mediaRepo.findById({ workspaceId: context.workspaceId, id: assetId });
        return record ? ([assetId, record] as const) : undefined;
      })
    ),
  ]);
  const found = resolvedRecords.filter((entry): entry is readonly [string, ResolvedMediaRecord] => entry !== undefined);

  const contentTypes =
    found.length > 0 && mediaContentTypeStore
      ? await mediaContentTypeStore.getMany({ workspaceId: context.workspaceId, sha256s: found.map(([, record]) => record.source.sha256) })
      : undefined;

  return {
    mediaTransformVersions: definition ? { [CORE_PUBLIC_TRANSFORM_NAME]: definition.version } : {},
    mediaAssetMetadata: Object.fromEntries(
      found.map(([assetId, record]) => [
        assetId,
        {
          width: record.width,
          height: record.height,
          cssClass: record.cssClass,
          htmlAttributes: record.htmlAttributes,
          contentType: contentTypes?.get(record.source.sha256) ?? null,
        },
      ])
    ),
  };
}

/**
 * Owner-reported bug (2026-09-22) — the inline-widget half of a "post-content" IR's render context,
 * the sibling of {@link resolvePostContentMediaContext}. A `widgetEmbed` node in the embedded body
 * used to render as the placeholder on every template-rendered post, because `render.ts`'s
 * `renderWidgetPostContent` had no `inlineResolved` map to look its `placementId` up in. Resolves
 * through the SAME `collectWidgetEmbeds`/`resolveWidgetInstances`/`assembleInlineResolved` chain
 * `resolvePageWidgets` uses for the non-template path, and returns plain JSON
 * (`placementId -> WidgetRenderIR`) for the same layering reason that function's doc gives;
 * `render.ts`'s `readInlineWidgets` rebuilds the `Map`.
 *
 * @complexity O(w) over the body's `widgetEmbed` nodes plus, only when there is at least one, one
 * batched widget-instance load and one `resolveWidgetType` call per distinct type (REQ-24).
 */
async function resolvePostContentWidgetContext(
  deps: ResolveHtmlPageEmbedsDeps,
  bodyJson: JsonObject,
  context: WidgetResolveContext
): Promise<{ inlineWidgets: JsonObject }> {
  const inlineEmbeds: InlineEmbedRef[] = [];
  collectWidgetEmbeds(bodyJson, inlineEmbeds);
  if (inlineEmbeds.length === 0) return { inlineWidgets: {} };
  const referencedIds = new Set(inlineEmbeds.map((embed) => embed.widgetEntryId));
  const resolvedById = await resolveWidgetInstances(deps, context.workspaceId, referencedIds, context);
  const inlineResolved = assembleInlineResolved(inlineEmbeds, resolvedById);
  return { inlineWidgets: Object.fromEntries(inlineResolved) as unknown as JsonObject };
}

/** Everything a "post-content" IR's embedded body needs to render beyond the body itself — media
 *  context plus inline widgets — spread into the IR's `props` by all three "post-content" builders. */
async function resolvePostContentRenderContext(
  deps: ResolveHtmlPageEmbedsDeps,
  bodyJson: JsonObject,
  context: WidgetResolveContext
): Promise<JsonObject> {
  const [mediaContext, widgetContext] = await Promise.all([
    resolvePostContentMediaContext(deps, bodyJson, context),
    resolvePostContentWidgetContext(deps, bodyJson, context),
  ]);
  return { ...mediaContext, ...widgetContext };
}

/**
 * `data-embed-type="post"` resolver — the post-template-picker feature (post-template.md's own
 * design conversation, first shipped 2026-08-10). `data-embed-id` is the post's stored id, exactly
 * like `media` (still id-only — no `slug` column exists to resolve against). `widget` gained a
 * `slug` fallback 2026-08-31 ({@link resolveWidgetTypeEmbeds}'s own doc) because `entries.slug` is
 * unique per `(workspaceId, type)`; `posts.slug` is equally unique (`posts_workspace_slug_unique`)
 * and `PostRepoPort.findBySlug` already exists, so `post`/`content` could gain the identical
 * treatment cheaply — deliberately left out of that pass to keep it scoped to the one type the
 * concrete ask (a form embed) needed; not a statement that slug support is wrong for these two.
 *
 * Returns RAW post data (title/bodyJson/updatedAt/slug), not rendered HTML — this file (`widgets/`)
 * must not depend on `server/http/site/render.ts` (that module sits above this one in the codebase's
 * layering, the same constraint `resolveMediaTypeEmbeds`'s own doc discloses for why it returns
 * `{assetId, transformName, ...}` instead of an `<img>` string). `render.ts`'s `renderWidgetIr`
 * `"post-content"` case (which already has `renderDocNode` in scope) does the actual TipTap-to-HTML
 * render from this data.
 *
 * A caller with no `postRepo` supplied (every pre-existing call site) behaves exactly like a `media`
 * embed with no `mediaRepo` — every occurrence degrades to the placeholder, logged once, not silently.
 *
 * **Visibility fix, 2026-08-11**: was `postRepo.findById` directly — `PostRepoPort.findById` is
 * trash- and status-BLIND by design (`post.ts`'s own doc on that port), so this resolver could
 * previously pull ANY row by id, including an unpublished draft or a trashed one, onto the public
 * site. That hole predates and is independent of this date's `content`-marker work, but is fixed
 * here alongside it (same file, same class of hazard, same fix already being built for
 * {@link resolveContentTypeEmbeds}'s guard) rather than left live next to a freshly-hardened sibling
 * resolver. See {@link findPublishedPostById}'s own doc for why this differs from the raw port call.
 */
async function resolvePostTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  const resolved = new Map<string, WidgetRenderIR>();
  const { postRepo } = deps;
  if (!postRepo) {
    if (refs.length > 0) {
      console.warn(
        '[widgets] resolveHtmlPageEmbeds: "post" embeds present but no postRepo dependency was supplied — every occurrence degrades to the placeholder',
        { workspaceId: context.workspaceId, occurrences: refs.length }
      );
    }
    return resolved;
  }

  await Promise.all(
    refs.map(async (ref) => {
      if (ref.id === null) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "post" reference — missing or invalid "id" in data-embed-config', {
          workspaceId: context.workspaceId,
        });
        return;
      }
      const post = await findPublishedPostById({ deps: { repo: postRepo }, input: { workspaceId: context.workspaceId, id: ref.id } });
      if (!post) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "post" reference — no such published post', {
          workspaceId: context.workspaceId,
          postId: ref.id,
        });
        return;
      }
      const renderContext = await resolvePostContentRenderContext(deps, post.bodyJson, context);
      resolved.set(ref.id, {
        componentId: "post-content",
        props: { title: post.title, slug: post.slug, updatedAt: post.updatedAt, bodyJson: post.bodyJson, ...renderContext },
      });
    })
  );

  return resolved;
}

/**
 * `data-embed-type="content"` resolver — the unified content marker's registry-owned half
 * (2026-08-11, `ADS-memory/reports/design/2026-08-11-unified-content-marker-and-templates.md`).
 * Handles `"doc"`-format targets ONLY: an `"html"`-format target's own body, and any FURTHER
 * `content` markers nested inside it, are fetched, recursively resolved, and spliced in BEFORE this
 * stage ever runs (`pages.ts`'s `resolveHtmlFormatContentMarkers` pre-pass, called ahead of
 * `resolveHtmlPageEmbeds` from the template render path) — by the time the shared marker scan reaches
 * this registry, an `html`-format reference has either already been consumed by that pre-pass or hit
 * its depth/budget guard (below). Either way there is nothing safe to do here but degrade to the
 * placeholder, same as any other unresolved reference: this resolver must never splice raw HTML
 * itself, which is exactly what would collapse guard 1's doc/html escaping split into one branchless
 * path (a TipTap doc renders through `renderDocNode`'s node-aware escaping; stored Page HTML is
 * spliced at the trust level `PagesHtmlDocumentStore`/`pages.edit_html` already assume for it — the
 * two must stay on separate code paths, never merged behind one generic "just render whatever this
 * is" function).
 *
 * Reuses the EXISTING `"post-content"` render IR (`renderWidgetPostContent` in `render.ts`) rather
 * than a new componentId: that function already renders ANY `{title, bodyJson, updatedAt}` bag
 * regardless of the source row's `kind` — nothing in it is Post-specific — so a `kind: "page"`
 * doc-format row (e.g. `our-story`) renders through the identical, already-vetted path a `kind:
 * "post"` row does. The `"post-content"` label itself is pre-existing and not renamed here (`render.ts`
 * is not in this change's file list); a follow-up rename to a kind-neutral label is low-priority tech
 * debt, disclosed rather than silently left unmentioned.
 *
 * Visibility-filtered via {@link findPublishedPostById} (guard 2, the highest-risk part of the
 * unified-marker design): an id supplied by an author, OR auto-filled by `injectCurrentEntityContentId`
 * for the entity the route already resolved, can in principle name ANY row — this is the one place in
 * the new marker's resolution chain that decides whether that row is allowed to reach the public page.
 *
 * `pendingContentOverride` (2026-08-12) bypasses this specific `findPublishedPostById` call, but NOT
 * the visibility guard's intent: it only ever matches ONE id — the exact row
 * `routes/admin/posts/template-preview.ts` already fetched (any status, but through its own
 * `content.read`-authorized, session-gated lookup) and is previewing back to the SAME authenticated
 * operator who owns that unsaved edit. It can never be used to inject content for a DIFFERENT id than
 * the one the caller resolved and authorized — see the override's own doc on
 * {@link ResolveHtmlPageEmbedsDeps.pendingContentOverride}.
 *
 * `ref.header` (2026-09-04, {@link PageHtmlEmbedRef.header}'s own doc) is threaded into IR
 * `props.header` unchanged in BOTH branches below — the DB lookup and the `pendingContentOverride`
 * short-circuit both read it off the SAME scanned `ref`. This value is only ever a STAGING default,
 * though, not what actually renders: `resolved` below is keyed by `ref.id`, one IR per id, so if the
 * same id is embedded twice with different `header` options the two `resolved.set` calls race and
 * one silently overwrites the other here — the `fc1a506a` bug (2026-09-05). `render.ts`'s
 * `renderHtmlPageBody`/`withOccurrenceHeader` is what actually makes this safe: it discards this
 * staged `header` and re-applies the CURRENT occurrence's own `ref.header` at substitution time,
 * where the real per-occurrence ref is available. See the `resolved` map's own comment immediately
 * below before adding another per-occurrence option here — the same collision reopens unless it
 * gets the same substitution-time treatment.
 *
 * @complexity O(e) over the `content` refs present (already capped upstream at
 * `MAX_HTML_EMBEDS_PER_PAGE`) — one `findPublishedPostById` call per ref not satisfied by
 * {@link ResolveHtmlPageEmbedsDeps.pendingContentOverride}, run concurrently via `Promise.all`,
 * mirroring every other resolver in this registry.
 */
async function resolveContentTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  // Keyed by `ref.id`, ONE staged IR per id — not per occurrence. Any prop set here from
  // occurrence-specific data (e.g. `header` in `props` below) is only a default: if the same id is
  // embedded more than once on a page with different per-occurrence options, the concurrent
  // `resolved.set` calls below race and whichever ref wins decides that prop for every occurrence,
  // silently dropping the others' — the exact bug `fc1a506a` (2026-09-05) fixed for `header`.
  // Occurrence-specific options must be re-applied at SUBSTITUTION time instead, where the real
  // per-occurrence `ref` is available (`render.ts`'s `renderHtmlPageBody`/`withOccurrenceHeader` is
  // `header`'s own fix); staging one here is fine only as long as every consumer of this Map applies
  // that same override for its own option.
  const resolved = new Map<string, WidgetRenderIR>();
  const { postRepo, pendingContentOverride } = deps;
  if (!postRepo && !pendingContentOverride) {
    if (refs.length > 0) {
      console.warn(
        '[widgets] resolveHtmlPageEmbeds: "content" embeds present but no postRepo dependency was supplied — every occurrence degrades to the placeholder',
        { workspaceId: context.workspaceId, occurrences: refs.length }
      );
    }
    return resolved;
  }

  await Promise.all(
    refs.map(async (ref) => {
      if (ref.id === null) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "content" reference — missing or invalid "id" in data-embed-config', {
          workspaceId: context.workspaceId,
        });
        return;
      }

      // Preview override, checked BEFORE any DB call (see `pendingContentOverride`'s own doc):
      // the operator's pending, unsaved body for this exact id, never a fetch. Routes through the
      // identical `"post-content"` IR/props shape the DB branch below builds, so this substitutes
      // only the DATA SOURCE — every downstream render/sanitization step (`render.ts`'s
      // `renderWidgetPostContent` -> `renderDocNode`) is the SAME code the saved-body path runs,
      // never a second, parallel render path with its own escaping rules.
      if (pendingContentOverride && ref.id === pendingContentOverride.id) {
        const renderContext = await resolvePostContentRenderContext(deps, pendingContentOverride.bodyJson, context);
        resolved.set(ref.id, {
          componentId: "post-content",
          props: {
            title: pendingContentOverride.title,
            slug: pendingContentOverride.slug,
            updatedAt: pendingContentOverride.updatedAt,
            bodyJson: pendingContentOverride.bodyJson,
            header: ref.header,
            ...renderContext,
          },
        });
        return;
      }

      // No DB source for this id (postRepo absent) and it didn't match the override above: nothing
      // safe to do but leave it unresolved — degrades to the REQ-28 placeholder like any other miss.
      if (!postRepo) return;

      const entity = await findPublishedPostById({ deps: { repo: postRepo }, input: { workspaceId: context.workspaceId, id: ref.id } });
      if (!entity) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "content" reference — no such published entity', {
          workspaceId: context.workspaceId,
          entityId: ref.id,
        });
        return;
      }
      if (entity.bodyFormat === "html") {
        console.warn(
          '[widgets] resolveHtmlPageEmbeds: unresolved "content" reference — html-format entity reached the registry resolver instead of the recursive pre-splice pass (depth/budget guard, or a direct reference outside a template render)',
          { workspaceId: context.workspaceId, entityId: ref.id }
        );
        return;
      }
      const renderContext = await resolvePostContentRenderContext(deps, entity.bodyJson, context);
      resolved.set(ref.id, {
        componentId: "post-content",
        props: {
          title: entity.title,
          slug: entity.slug,
          updatedAt: entity.updatedAt,
          bodyJson: entity.bodyJson,
          header: ref.header,
          ...renderContext,
        },
      });
    })
  );

  return resolved;
}

/**
 * Registry of known embed types (SPEC-047, generalized 2026-08-07). Adding a new embed type is
 * registering one more entry here — no other file in `resolveHtmlPageEmbeds`'s call chain changes,
 * and `html-embeds.ts`'s scanner already reports any type token it finds regardless of whether an
 * entry exists here (see that file's own doc). A type ABSENT from this registry is the "unknown
 * embed type" log path in {@link resolveHtmlPageEmbeds}; a type PRESENT here whose resolver still
 * can't find a given id/name is the "resolver-internal miss" log path inside that resolver
 * (`resolveWidgetTypeEmbeds`/`resolveMediaTypeEmbeds` above) — DECIDED (2026-08-07) to keep these
 * two distinguishable in logs even though both render the identical REQ-28 placeholder externally:
 * an author's markup typo (unknown type) and an author's stale reference (known type, dead id) are
 * different problems needing different fixes.
 *
 * **`form` was a registered type here until 2026-08-10 and is deliberately gone** — see
 * `development/docs/architecture/embed-type-inventory.md`. It never named a distinct capability: its
 * resolver built a synthetic, never-persisted `contact-form` {@link WidgetInstanceView} and routed it
 * through the same `resolveWidgetType` a real `contact-form` widget instance already used. That is
 * shorthand, not a mechanism, and it cost a permanent second spelling for every reference in the
 * marker vocabulary, the `entry_refs` index, and every consumer's type switch. `contact-form` remains
 * a first-class WIDGET type and `src/forms/` is untouched; embedding a form is
 * `{"type":"widget","id":"<contact-form widget entry id>"}`.
 */
const HTML_EMBED_RESOLVERS: Readonly<Record<string, HtmlEmbedResolver>> = {
  widget: resolveWidgetTypeEmbeds,
  media: resolveMediaTypeEmbeds,
  post: resolvePostTypeEmbeds,
  content: resolveContentTypeEmbeds,
};

/**
 * Marker types that exist in the shared `data-embed-config` vocabulary (`core/embeds/marker.ts`) but
 * are deliberately absent from {@link HTML_EMBED_RESOLVERS} — a theme's own structural markers, owned
 * end-to-end by `features/theme/static-render.ts`'s `resolveSlots` (`"partial"`) and
 * `injectMenuEmbeds` (`"menu"`), which run AFTER this stage on every static-tier page render
 * (`routes/site/pages.ts`'s `renderViaTemplate`: `resolveHtmlPageEmbeds` first, then
 * `renderStaticPage`). `isPageEmbedType`'s own doc already tells `render.ts`'s `renderHtmlPageBody` to
 * leave these two untouched rather than substitute a placeholder over the nav — that fixed the
 * SUBSTITUTION half of "this stage sees markers it does not own" (2026-08-10). This constant fixes the
 * matching LOGGING half, which that earlier fix did not touch.
 *
 * Without this, {@link resolveHtmlPageEmbeds}'s "unknown embed type" warning fired for `menu`/`partial`
 * on every single static-tier render — confirmed live during the 2026-08-16 GitHub Pages export
 * (`gh-pages` commit `c0e52de2`, https://leonaburime-ucla.github.io/tovu-demo/): the log claimed "every
 * occurrence degrades to the placeholder," which was false — curling the published page showed real,
 * resolved `<a href>` links in both the nav and footer, zero placeholder markup anywhere. The page was
 * never broken; only the diagnostic was. Left uncorrected, that false alarm fires on every render and
 * trains a reader to ignore this log line, burying the ONE case it exists to catch: an author's actual
 * markup typo (`HTML_EMBED_RESOLVERS`'s own doc on why "unknown type" and "known type, dead id" must
 * stay distinguishable applies equally to "known-and-owned-elsewhere" vs. "owned nowhere").
 *
 * A type in this set must stay absent from `HTML_EMBED_RESOLVERS` — do not "fix" the warning by adding
 * a resolver entry instead; see `isPageEmbedType`'s own doc for why that would reintroduce the
 * substitution bug this file already fixed once.
 *
 * **Why this isn't just `!isPageEmbedType(type)`.** `isPageEmbedType` is `Object.hasOwn(HTML_EMBED_RESOLVERS,
 * type)` — exactly the same fact this loop's own `HTML_EMBED_RESOLVERS[type]` lookup already tests, one
 * bit: "is this resolver-service's own type." That bit is `false` for `partial`/`menu` AND for a genuine
 * unregistered/typo type alike, so it cannot distinguish "known, owned by a later stage" from "owned
 * nowhere" — using it to gate the warning would silence the ONE case the warning exists for, not just
 * the two it shouldn't fire for. This set names the missing fact directly instead. It intentionally
 * duplicates `static-render.ts`'s own `marker.type !== "menu"`/`!== "partial"` literals rather than
 * importing them (that file is a different feature's territory in this change's dispatch) — the real
 * fix, hoisting a shared constant into `core/embeds/marker.ts` for both files to import, is proposed but
 * not yet authorized; see `ADS-memory/reports/2026-08-16-embed-placeholder-gap.md`'s "Reuse decision"
 * section. Keep this set's members in sync with those two literals, not with `isPageEmbedType`.
 *
 * `"post-previews"` (2026-09-03) joins the set for the identical reason: it is resolved by
 * `static-render.ts`'s `injectPostPreviewsEmbeds`, AFTER this stage, on every static-tier page
 * render that reaches `renderStaticPage` — same duplicated-literal debt as the other two entries
 * (see `POST_PREVIEWS_MARKER_TYPE`, `core/embeds/marker.ts`), not yet hoisted for the same reason.
 */
const THEME_OWNED_MARKER_TYPES: ReadonlySet<string> = new Set(["partial", "menu", "post-previews"]);

/**
 * Does the page-embed stage OWN this marker type — i.e. is a REQ-28 placeholder the honest answer
 * when it fails to resolve?
 *
 * This question did not exist before the 2026-08-10 marker unification, and its absence was a real
 * bug for exactly as long as the unification was half-done. `html-embeds.ts` used to match only an
 * empty `<div data-embed-type="…">`, so a theme's own `partial`/`menu` markers were INVISIBLE to
 * this stage — "unknown type" could only ever mean an author's typo, and rendering the REQ-28
 * placeholder for it was right. Sharing one permissive parser made every marker visible to every
 * consumer, so `renderHtmlPageBody` began substituting placeholders over the nav, the docs menu, and
 * the footer of any post rendered through a theme template — three markers a LATER stage
 * (`static-render.ts`'s `resolveSlots`/`injectMenuEmbeds`) owns and would have resolved.
 *
 * So ownership must be asked of this registry, never inferred from "did resolution produce
 * anything". A type present here that failed to resolve still degrades to the placeholder — that is
 * REQ-28 and unchanged. A type absent from here is not this stage's to render OR to blank: it is
 * left exactly as authored, which is the shared parser's own "unresolved means untouched" invariant.
 *
 * The cost of being wrong is asymmetric and that is why the default is untouched: a marker wrongly
 * left alone is visible in the output the moment anyone looks at the page, while a marker wrongly
 * replaced is a silently-deleted nav that renders as a tidy, plausible page with a hole in it.
 */
export function isPageEmbedType(type: string): boolean {
  return Object.hasOwn(HTML_EMBED_RESOLVERS, type);
}

/**
 * Resolved embed IR, keyed by embed type then by the referenced id (`resolved.get(ref.type)?.get(
 * ref.id)`). A type absent from the outer map means either nothing of that type was found on the
 * page or the type has no registered resolver (`render.ts`'s `renderHtmlPageBody` treats both
 * identically — a REQ-28 placeholder, per this file's `HTML_EMBED_RESOLVERS` doc).
 */
export type ResolveHtmlPageEmbedsResult = ReadonlyMap<string, ReadonlyMap<string, WidgetRenderIR>>;

/**
 * Resolves every `data-embed-type` placeholder (`html-embeds.ts`'s `scanHtmlEmbeds`) found in an
 * `"html"`-format Page's `body_html`, dispatching each embed type to its registered resolver in
 * {@link HTML_EMBED_RESOLVERS}.
 *
 * Never throws (REQ-27's contract, carried over unchanged): a malformed, missing, disabled, wrong-
 * type, unknown-type, or duplicate-beyond-{@link MAX_HTML_EMBEDS_PER_PAGE} reference degrades to the
 * REQ-28 placeholder exactly the way every other widget-resolution failure already does — the caller
 * (`render.ts`'s `renderHtmlPageBody`) never special-cases "this ref failed to resolve" versus "this
 * ref does not exist" versus "this ref was never attempted" — **for a type this stage owns**
 * ({@link HTML_EMBED_RESOLVERS}). A type it deliberately does not own ({@link THEME_OWNED_MARKER_TYPES})
 * is absent from the returned map for a different reason and reaches a different outcome downstream:
 * `renderHtmlPageBody`'s `isPageEmbedType` check leaves that marker untouched for `static-render.ts`'s
 * later pass to resolve, not a placeholder. Do not read "absent from this map" as "renders as a
 * placeholder" — that conflation is exactly what made this stage's own logging misleading (see
 * `THEME_OWNED_MARKER_TYPES`'s doc for the live incident this caused).
 *
 * @complexity O(e) over the page's embed-reference count (capped at `MAX_HTML_EMBEDS_PER_PAGE`) for
 * the scan plus grouping, plus each registered type present incurring its own resolver's cost (the
 * widget path: one batched widget-listing query plus at most one `resolveWidgetType` call per
 * distinct widget type) — the same O(1)-typed per-type cost shape the pre-restructuring function
 * already carried, REQ-24 in spirit.
 * @overallScore 100
 */
export async function resolveHtmlPageEmbeds(required: {
  deps: ResolveHtmlPageEmbedsDeps;
  input: { readonly workspaceId: UUID; readonly html: string };
}): Promise<ResolveHtmlPageEmbedsResult> {
  const { deps, input } = required;
  const context: WidgetResolveContext = { workspaceId: input.workspaceId, preview: false };
  const refs = scanHtmlEmbeds(input.html);

  const refsByType = new Map<string, PageHtmlEmbedRef[]>();
  for (const ref of refs) {
    const list = refsByType.get(ref.type) ?? [];
    list.push(ref);
    refsByType.set(ref.type, list);
  }

  const result = new Map<string, ReadonlyMap<string, WidgetRenderIR>>();
  for (const [type, typeRefs] of refsByType) {
    const resolver = HTML_EMBED_RESOLVERS[type];
    if (!resolver) {
      // A theme-structural type (`menu`/`partial`) is not a failure at THIS stage — it is deferred,
      // by design, to `static-render.ts`'s later pass (see `THEME_OWNED_MARKER_TYPES`'s own doc). Only
      // a type genuinely unowned anywhere is worth the loud warning.
      if (!THEME_OWNED_MARKER_TYPES.has(type)) {
        console.warn("[widgets] resolveHtmlPageEmbeds: unknown embed type, every occurrence degrades to the placeholder", {
          type,
          workspaceId: input.workspaceId,
          occurrences: typeRefs.length,
        });
      }
      continue;
    }
    result.set(type, await resolver(typeRefs, deps, context));
  }
  return result;
}
