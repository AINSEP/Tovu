import { createCommentsModule, HeuristicSpamCheck } from "@jini-ai/cms/comments";
import { createCommentTargetLookup } from '#src/features/comments/comment-targets';
import { createCommentsHostPorts } from "#src/features/comments/index";
import { removeEntityWithoutBlocker, COMMENT_ENTITY_TYPE } from "#src/features/trash/index";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { createCommentsCapability } from '#src/features/comments/provider-selection';
import { seededWorkspace } from "../../../configuration/seed.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import type { MemoryClock, MemoryIdGen } from "../ports.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { InMemoryOutbox } from "#src/contracts/core/events/index";
import type { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";
import type { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import type { InMemoryTrashRepo, TrashPort } from "@jini-ai/cms/trash";

type IdentitySettings = ReturnType<typeof composeIdentitySettings>;

export interface MemoryCommentsInput {
  commentRepo: InMemoryCommentRepo;
  entryRepo: TrashAwareInMemoryEntryRepo;
  postRepo: InMemoryPostRepo;
  outbox: InMemoryOutbox;
  clock: MemoryClock;
  idGen: MemoryIdGen;
  settingsRepo: InMemorySettingsRepo;
  workspaceId: string;
  trash: TrashPort;
  trashRepo: InMemoryTrashRepo;
  commentsSettingsReady: IdentitySettings["commentsSettingsReady"];
  identity: IdentitySettings["identity"];
  settingsPrincipals: IdentitySettings["settingsPrincipals"];
}

export function composeMemoryComments(required: MemoryCommentsInput, _optional = {}) {
  const { commentRepo, entryRepo, postRepo, outbox, clock, idGen, settingsRepo, workspaceId, trash, trashRepo, commentsSettingsReady, identity, settingsPrincipals } = required;
  const commentsModule = createCommentsModule({
    commentRepo,
    // Entries first, then the public blog's legacy posts (`comment-targets.ts`); `postRepo` is
    // read lazily at submit time, after this root has finished constructing it.
    entryLookup: createCommentTargetLookup({ entries: entryRepo, posts: { findById: (required) => postRepo.findById(required) } }),
    outbox,
    clock,
    idGen,
    spamCheck: new HeuristicSpamCheck(),
    ...createCommentsHostPorts({ clock, settingsRepo, workspaceId }, {}),
    remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: COMMENT_ENTITY_TYPE
    }) }),
    forgetRemoved: ({ workspaceId: ws, id }) =>
      trashRepo.deleteByEntity({ workspaceId: ws, entityType: COMMENT_ENTITY_TYPE, entityId: id }),
    // Nothing in this composition opens a database transaction; see `createTrashService` above.
    runInTransaction: (fn) => fn(),
  }, {});
  const commentsCapability = createCommentsCapability({
    siteId: seededWorkspace.id, module: commentsModule, commentsReady: Promise.resolve(), settingsReady: commentsSettingsReady,
    settings: { settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals },
  });
  return { commentsModule, commentsCapability };
}
