import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { createCommentsModule, HeuristicSpamCheck } from "@jini-ai/cms/comments";
import { createCommentTargetLookup } from "@jini-ai/cms/comments/site/comment-targets";
import { createCommentsHostPorts } from "#src/features/comments/index";
import { COMMENT_ENTITY_TYPE } from "#src/features/trash/index";
import { removeEntityWithoutBlocker } from "@jini-ai/cms/trash/site/remove-without-blocker";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { createCommentsCapability } from "@jini-ai/cms/comments/site/provider-selection";
import { createCommentsProviderRegistry } from "@jini-ai/capability-providers/comments";
import { seededWorkspace } from "../../../configuration/seed.js";
import { InMemoryPostRepo } from "#src/features/post/index";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import type { Clock, IdGenerator, IsoClock } from "@jini-ai/core/primitives";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import type { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";
import type { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import type { InMemoryTrashRepo, TrashPort } from "@jini-ai/cms/trash";

type IdentitySettings = ReturnType<typeof composeIdentitySettings>;

export interface MemoryCommentsInput {
  commentRepo: InMemoryCommentRepo;
  entryRepo: TrashAwareInMemoryEntryRepo;
  postRepo: InMemoryPostRepo;
  outbox: InMemoryOutbox;
  clock: Clock & IsoClock;
  idGen: IdGenerator;
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
    settings: { settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals, createPrincipalLookup: createSettingsPrincipalLookup },
    createProviderRegistry: createCommentsProviderRegistry,
  });
  return { commentsModule, commentsCapability };
}
