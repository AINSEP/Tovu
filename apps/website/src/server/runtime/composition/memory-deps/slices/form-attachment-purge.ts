import { createFormAttachmentPurgeHooks } from "@jini-ai/cms/forms";
import type { InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { withFollowUps, type TrashAdapter } from "@jini-ai/cms/trash";
import type { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import { createFormMediaCleanup } from "#src/features/forms/form-file-purge";
import { createFormFileStorage } from "../../../../../features/forms/form-file-storage.js";
import type { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import { DEFAULT_GC_GRACE_MS } from "#src/features/media/index";
import type { InMemoryPostRepo } from "#src/features/post/index";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../../inbound/admin-http/routes/newsletter/deps.js";

// Purging a form or a form submission must also discard the media files its answers reference, the way
// the durable root's adapters do. The hooks wrap the `form` / `form_submission` adapters after the Map
// is built. Repos the root declares AFTER the Map (and the root object itself) are getters: they are
// read only inside the purge callbacks, which run after composition finishes.

type FormMediaCleanupInput = Parameters<typeof createFormMediaCleanup>[0];
type FormStorageMedia = Parameters<typeof createFormFileStorage>[0]["media"];

export interface FormAttachmentPurgeInput {
  formSubmissionRepo: InMemoryFormSubmissionRepo;
  mediaRepo: InMemoryVersionedMediaRepo;
  postRepo: InMemoryPostRepo;
  clock: FormMediaCleanupInput["clock"];
  idGen: FormStorageMedia["idGen"];
  outbox: FormMediaCleanupInput["outbox"];
  entryRefsRepo: () => InMemoryEntryRefsRepo;
  routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps;
}

type PurgeHookInput = Parameters<typeof createFormAttachmentPurgeHooks>[0];
type RemoveAttachment = (required: { workspaceId: string; mediaId: string }) => Promise<void>;

/** Keyset pages of one form's submissions (or the single submission) as the SQL host returns them. */
export function formSubmissionReader(required: { formSubmissionRepo: InMemoryFormSubmissionRepo; entityType: "form" | "form_submission" }, _optional = {}): PurgeHookInput["readSubmissions"] {
  const { formSubmissionRepo, entityType } = required;
  return async ({ workspaceId, entityId, after, limit }) => {
    const rows = entityType === "form" ? await formSubmissionRepo.listAllForDefinition({ workspaceId, formDefinitionId: entityId })
      : [await formSubmissionRepo.findAnyById({ workspaceId, id: entityId })];
    // Match the SQL host's keyset pages, including the terminal empty page for one submission.
    return rows.filter(row => row !== null)
      .filter(row => after === undefined || row.id > after)
      .sort((left, right) => {
        if (left.id < right.id) return -1;
        return left.id > right.id ? 1 : 0;
      })
      .slice(0, limit).map(row => ({ id: row.id, dataJson: JSON.stringify(row.data) }));
  };
}

/** Discards one referenced media asset (a no-op when the asset is already gone). */
export function formAttachmentRemover(required: FormAttachmentPurgeInput, _optional = {}): RemoveAttachment {
  const { mediaRepo, clock, idGen, entryRefsRepo, postRepo, outbox, routeDeps } = required;
  return async ({ workspaceId, mediaId }) => {
    const asset = await mediaRepo.findById({ workspaceId, id: mediaId });
    if (!asset) return;
    const root = routeDeps();
    const files = createFormFileStorage({ media: {
      mediaRepo, clock, idGen, entryRefsRepo: entryRefsRepo(), postRepo, blobRepo: root.assetBlobRepo,
      renditionRepo: root.assetRenditionRepo, blobStore: root.blobStore,
      ...createFormMediaCleanup({ kernel: root.contentKernel, outbox, clock, graceMs: DEFAULT_GC_GRACE_MS }),
    }, contentTypes: root.mediaContentTypeStore, resolveCreatedByPrincipal: async () => { throw new Error("Purge never creates files"); } });
    await files.discard({ workspaceId, reference: { mediaId } });
  };
}

/** Wraps the `form` and `form_submission` adapters in `adapters` (in place) with the attachment purge hooks. */
export function attachFormAttachmentPurge(required: FormAttachmentPurgeInput & { adapters: Map<string, TrashAdapter> }, _optional = {}): void {
  const { adapters } = required;
  for (const entityType of ["form", "form_submission"] as const) {
    const adapter = adapters.get(entityType);
    if (!adapter) throw new Error(`memory trash has no ${entityType} adapter`);
    adapters.set(entityType, withFollowUps({ adapter }, createFormAttachmentPurgeHooks({
      readSubmissions: formSubmissionReader({ formSubmissionRepo: required.formSubmissionRepo, entityType }),
      remove: formAttachmentRemover(required),
    })));
  }
}
