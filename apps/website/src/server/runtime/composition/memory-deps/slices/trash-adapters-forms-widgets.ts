import { createRecordStoreTrashAdapter, type InMemoryTrashRepo, type TrashAdapter } from "@jini-ai/cms/trash";
import type { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo, StoredFormSubmission } from "@jini-ai/cms/forms";
import type { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import type { TrashAwareInMemoryEntryRepo, TrashableEntryRecord } from "#src/features/entries/trash-aware-memory-repo";
import type { InMemoryNavLocationBindingRepo } from "#src/features/navigation/index";
import type { TrashAwareInMemoryMenuRepo, TrashableMenuRecord } from "#src/features/navigation/trash-aware-memory-menu-repo";

// The in-memory composition root's Trash adapters for forms, form submissions, widgets and menus.
// A repo the root declares AFTER the trash map is passed as a getter: the adapters read it only inside
// their callbacks, which run after composition finishes, so an eager value would be a TDZ error.

export function memoryFormTrashAdapter(required: { formDefinitionRepo: () => InMemoryFormDefinitionRepo; formSubmissionRepo: InMemoryFormSubmissionRepo; trashRepo: InMemoryTrashRepo }, _optional = {}): TrashAdapter {
  const { formDefinitionRepo, formSubmissionRepo, trashRepo } = required;
  return createRecordStoreTrashAdapter({
    entityType: "form",
    store: {
      findById: (required) => formDefinitionRepo().findAnyById(required),
      save: ({ record }) => formDefinitionRepo().save(record),
    },
    isHidden: ({ record }) => record.deletedAt !== null,
    hidden: ({ record, at }) => ({ ...record, deletedAt: at }),
    shown: ({ record }) => ({ ...record, deletedAt: null }),
  }, {
    // Match the durable adapter's cascade, including independently trashed submissions' index rows.
    hardDelete: async ({ workspaceId, id }) => {
      const submissions = await formSubmissionRepo.listAllForDefinition({ workspaceId, formDefinitionId: id });
      for (const submission of submissions) {
        await trashRepo.deleteByEntity({ workspaceId, entityType: "form_submission", entityId: submission.id });
      }
      await formSubmissionRepo.deleteAllForDefinition({ workspaceId, formDefinitionId: id });
      await formDefinitionRepo().hardDelete({ workspaceId, id });
    },
  });
}

export function memoryFormSubmissionTrashAdapter(required: { formSubmissionRepo: InMemoryFormSubmissionRepo }, _optional = {}): TrashAdapter {
  const { formSubmissionRepo } = required;
  return createRecordStoreTrashAdapter<StoredFormSubmission>({
    entityType: "form_submission",
    // The repo's trash-blind, memory-only seam — its port reads hide a trashed submission.
    store: {
      findById: (required) => formSubmissionRepo.findAnyById(required),
      save: ({ record }) => formSubmissionRepo.save(record)
    },
    isHidden: ({ record }) => record.deletedAt !== null,
    hidden: ({ record, at }) => ({
      ...record,
      deletedAt: at
    }),
    shown: ({ record }) => ({
      ...record,
      deletedAt: null
    })
  }, {
    hardDelete: (required) => formSubmissionRepo.hardDelete(required)
  });
}

export function memoryWidgetTrashAdapter(required: { entryRepo: TrashAwareInMemoryEntryRepo; entryRefsRepo: () => InMemoryEntryRefsRepo }, _optional = {}): TrashAdapter {
  const { entryRepo, entryRefsRepo } = required;
  return createRecordStoreTrashAdapter<TrashableEntryRecord>({
    entityType: "widget",
    // The repo's trash-blind seam — its port reads hide a trashed entry.
    store: {
      findById: (required) => entryRepo.findAnyById(required),
      save: ({ record }) => entryRepo.saveAny(record)
    },
    isHidden: ({ record }) => record.deletedAt !== null,
    hidden: ({ record, at }) => ({
      ...record,
      deletedAt: at
    }),
    shown: ({ record }) => ({
      ...record,
      deletedAt: null
    })
  }, {
    // Remove only outgoing references; other content may still refer to this now-missing widget.
    hardDelete: async (required) => {
      await entryRefsRepo().removeBySource({ workspaceId: required.workspaceId, sourceEntryId: required.id });
      await entryRepo.hardDelete(required);
    },
  });
}

export function memoryMenuTrashAdapter(required: { menuRepo: () => TrashAwareInMemoryMenuRepo; navLocationBindingRepo: () => InMemoryNavLocationBindingRepo }, _optional = {}): TrashAdapter {
  const { menuRepo, navLocationBindingRepo } = required;
  return createRecordStoreTrashAdapter<TrashableMenuRecord>({
    entityType: "menu",
    // The repo's trash-blind seam — its port reads hide a trashed menu. Purge must remove
    // location bindings first, matching the durable registry's purgeFirst contract.
    store: {
      findById: (required) => menuRepo().findAnyById(required),
      save: ({ record }) => menuRepo().saveAny(record)
    },
    isHidden: ({ record }) => record.status === "trash",
    // Stash the pre-trash status so `shown` can restore it — `flip()` has no side-channel of its
    // own for it (see `trash-aware-memory-menu-repo.ts`'s file doc).
    hidden: ({ record, at }) => ({
      ...record,
      status: "trash",
      updatedAt: at,
      priorStatus: record.status
    }),
    shown: ({ record, at }) => ({
      ...record,
      status: record.priorStatus ?? "published",
      updatedAt: at,
      priorStatus: null
    })
  }, {
    hardDelete: async ({ workspaceId, id }) => {
      await navLocationBindingRepo().removeByMenu({ workspaceId, menuId: id });
      await menuRepo().remove({ workspaceId, id });
    },
  });
}
