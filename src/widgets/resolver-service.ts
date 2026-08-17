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
import type { EntryListPort, EntryRepoPort } from "../features/entries";
import { CORE_PUBLIC_TRANSFORM_NAME } from "../media/bootstrap";
import { getLatestTransformDefinition } from "../media/index";
import type { MediaRepoPort, TransformDefinitionRepoPort } from "../media/index";
import type { PostRepoPort } from "../features/post/index";
import { findPublishedPostById } from "../features/post/index";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload";
import { scanHtmlEmbeds } from "./html-embeds";
import type { PageHtmlEmbedRef } from "./html-embeds";
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

/** `data-embed-type="widget"` batches through the same {@link resolveWidgetInstances}
 * `resolvePageWidgets` uses — any widget type, any placement context; no widget-embed-specific
 * resolver logic exists or is needed beyond this thin adapter. Behavior carried over unchanged from
 * the pre-restructuring `resolveHtmlPageEmbeds` widget path. */
async function resolveWidgetTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  const ids = new Set<UUID>();
  for (const ref of refs) {
    if (ref.id === null) {
      console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "widget" reference — missing or invalid "id" in data-embed-config', {
        workspaceId: context.workspaceId,
      });
      continue;
    }
    ids.add(ref.id);
  }

  const resolvedRaw = await resolveWidgetInstances(deps, context.workspaceId, ids, context);
  const resolved = new Map<string, WidgetRenderIR>();
  for (const [id, result] of resolvedRaw) resolved.set(id, toRenderIr(result));
  return resolved;
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
 * **Scope limitation versus the original implementation plan, disclosed rather than silently
 * narrowed.** The plan's step 3 called for dispatching by the asset's STORED MIME TYPE (image/
 * audio/video are "one media type", rendered differently per mime). `MediaRecord`
 * (`@jini-ai/cms/media`) has NO mime/contentType field — verified against the package's own
 * `media/types.d.ts` and `media/ports.d.ts`, not assumed: `contentType` exists only transiently in
 * `UploadMediaInput` at upload time and is never persisted onto the record `MediaRepoPort.findById`
 * returns. There is also no OTHER media-rendering precedent anywhere in this codebase to mirror —
 * the only existing one, `render.ts`'s TipTap `image` node case, is unconditionally image-only too.
 * Real mime-based dispatch would need a schema/persistence change outside this dispatch's scope, so
 * THIS resolver, like the rest of the codebase today, treats every `media` embed as an image.
 * Flagging for Coordinator/Architect review rather than either inventing a field that doesn't exist
 * or silently pretending the plan's dispatch-by-mime requirement was met.
 *
 * Never throws (REQ-27): a missing `mediaRepo`/`transformRepo` dependency, an id/name that fails
 * {@link isPlausibleMediaRefId}'s shape check, a nonexistent asset, or an unregistered transform name
 * all leave that ref's id absent from the returned map — `render.ts`'s `renderHtmlPageBody` degrades
 * an absent id to the REQ-28 placeholder exactly as it does for every other resolver here.
 *
 * @complexity O(e) over the media refs present (already capped at `MAX_HTML_EMBEDS_PER_PAGE`
 * upstream by `scanHtmlEmbeds`) — one `MediaRepoPort.findById` plus at most one
 * `getLatestTransformDefinition` call per ref, run concurrently via `Promise.all` (mirrors
 * `pages.ts`'s `resolveMediaAssetMetadataForRender`'s own per-asset `findById` fan-out — the same
 * frozen-no-batch-primitive situation `MediaRepoPort` discloses there).
 * @overallScore 100
 */
async function resolveMediaTypeEmbeds(
  refs: readonly PageHtmlEmbedRef[],
  deps: ResolveHtmlPageEmbedsDeps,
  context: WidgetResolveContext
): Promise<ReadonlyMap<string, WidgetRenderIR>> {
  const resolved = new Map<string, WidgetRenderIR>();
  const { mediaRepo, transformRepo } = deps;
  if (!mediaRepo || !transformRepo) {
    if (refs.length > 0) {
      console.warn(
        '[widgets] resolveHtmlPageEmbeds: "media" embeds present but no mediaRepo/transformRepo dependency was supplied — every occurrence degrades to the placeholder',
        { workspaceId: context.workspaceId, occurrences: refs.length }
      );
    }
    return resolved;
  }

  await Promise.all(
    refs.map(async (ref) => {
      const assetId = ref.id;
      const transformName = ref.variant ?? CORE_PUBLIC_TRANSFORM_NAME;
      if (assetId === null || !isPlausibleMediaRefId(assetId) || !isPlausibleMediaRefId(transformName)) {
        console.warn(
          '[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — missing or invalid "id"/"variant" in data-embed-config',
          { workspaceId: context.workspaceId }
        );
        return;
      }

      const record = await mediaRepo.findById({ workspaceId: context.workspaceId, id: assetId });
      if (!record) {
        console.warn('[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — no such asset', {
          workspaceId: context.workspaceId,
          assetId,
        });
        return;
      }

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
        return;
      }

      resolved.set(assetId, {
        componentId: "media-image",
        props: {
          assetId,
          transformName,
          version: definition.version,
          alt: record.alt,
          width: record.width,
          height: record.height,
          cssClass: record.cssClass,
        },
      });
    })
  );

  return resolved;
}

