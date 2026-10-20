import { embedMarkerTarget, scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";
import { extractEntryRefs } from "#src/contracts/core/entry-refs/extractor";

import { collectMediaConfigKeys, collectReferencedMediaKeys } from "./media-references.js";
import type { PublishContentReference } from "./type-registry.js";

/**
 * @file What a packed body-bearing state (post, page, collection entry) uses, for plan G3's scoped
 * carry-along (`export-bundle.ts`'s `includeReferencedEntities`). Reads the existing parsers only:
 * - media: `media-references.ts` (`bodyJson` image/media nodes and URLs, `bodyHtml` media markers and
 *   `/m/` URLs, `seoExtJson` images);
 * - widgets: `widgetEmbed` nodes through `entry-refs/extractor.ts`'s `extractEntryRefs` (the walk that
 *   indexes `entry_refs`), and `bodyHtml` widget markers by `id ?? slug` through
 *   `embeds/marker.ts`'s `embedMarkerTarget` (the render resolver's own precedence);
 * - terms: the packed `termIds` (posts, pages and entries carry their categories/tags there).
 *
 * Not followed: `post`/`content`/`collection`/`menu` markers and menu links. They show OTHER content
 * rather than being part of this one, so publishing a page never silently publishes another page.
 */

/** Adds `{entityType, key}` once. @complexity O(1). */
function add(out: Map<string, PublishContentReference>, entityType: string, key: string): void {
  if (key.length > 0) out.set(`${entityType}:${key}`, { entityType, key });
}

/**
 * Every media, widget and term one packed post/page/entry state references. Pure; an unreadable
 * field contributes nothing, since a reference only ever ADDS to a run.
 *
 * @complexity O(n) in the total size of `bodyJson`, `bodyHtml` and `seoExtJson`.
 */
export function collectBodyReferences(state: Readonly<Record<string, unknown>>): readonly PublishContentReference[] {
  const out = new Map<string, PublishContentReference>();
  for (const key of collectReferencedMediaKeys(state)) add(out, "media", key);

  // Ids are only echoed onto the rows; nothing here reads them.
  const rows = extractEntryRefs({ workspaceId: "", sourceEntryId: "", sourceEntryType: "", bodyJson: state.bodyJson, fieldsExt: {} });
  for (const row of rows) if (row.sourceKind === "widget-embed") add(out, "widget", row.targetId);

  addHtmlWidgetReferences({ html: state.bodyHtml, out });
  addTermReferences({ termIds: state.termIds, out });
  return [...out.values()];
}

/**
 * The widgets a packed `widget-area` state places, through the same `extractEntryRefs` placement walk.
 *
 * @complexity O(p) in the placement count.
 */
export function collectPlacementReferences(state: Readonly<Record<string, unknown>>): readonly PublishContentReference[] {
  const rows = extractEntryRefs({ workspaceId: "", sourceEntryId: "", sourceEntryType: "", bodyJson: { placements: state.placements }, fieldsExt: {} });
  const out = new Map<string, PublishContentReference>();
  for (const row of rows) if (row.sourceKind === "widget-area-placement") add(out, "widget", row.targetId);
  addPlacementMediaReferences({ placements: state.placements, out });
  return [...out.values()];
}

function addHtmlWidgetReferences({ html, out }: { html: unknown; out: Map<string, PublishContentReference> }, _optional: Record<string, never> = {}): void {
  if (typeof html !== "string") return;
  for (const marker of scanEmbedMarkers({ html }).markers) {
    if (marker.type.toLowerCase() !== "widget") continue;
    const target = embedMarkerTarget({ type: marker.type, config: marker.config });
    if (target !== undefined && target.key !== "none") add(out, "widget", target.value);
  }
}

function addTermReferences({ termIds, out }: { termIds: unknown; out: Map<string, PublishContentReference> }, _optional: Record<string, never> = {}): void {
  if (!Array.isArray(termIds)) return;
  for (const id of termIds) if (typeof id === "string") add(out, "term", id);
}

function addPlacementMediaReferences({ placements, out }: { placements: unknown; out: Map<string, PublishContentReference> }, _optional: Record<string, never> = {}): void {
  if (!Array.isArray(placements)) return;
  for (const placement of placements) {
    if (typeof placement !== "object" || placement === null) continue;
    for (const key of collectMediaConfigKeys({ config: (placement as Record<string, unknown>).content })) add(out, "media", key);
  }
}
