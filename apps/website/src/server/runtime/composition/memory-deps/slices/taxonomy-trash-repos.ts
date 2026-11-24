import { SqlTaxonomyRepo, SqlTermRepo, SqlEntryTermRepo, SqlTaxonomyRevisionRepo } from "@jini-ai/cms/taxonomy/sql";
import { TAXONOMY_TABLES } from "#src/platform/db/content-tables";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import type { ContentDb } from "#src/platform/db/sqlite/content-db";
import type { InMemoryOutbox } from "#src/contracts/core/events/index";
import { buildTrashRegistry } from "#src/features/trash/registry";
import { InMemoryTrashRepo } from "@jini-ai/cms/trash";
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
  const taxonomyFollowUpTermRepo = new SqlTermRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  const taxonomyFollowUpRevisions = new SqlTaxonomyRevisionRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  const taxonomyFollowUpOutbox = toTaxonomyOutbox({ outbox, clock, idGen, workspaceId });
  const taxonomyRepo = new SqlTaxonomyRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  const termRepo = new SqlTermRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  const entryTermRepo = new SqlEntryTermRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  const taxonomyRevisionRepo = new SqlTaxonomyRevisionRepo({ kernel: schemaErasedKernel({ store: taxonomyDb }), tables: TAXONOMY_TABLES, workspaceId }, {});
  return { trashRegistry, termRepo, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, taxonomyRepo, entryTermRepo, taxonomyRevisionRepo };
}