/** Scans a TipTap-shaped `bodyJson` tree for every ref-based `image` node's `assetId` (ADR-027 §4's
 *  `{assetId, transformName}` shape). Same walk shape as `routes/site/pages.ts`'s own
 *  `collectImageAssetIds`, duplicated rather than imported: that module sits above this one in the
 *  codebase's layering (this file's `resolveMediaTypeEmbeds`'s own doc discloses the same
 *  constraint for `render.ts`), and `pages.ts`'s copy is itself already a disclosed duplicate of
 *  `resolver-service.ts`'s per-id scan pattern for the same reason. A legacy `image` node (only
 *  `attrs.src`, no `assetId`) is never added — nothing here needs a sizing/version override for
 *  that shape. */
function collectImageAssetIds(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectImageAssetIds(child, out);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "image" && typeof obj.attrs === "object" && obj.attrs !== null) {
    const assetId = (obj.attrs as Record<string, unknown>).assetId;
    if (typeof assetId === "string") out.add(assetId);
  }
  if (Array.isArray(obj.content)) collectImageAssetIds(obj.content, out);
}

/**
 * Owner-reported bug (2026-08-12) — resolves the `mediaTransformVersions`/`mediaAssetMetadata`
 * context a "post-content" IR's embedded TipTap doc needs to render its OWN ref-based `image` nodes
 * as real pictures instead of the filename-labelled placeholder. Before this function existed,
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
 * @complexity O(a) over the distinct ref-based `assetId`s the body references, each behind one
 * `mediaRepo.findById` call, run concurrently via `Promise.all` alongside the single transform-
 * definition lookup — same shape `resolveMediaAssetMetadataForRender` and `resolveMediaTypeEmbeds`
 * both already use for their own per-asset fan-out.
 */
async function resolvePostContentMediaContext(
  deps: ResolveHtmlPageEmbedsDeps,
  bodyJson: JsonObject,
  context: WidgetResolveContext
): Promise<{ mediaTransformVersions: JsonObject; mediaAssetMetadata: JsonObject }> {
  const { mediaRepo, transformRepo } = deps;
  const assetIds = new Set<string>();
  collectImageAssetIds(bodyJson, assetIds);
  if (assetIds.size === 0 || !mediaRepo || !transformRepo) {
    return { mediaTransformVersions: {}, mediaAssetMetadata: {} };
  }

  const [definition, metaEntries] = await Promise.all([
    getLatestTransformDefinition({
      deps: { transformRepo },
      input: { workspaceId: context.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME },
    }),
    Promise.all(
      Array.from(assetIds).map(async (assetId): Promise<readonly [string, JsonObject] | undefined> => {
        const record = await mediaRepo.findById({ workspaceId: context.workspaceId, id: assetId });
        if (!record) return undefined;
        return [assetId, { width: record.width, height: record.height, cssClass: record.cssClass }] as const;
      })
    ),
  ]);

  return {
    mediaTransformVersions: definition ? { [CORE_PUBLIC_TRANSFORM_NAME]: definition.version } : {},
    mediaAssetMetadata: Object.fromEntries(metaEntries.filter((entry): entry is readonly [string, JsonObject] => entry !== undefined)),
  };
}

/**
 * `data-embed-type="post"` resolver — the post-template-picker feature (post-template.md's own
 * design conversation, first shipped 2026-08-10). `data-embed-id` is the post's stored id, exactly
 * like every other resolver here (never a slug — see this file's `media`/`widget` resolvers, which
 * are id-only too; kept consistent rather than adding a slug-lookup fallback for one type).
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
      const mediaContext = await resolvePostContentMediaContext(deps, post.bodyJson, context);
      resolved.set(ref.id, {
        componentId: "post-content",
        props: { title: post.title, slug: post.slug, updatedAt: post.updatedAt, bodyJson: post.bodyJson, ...mediaContext },
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
        const mediaContext = await resolvePostContentMediaContext(deps, pendingContentOverride.bodyJson, context);
        resolved.set(ref.id, {
          componentId: "post-content",
          props: {
            title: pendingContentOverride.title,
            slug: pendingContentOverride.slug,
            updatedAt: pendingContentOverride.updatedAt,
            bodyJson: pendingContentOverride.bodyJson,
            ...mediaContext,
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
      const mediaContext = await resolvePostContentMediaContext(deps, entity.bodyJson, context);
      resolved.set(ref.id, {
        componentId: "post-content",
        props: { title: entity.title, slug: entity.slug, updatedAt: entity.updatedAt, bodyJson: entity.bodyJson, ...mediaContext },
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
 */
const THEME_OWNED_MARKER_TYPES: ReadonlySet<string> = new Set(["partial", "menu"]);

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
