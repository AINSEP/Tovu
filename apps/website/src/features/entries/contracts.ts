/** Public entry read contracts and vocabulary; no repositories or registration wiring. */
import type { EntryRecord, EntryStatus } from "@jini-ai/cms/entries";


/** Every collection-list presentation `theme/entry-list-render.ts` renders. `accordion` (an FAQ
 *  disclosure list) and `carousel` (a scroll-snap track of cards) were added for AW-7's zero-code
 *  Testimonials + FAQ plugin (2026-10-04). */
export const COLLECTION_LIST_LAYOUTS = ["cards", "list", "accordion", "carousel"] as const;
export type CollectionListLayout = (typeof COLLECTION_LIST_LAYOUTS)[number];

/** Whether `value` names a {@link COLLECTION_LIST_LAYOUTS} member. @complexity O(1) */
export function isCollectionListLayout(value: unknown): value is CollectionListLayout {
  return (COLLECTION_LIST_LAYOUTS as readonly unknown[]).includes(value);
}

/** The only structured-data block a collection list can opt into: schema.org `FAQPage`. */
export const COLLECTION_LIST_FAQ_PAGE = "faq-page";
export type CollectionListStructuredData = typeof COLLECTION_LIST_FAQ_PAGE;

/**
 * Review fix 3b (`2026-09-23-review-E4-R1-report.md`): the legacy (no-`collection`) Recent
 * Entries path used to run `EntryListPort.listByWorkspace` bounded to the registered clamp and
 * only THEN filter {@link SYSTEM_CONTENT_TYPES} rows out — so a batch of system rows newer than
 * real content could fill the limited query result and crowd out (or fully replace) the real
 * entries the widget should show. This port excludes those types INSIDE the query instead, so the
 * `limit` only ever counts rows that could actually be shown. It is a new, local port (not a
 * change to `@jini-ai/cms`'s `EntryListPort`) — both entry repos (`repo.sqlite.ts`,
 * `trash-aware-memory-repo.ts`) implement it structurally, the same pattern
 * {@link EntryDisplayListPort} already established for C2.
 */
export interface EntryListExcludingTypesPort {
  /** @returns non-trashed entries whose `type` is NOT one of `excludeTypes`, matching `status`
   * (when given), ordered by `orderBy`/`orderDirection`, bounded to `limit` — the exclusion is
   * applied before `limit`, never after. */
  listByWorkspaceExcludingTypes(params: {
    readonly workspaceId: string;
    readonly excludeTypes: readonly string[];
    readonly status?: EntryStatus;
    readonly orderBy?: "updatedAt";
    readonly orderDirection?: "asc" | "desc";
    readonly limit?: number;
  }): Promise<EntryRecord[]>;
}

/** An entry plus its Trash marker, as the Trash's record-store adapter sees it. */
export type TrashableEntryRecord = EntryRecord & { deletedAt: string | null };

/** Publish-content's entry read (`publish-content.ts`): the row plus its Trash marker, trashed rows
 *  included, so a precheck refuses a trashed destination instead of planning a create that `save`
 *  would then silently skip. */
export interface EntryPublishReadPort {
  findAnyById(params: { workspaceId: string; id: string }): Promise<TrashableEntryRecord | null>;
  /** The `(type, slug)` holder, trashed or not: the slug index spans the Trash, so a trashed holder
   *  still blocks a create and precheck must see it. */
  findAnyBySlug(params: { workspaceId: string; type: string; slug: string }): Promise<TrashableEntryRecord | null>;
}

