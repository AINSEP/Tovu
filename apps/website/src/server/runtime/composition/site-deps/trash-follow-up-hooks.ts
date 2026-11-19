import { DEFAULT_GC_GRACE_MS } from "#src/features/media/index";
import type { TrashFollowUpHooks } from "@jini-ai/cms/trash";
import { buildMenuTrashFollowUpHooks } from "#src/features/navigation/menu-trash-follow-ups";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { createFormFilePurgeHooks } from "#src/features/forms/form-file-purge";
import { createFormMediaCleanup } from "#src/features/forms/form-file-purge";
import { createTaxonomyPurgeFollowUp } from "#src/features/taxonomy/taxonomy-trash-follow-ups";
import { createTermPurgeFollowUp } from "#src/features/taxonomy/taxonomy-trash-follow-ups";
import { purgeMedia as purgeFormMedia } from "#src/features/media/index";
import { restoreWidgetPriorStatus } from "@jini-ai/cms/widgets";
import { trashMedia as trashFormMedia } from "#src/features/media/index";
import type { SiteStore } from "../open-site-store.js";
import type { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteAssetRenditionRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import type { SqlitePostRepo } from "#src/features/post/index";
import type { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import type { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import type { SqlFormDeliveryRepo } from "#src/platform/db/repos/form-delivery-repo";
import type { SqliteMenuRepo } from "#src/features/navigation/repo.sqlite";
import type { SqliteTermRepo, SqliteTaxonomyRevisionRepo } from "#src/features/taxonomy/repo.sqlite";
import type { SqliteTrashRepo } from "#src/features/trash/index";
import type { toTaxonomyOutbox } from "#src/features/taxonomy/index";
import type { createMediaBlobStore } from "#src/features/object-storage/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";

interface ComposeTrashFollowUpHooksRequired {
  kernel: SiteStore["content"];
  mediaRepo: () => SqliteMediaRepo;
  workspaceId: string;
  postRepo: () => SqlitePostRepo;
  clock: { nowMs: () => number; nowIso: () => string };
  assetBlobRepo: () => SqliteAssetBlobRepo;
  assetRenditionRepo: SqliteAssetRenditionRepo;
  blobStore: ReturnType<typeof createMediaBlobStore>["blobStore"];
  entryRefsRepo: () => SqliteEntryRefsRepo;
  outbox: SqliteOutboxAdapter;
  formDeliveryRepo: SqlFormDeliveryRepo;
  routeDeps: () => NewsletterRouteDeps & ByokToolSurfaceDeps;
  menuRepo: SqliteMenuRepo;
  idGen: { newId: () => string };
  taxonomyFollowUpTermRepo: SqliteTermRepo;
  trashRepo: SqliteTrashRepo;
  taxonomyFollowUpRevisions: SqliteTaxonomyRevisionRepo;
  taxonomyFollowUpOutbox: ReturnType<typeof toTaxonomyOutbox>;
}

function trashFollowUpHookEntriesA(required: Pick<ComposeTrashFollowUpHooksRequired, "kernel" | "mediaRepo" | "workspaceId" | "postRepo" | "clock" | "assetBlobRepo" | "assetRenditionRepo" | "blobStore" | "entryRefsRepo" | "outbox" | "formDeliveryRepo">, _optional = {}): Array<[string, TrashFollowUpHooks]> {
  const { kernel, mediaRepo, workspaceId, postRepo, clock, assetBlobRepo, assetRenditionRepo, blobStore, entryRefsRepo, outbox, formDeliveryRepo } = required;
  return [
    ...(["form_submission", "form"] as const).map(entityType => [entityType, createFormFilePurgeHooks({ kernel, entityType,
      prepareRemoval: async () => {
        const [assets, posts] = await Promise.all([mediaRepo().list({ workspaceId }), postRepo().list({ workspaceId })]);
        // The existing media owner still checks references. Snapshot once under the purge lock,
        // then remove deleted rows so shared blobs observe earlier deletions in this same purge.
        const snapshotMedia = new Proxy(mediaRepo(), { get(target, key) {
          if (key === "list") return async () => assets;
          // Tombstoning runs inside purgeMedia, so its snapshot must lose the removed owner
          // before that check rather than only after purgeMedia returns.
          if (key === "remove") return async (input: { workspaceId: string; id: string }) => {
            await target.remove(input);
            const index = assets.findIndex(row => row.id === input.id);
            if (index >= 0) assets.splice(index, 1);
          };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        } });
        const snapshotPosts = new Proxy(postRepo(), { get(target, key) {
          if (key === "list") return async () => posts;
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        } });
        return async ({ workspaceId: ws, mediaId }) => {
          const asset = await mediaRepo().findById({ workspaceId: ws, id: mediaId });
          if (!asset) return;
          // A filename is visitor-influenced display data, never proof of attachment ownership.
          // Legacy public references stay intact when their ownership cannot be established.
          if (!asset.source.private) throw new Error(`Form attachment ${mediaId} has no proven form upload owner. The submission and file were kept.`);
          await trashFormMedia({ deps: { mediaRepo: mediaRepo(), clock }, input: { workspaceId: ws, id: mediaId } });
          await purgeFormMedia({ deps: { mediaRepo: snapshotMedia, blobRepo: assetBlobRepo(), renditionRepo: assetRenditionRepo, blobStore, clock, entryRefsRepo: entryRefsRepo(), postRepo: snapshotPosts,
            ...createFormMediaCleanup({ kernel, outbox, clock, graceMs: DEFAULT_GC_GRACE_MS }) }, input: { workspaceId: ws, id: mediaId } });
        };
      },
      scrub: ({ workspaceId: ws, entityId }) => formDeliveryRepo.scrubPurged({ workspaceId: ws, purged: entityType === "form" ? { formId: entityId } : { submissionId: entityId } }),
    })] as [string, TrashFollowUpHooks]),
  ];
}

function trashFollowUpHookEntriesB(required: Pick<ComposeTrashFollowUpHooksRequired, "clock" | "outbox" | "routeDeps" | "menuRepo" | "idGen" | "taxonomyFollowUpTermRepo" | "trashRepo" | "taxonomyFollowUpRevisions" | "taxonomyFollowUpOutbox">, _optional = {}): Array<[string, TrashFollowUpHooks]> {
  const { clock, outbox, routeDeps, menuRepo, idGen, taxonomyFollowUpTermRepo, trashRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox } = required;
  return [
    [
      "widget",
      {
        afterUnhide: (required) =>
          restoreWidgetPriorStatus({
            deps: buildWidgetsDeps(routeDeps()),
            input: { workspaceId: required.workspaceId, widgetInstanceId: required.entityId, priorStatus: required.priorMarker },
          }),
      },
    ],
    ["menu", buildMenuTrashFollowUpHooks({ menuRepo, outbox, idGen, clock })],
    [
      "term",
      createTermPurgeFollowUp({
        termRepo: taxonomyFollowUpTermRepo,
        trash: trashRepo,
        revisions: taxonomyFollowUpRevisions,
        outbox: taxonomyFollowUpOutbox,
        clock,
      }),
    ],
    [
      "taxonomy",
      createTaxonomyPurgeFollowUp({
        termRepo: taxonomyFollowUpTermRepo,
        trash: trashRepo,
        revisions: taxonomyFollowUpRevisions,
        outbox: taxonomyFollowUpOutbox,
        clock,
      }),
    ],
  ];
}

export function composeTrashFollowUpHooks(required: ComposeTrashFollowUpHooksRequired, _optional = {}) {
  return { trashFollowUpHooks: new Map<string, TrashFollowUpHooks>([...trashFollowUpHookEntriesA(required), ...trashFollowUpHookEntriesB(required)]) };
}
