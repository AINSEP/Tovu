import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import type { InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildTrashRegistry } from "@jini-ai/cms/trash/site/registry";
import { InMemoryTrashRepo } from "@jini-ai/cms/trash";
import { SqliteTermRepo, SqliteTaxonomyRevisionRepo, SqliteTaxonomyRepo, SqliteEntryTermRepo } from "#src/features/taxonomy/repo.sqlite";
import { toTaxonomyOutbox } from "@jini-ai/cms/taxonomy";
import type { MemoryClock, MemoryIdGen } from "../ports.js";

export function composeTaxonomyTrashRepos(required: { taxonomyDb: ContentDb; workspaceId: string; outbox: InMemoryOutbox; clock: MemoryClock; idGen: MemoryIdGen }, _optional = {}) {
  const { taxonomyDb, workspaceId, outbox, clock, idGen } = required;
  // Mirror production permissions for the memory-backed forms, menus and widgets too: without
  // their registry entries the Trash routes report a hermetically trashed record as "forbidden"
  // and it can never be restored (F3469/F1868). Its writes still go through the in-memory adapter.
  const trashRegistry = new Map(
    [...buildTrashRegistry()].filter(([entityType]) =>
      ["term", "taxonomy", "form_submission", "form", "menu", "widget"].includes(entityType)
    )
  );
  const trashRepo = new InMemoryTrashRepo({});
  const taxonomyFollowUpTermRepo = new SqliteTermRepo({ db: taxonomyDb, workspaceId });
  const taxonomyFollowUpRevisions = new SqliteTaxonomyRevisionRepo({ db: taxonomyDb, workspaceId });
  const taxonomyFollowUpOutbox = toTaxonomyOutbox({ outbox, clock, idGen, workspaceId });
  const taxonomyRepo = new SqliteTaxonomyRepo({ db: taxonomyDb, workspaceId });
  const termRepo = new SqliteTermRepo({ db: taxonomyDb, workspaceId });
  const entryTermRepo = new SqliteEntryTermRepo({ db: taxonomyDb, workspaceId });
  const taxonomyRevisionRepo = new SqliteTaxonomyRevisionRepo({ db: taxonomyDb, workspaceId });
  return { trashRegistry, termRepo, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, taxonomyRepo, entryTermRepo, taxonomyRevisionRepo };
}
