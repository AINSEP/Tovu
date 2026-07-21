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
import type { JsonObject, UUID } from "../core/ports";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRepoPort } from "../features/entries/write-service";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload";
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

export interface ResolvePageWidgetsInput {
  readonly workspaceId: UUID;
  readonly pageEntryId?: UUID;
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
    const payload = parseWidgetAreaPayload(areaEntry.fieldsJson);
    regionPlacements.set(
      regionKey,
      payload.doc.placements.filter((placement) => placement.enabled)
    );
  }

  // 2. Inline embeds from the page entry's bodyJson (REQ-21/23).
  let inlineEmbeds: InlineEmbedRef[] = [];
  if (input.pageEntryId) {
    const pageEntry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.pageEntryId });
    if (pageEntry) collectWidgetEmbeds(pageEntry.bodyJson, inlineEmbeds);
  }

  // 3. One batched widget-instance load for every distinct widget referenced on the page (REQ-24 —
  // see this file's header for why `listByWorkspace` stands in for a literal `WHERE id IN (...)`).
  const referencedIds = new Set<UUID>();
  for (const placements of regionPlacements.values()) {
    for (const placement of placements) referencedIds.add(placement.widgetEntryId);
  }
  for (const embed of inlineEmbeds) referencedIds.add(embed.widgetEntryId);

  const widgetRows =
    referencedIds.size > 0 ? await deps.entryRepo.listByWorkspace({ workspaceId: input.workspaceId, type: WIDGET_CONTENT_TYPE }) : [];

  // 4. Build WidgetInstanceView list (skipping missing/trashed targets — REQ-27's failure taxonomy
  // handles them as "unresolved", not a crash), grouped by type.
  const byType = new Map<WidgetTypeKey, WidgetInstanceView[]>();
  for (const row of widgetRows) {
    if (!referencedIds.has(row.id)) continue;
    const payload = parseWidgetInstancePayload(row.fieldsJson);
    if (payload.status === "trash") continue;
    const list = byType.get(payload.widgetType) ?? [];
    list.push({ id: row.id, widgetType: payload.widgetType, config: payload.config as JsonObject });
    byType.set(payload.widgetType, list);
  }

  // 5. At most one resolveWidgetType (=> at most one resolveMany) call per distinct type (REQ-24).
  const resolvedById = new Map<UUID, WidgetResolveResult>();
  for (const [typeKey, instances] of byType) {
    const results = await resolveWidgetType(typeKey, instances, context);
    for (const [id, result] of results) resolvedById.set(id, result);
  }

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
