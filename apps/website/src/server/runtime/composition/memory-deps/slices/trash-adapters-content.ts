import type { PostRecord } from "#src/features/post/index";
import type { InMemoryPostRepo } from "#src/features/post/index";
import type { RedirectRecord, InMemoryRedirectRepo } from "@jini-ai/cms/redirects";
import type { CommentRecord, InMemoryCommentRepo } from "@jini-ai/cms/comments";
import type { InMemoryVersionedMediaRepo, MediaRecord } from "#src/features/media/index";
import { COMMENT_ENTITY_TYPE, MEDIA_ENTITY_TYPE, POST_ENTITY_TYPE, REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";
import { createRecordStoreTrashAdapter, type TrashAdapter } from "@jini-ai/cms/trash";

// The in-memory composition root's Trash adapters for posts, redirects, comments and media. Each takes
// only the one repo it flips markers on, so the root's wiring says which store backs which entity.

export function memoryPostTrashAdapter(required: { postRepo: InMemoryPostRepo }, _optional = {}): TrashAdapter {
  const { postRepo } = required;
  return createRecordStoreTrashAdapter<PostRecord>({
    entityType: POST_ENTITY_TYPE,
    store: {
      findById: required => (postRepo).findById(required),
      save: ({ record }) => (postRepo).save(record)
    },
    isHidden: ({ record }) => record.deletedAt !== undefined && record.deletedAt !== null,
    hidden: ({ record, at }) => ({
      ...record,
      deletedAt: at,
      updatedAt: at
    }),
    shown: ({ record, at }) => ({
      ...record,
      deletedAt: null,
      updatedAt: at
    })
  }, {
    // 2026-09-20: `PostRepoPort.hardDelete` now exists on both adapters, so this purges for
    // real. The former stand-down ("`InMemoryPostRepo` has no row removal") was honest but left
    // an expired post un-purgeable in this composition — the sweeper released the lease and
    // retried the same row on every pass, forever. Same cascade the durable adapter performs:
    // `hardDelete` takes the revision ledger and the parked autosave with the row.
    hardDelete: (required) => postRepo.hardDelete(required)
  });
}

export function memoryRedirectTrashAdapter(required: { redirectRepo: InMemoryRedirectRepo }, _optional = {}): TrashAdapter {
  const { redirectRepo } = required;
  return createRecordStoreTrashAdapter<RedirectRecord>({
    entityType: REDIRECT_ENTITY_TYPE,
    // `insertRedirect` rather than `save`: this repo's `save` insists on a paired revision, and
    // the revision for a tombstone is written by `tombstoneRedirect` itself.
    store: {
      findById: (required) => redirectRepo.findById(required),
      save: async ({ record }) => {
        await redirectRepo.insertRedirect(record);
      }
    },
    isHidden: ({ record }) => record.status === "disabled",
    hidden: ({ record, at }) => ({
      ...record,
      status: "disabled",
      updatedAt: at
    }),
    shown: ({ record, at }) => ({
      ...record,
      status: "active",
      updatedAt: at
    })
  });
}

export function memoryCommentTrashAdapter(required: { commentRepo: InMemoryCommentRepo }, _optional = {}): TrashAdapter {
  const { commentRepo } = required;
  return createRecordStoreTrashAdapter<CommentRecord>({
    entityType: COMMENT_ENTITY_TYPE,
    // `save` is this double's direct-write seam (not on `CommentRepoPort`) — the moderation
    // write-service has already flipped the status by the time `remove` runs, so `hide` is a
    // no-op here and only `unhide` (a Trash-screen restore) actually writes.
    store: {
      findById: required => (commentRepo).findById(required),
      save: ({ record }) => (commentRepo).save(record)
    },
    isHidden: ({ record }) => record.status === "trash",
    hidden: ({ record, at }) => ({
      ...record,
      status: "trash",
      updatedAt: at
    }),
    // Back to moderation, not to the prior status: the original is recorded nowhere the
    // no-parse rule lets an adapter read, and of the two guesses this is the one that cannot
    // republish spam onto a public page.
    shown: ({ record, at }) => ({
      ...record,
      status: "pending",
      updatedAt: at
    })
    // No `hardDelete`: `InMemoryCommentRepo.purge` needs a moderator, an action and a note this
    // adapter does not have, so purge stands down rather than claiming a removal.
  });
}

export function memoryMediaTrashAdapter(required: { mediaRepo: InMemoryVersionedMediaRepo }, _optional = {}): TrashAdapter {
  const { mediaRepo } = required;
  return createRecordStoreTrashAdapter<MediaRecord>({
    entityType: MEDIA_ENTITY_TYPE,
    store: {
      findById: required => (mediaRepo).findById(required),
      save: ({ record }) => (mediaRepo).save(record)
    },
    isHidden: ({ record }) => record.status === "trashed",
    hidden: ({ record, at }) => ({
      ...record,
      status: "trashed",
      updatedAt: at
    }),
    shown: ({ record, at }) => ({
      ...record,
      status: "active",
      updatedAt: at
    })
    // No `hardDelete`: a media purge is not a row delete — rendition rows hang off it and the
    // blob store holds bytes, a ladder `purgeMedia` owns. Reimplementing it here would orphan
    // bytes, so purge stands down instead.
  });
}
