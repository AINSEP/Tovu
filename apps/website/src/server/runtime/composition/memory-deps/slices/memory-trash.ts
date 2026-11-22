import { createDirectoryTrashAdapter, unhideIfRemoveThrows } from "@jini-ai/cms/trash/adapters/directory";
import { PLUGIN_ENTITY_TYPE } from "@jini-ai/cms/trash/site/adapters/plugin";
import { reportDirectoryRollbackFailure } from "@jini-ai/cms/trash/site/directory-rollback-log";
import { forgetPluginActivations, type RemovePluginFn } from "@jini-ai/plugins/host";
import { composeMemoryTrashAdapters } from "../../memory-deps/slices/trash-adapters.js";
import { attachFormAttachmentPurge } from "../../memory-deps/slices/form-attachment-purge.js";
import { createTrashService, bindRemoveEntity } from "@jini-ai/cms/trash";
import { randomUUID } from "node:crypto";
import { TRASH_RETENTION_DAYS } from "@jini-ai/cms/trash/site/ports";
import { composePluginRuntime } from "../../plugin-runtime.js";
import { followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { MemoryClock, MemoryIdGen } from "../ports.js";
import type { composeTaxonomyTrashRepos } from "./taxonomy-trash-repos.js";
import type { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { InMemoryRedirectRepo } from "@jini-ai/cms/redirects";
import type { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import type { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import type { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import type { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";
import type { TrashDb } from "#src/features/trash/index";
import type { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import type { TrashAwareInMemoryMenuRepo } from "#src/features/navigation/trash-aware-memory-menu-repo";
import type { InMemoryNavLocationBindingRepo } from "#src/features/navigation/index";
import type { NewsletterRouteDeps } from "../../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

type TaxonomyTrashRepos = ReturnType<typeof composeTaxonomyTrashRepos>;

export interface MemoryTrashInput {
  pluginRuntime: ReturnType<typeof composePluginRuntime>;
  pluginActivationRepo: ReturnType<typeof followProviderActivations>;
  trashRegistry: TaxonomyTrashRepos["trashRegistry"];
  taxonomyFollowUpTermRepo: TaxonomyTrashRepos["taxonomyFollowUpTermRepo"];
  trashRepo: TaxonomyTrashRepos["trashRepo"];
  taxonomyFollowUpRevisions: TaxonomyTrashRepos["taxonomyFollowUpRevisions"];
  taxonomyFollowUpOutbox: TaxonomyTrashRepos["taxonomyFollowUpOutbox"];
  outbox: InMemoryOutbox;
  clock: MemoryClock;
  idGen: MemoryIdGen;
  postRepo: InMemoryPostRepo;
  redirectRepo: InMemoryRedirectRepo;
  commentRepo: InMemoryCommentRepo;
  mediaRepo: InMemoryVersionedMediaRepo;
  formSubmissionRepo: InMemoryFormSubmissionRepo;
  entryRepo: TrashAwareInMemoryEntryRepo;
  sqliteTrashDb: TrashDb;
  formDefinitionRepo: () => InMemoryFormDefinitionRepo;
  entryRefsRepo: () => InMemoryEntryRefsRepo;
  menuRepo: () => TrashAwareInMemoryMenuRepo;
  navLocationBindingRepo: () => InMemoryNavLocationBindingRepo;
  routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps;
}

export function composeMemoryTrash(required: MemoryTrashInput, _optional = {}) {
  const { pluginRuntime, pluginActivationRepo, trashRegistry, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, outbox, clock, idGen, postRepo, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, formDefinitionRepo, entryRefsRepo, menuRepo, navLocationBindingRepo, routeDeps } = required;
  const pluginTrashAdapter = createDirectoryTrashAdapter({
    entityType: PLUGIN_ENTITY_TYPE,
    locate: ({ entityId }) => pluginRuntime.locatePluginPackageDirs(entityId),
    forget: ({ entityId }) => forgetPluginActivations({ pluginId: entityId, deps: { repo: pluginActivationRepo } }),
  });
  const termTrashEntry = trashRegistry.get("term");
  const taxonomyTrashEntry = trashRegistry.get("taxonomy");
  const formTrashEntry = trashRegistry.get("form");
  if (!termTrashEntry || !taxonomyTrashEntry || !formTrashEntry) throw new Error("memory trash registry is missing a term, taxonomy, or form entry");
  const taxonomyFollowUps = { termRepo: taxonomyFollowUpTermRepo, trash: trashRepo, revisions: taxonomyFollowUpRevisions, outbox: taxonomyFollowUpOutbox, clock };
  const trashAdapters = composeMemoryTrashAdapters({
    pluginTrashAdapter, postRepo, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, trashRepo, entryRepo,
    formDefinitionRepo, entryRefsRepo,
    menuRepo, navLocationBindingRepo,
    term: { entry: termTrashEntry, db: sqliteTrashDb, followUps: taxonomyFollowUps },
    taxonomy: { entry: taxonomyTrashEntry, db: sqliteTrashDb, followUps: taxonomyFollowUps },
  });
  attachFormAttachmentPurge({ adapters: trashAdapters, formSubmissionRepo, mediaRepo, postRepo, clock, idGen, outbox, entryRefsRepo, routeDeps });
  const trash = createTrashService({
    repo: trashRepo,
    adapters: trashAdapters,
    idGen: { newId: () => randomUUID() },
    // Nothing here opens a database transaction, so the runner is a pass-through. The atomicity
    // guarantee this replaces is a SQLite one; an in-memory store has no partial-write window.
    transaction: ({ work }) => work(),
    entityPolicy: ({ entityType }) => (trashAdapters).has(entityType)
  }, {
    retentionDays: TRASH_RETENTION_DAYS,
    onError: ({ error }) => console.error("[trash] onChanged hook failed; the trash/restore/purge it followed already committed", error)
  });
  // Folder moves before the Trash row is written; if that write throws, move the folder back.
  const removePlugin: RemovePluginFn = unhideIfRemoveThrows({ onRollbackError: reportDirectoryRollbackFailure, adapter: pluginTrashAdapter, remove: bindRemoveEntity({
    trash,
    entityType: PLUGIN_ENTITY_TYPE
  }) });
  return { trash, trashAdapters, formTrashEntry, removePlugin };
}
