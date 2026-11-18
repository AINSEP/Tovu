import type { TrashDb } from "#src/features/trash/index";
import { TRASH_TABLES } from "#src/features/trash/repo.sqlite";
import { createTableTrashAdapter } from "@jini-ai/cms/trash/sql";
import { createTaxonomyPurgeFollowUp, createTermPurgeFollowUp } from "#src/features/taxonomy/taxonomy-trash-follow-ups";
import { withFollowUps, type TrashAdapter, type TrashEntry } from "@jini-ai/cms/trash";

// The in-memory composition root's Trash adapters for taxonomy terms and taxonomies. Both are SQL table
// adapters over the root's lazy `:memory:` content db (it opens only on first use), with the same
// purge follow-ups the durable root attaches.

/** The follow-up ports both purge hooks read: the term repo, the Trash lookup, revisions, outbox, clock. */
export type TaxonomyFollowUpDeps = Parameters<typeof createTermPurgeFollowUp>[0] & Parameters<typeof createTaxonomyPurgeFollowUp>[0];

export interface MemoryTaxonomyTrashInput {
  entry: TrashEntry;
  db: TrashDb;
  followUps: TaxonomyFollowUpDeps;
}

export function memoryTermTrashAdapter(required: MemoryTaxonomyTrashInput, _optional = {}): TrashAdapter {
  const { entry, db, followUps } = required;
  return withFollowUps({
    adapter: createTableTrashAdapter({
      entry,
      kernel: db,
      tables: TRASH_TABLES,
    })
  }, createTermPurgeFollowUp(followUps));
}

export function memoryTaxonomyTrashAdapter(required: MemoryTaxonomyTrashInput, _optional = {}): TrashAdapter {
  const { entry, db, followUps } = required;
  return withFollowUps({
    adapter: createTableTrashAdapter({
      entry,
      kernel: db,
      tables: TRASH_TABLES,
    })
  }, createTaxonomyPurgeFollowUp(followUps));
}
