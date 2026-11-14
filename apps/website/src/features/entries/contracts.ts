/** Public entry read contracts and vocabulary; no repositories or registration wiring. */
import type { EntryRecord } from "@jini-ai/cms/entries";


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

/** Exclusion is applied before `limit` so system rows cannot crowd out visible entries. */
export type { EntryListExcludingTypesPort } from "@jini-ai/cms/widgets/resolvers";

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

