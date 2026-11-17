import { bindForgetRemovedEntity, bindRemoveEntity, type InMemoryTrashRepo, type TrashPort } from "@jini-ai/cms/trash";
import { POST_ENTITY_TYPE, removeEntityWithoutBlocker } from "#src/features/trash/index";
import { createPublishContentApplyPort, toPublishContentApplyDeps } from "#src/features/publish-content/apply-port";
import { buildContentPublishPorts } from "../../content-publish-ports.js";
import { rescanThemes, type discoverAllBuiltInThemes } from "#src/features/theme/index";
import type { InMemoryPostRepo } from "#src/features/post/index";
import type { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore, InMemoryVersionedMediaRepo } from "#src/features/media/index";
import type { InMemoryNavLocationBindingRepo } from "#src/features/navigation/index";
import type { TrashAwareInMemoryMenuRepo } from "#src/features/navigation/trash-aware-memory-menu-repo";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { builtInThemesDir } from "../../site-paths.js";

// The in-memory composition root's publish-content apply port. Hoisted out of the root's literal for the
// reason the root documents: the apply loop must read and write the SAME in-memory stores the routes
// expose, never a second disconnected instance. Both functions only assemble; every store comes in.
// (The SQLite root builds the same port set over its own repos; sharing one factory waits on design 01.)

type ApplyDeps = Parameters<typeof toPublishContentApplyDeps>[0];
type ApplyPorts = ApplyDeps["ports"];

export interface MemoryPublishPortsInput {
  postRepo: InMemoryPostRepo;
  trashRepo: InMemoryTrashRepo;
  trash: TrashPort;
  mediaRepo: InMemoryVersionedMediaRepo;
  assetBlobRepo: InMemoryAssetBlobRepo;
  blobStore: InMemoryBlobStore;
  mediaContentTypeStore: InMemoryMediaContentTypeStore;
  redirectsWriteDeps: RedirectsWriteDeps;
  menuRepo: TrashAwareInMemoryMenuRepo;
  navLocationBindingRepo: InMemoryNavLocationBindingRepo;
  siteThemes: ReturnType<typeof discoverAllBuiltInThemes>;
  /** The repos `buildContentPublishPorts` assembles the content-type, taxonomy, entry, widget and settings ports from. */
  content: Parameters<typeof buildContentPublishPorts>[0];
}

/** The ports bag keyed by entityType (`type-registry.ts`'s `PublishContentPorts`). */
export function memoryPublishContentPorts(required: MemoryPublishPortsInput, _optional = {}): ApplyPorts {
  const { postRepo, trashRepo, trash, mediaRepo, assetBlobRepo, blobStore, mediaContentTypeStore, redirectsWriteDeps, menuRepo, navLocationBindingRepo, siteThemes, content } = required;
  return {
    post: {
      repo: postRepo,
      forgetRemoved: bindForgetRemovedEntity({
        repo: trashRepo,
        entityType: POST_ENTITY_TYPE
      }),
      // S4 (publish-overwrite-live-plan-2026-09-24) — same binding `routeDeps.removePost` below
      // uses; the post handler's `retire()` needs it to wrap `retirePostForReplacement`.
      remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
        trash: trash,
        entityType: POST_ENTITY_TYPE
      }) }),
    },
    media: { repo: mediaRepo, assetBlobRepo, blobStore, contentTypeStore: mediaContentTypeStore },
    redirect: redirectsWriteDeps,
    menu: { repo: menuRepo, bindingRepo: navLocationBindingRepo },
    ...buildContentPublishPorts(content),
    "theme-files": {
      // S19 (S-F4) — same value `routeDeps.themesDir` (below) resolves to. See
      // `routes/types.ts`'s `themesDir` doc and `deps.ts`'s identical addition to this same
      // apply bag.
      themesDir: builtInThemesDir(),
      onReplaced: () => {
        rescanThemes({ themes: siteThemes, dir: builtInThemesDir() });
      },
    },
  };
}

export interface MemoryPublishApplyInput extends Pick<ApplyDeps, "workspaceId" | "clock" | "idGen" | "outbox" | "changeSets" | "authorize"> {
  bundleRepo: Parameters<typeof createPublishContentApplyPort>[0]["bundleRepo"];
  baselineRepo: Parameters<typeof createPublishContentApplyPort>[0]["baselineRepo"];
  runRepo: Parameters<typeof createPublishContentApplyPort>[0]["runRepo"];
  getSeedHash: Parameters<typeof createPublishContentApplyPort>[0]["getSeedHash"];
  ports: ApplyPorts;
}

export function memoryPublishContentApplyPort(required: MemoryPublishApplyInput, _optional = {}): ReturnType<typeof createPublishContentApplyPort> {
  return createPublishContentApplyPort({
    workspaceId: required.workspaceId,
    bundleRepo: required.bundleRepo,
    baselineRepo: required.baselineRepo,
    runRepo: required.runRepo,
    publishContentDeps: toPublishContentApplyDeps({
      workspaceId: required.workspaceId,
      clock: required.clock,
      idGen: required.idGen,
      outbox: required.outbox,
      changeSets: required.changeSets,
      authorize: required.authorize,
      ports: required.ports,
    }),
    clock: required.clock,
    idGen: required.idGen,
    getSeedHash: required.getSeedHash,
  });
}
