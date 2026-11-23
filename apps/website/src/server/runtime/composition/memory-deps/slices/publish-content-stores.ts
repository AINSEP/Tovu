import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryAssetBlobRepo, InMemoryMediaContentTypeStore, InMemoryBlobStore } from "#src/features/media/index";
import { InMemoryPublishContentBundleRepo } from "@jini-ai/cms/publish/transfer";
import { InMemoryPublishContentBaselineRepo } from "@jini-ai/cms/publish/content/baseline-repo";
import { InMemoryPublishContentRunRepo } from "#src/features/publish-content/run-repo";
import { createFileBlobIndex } from "@jini-ai/cms/publish/transfer";
import { InMemoryPublishContentPeerRepo } from "#src/features/publish-content/peers";
import type { InMemoryOutbox } from "#src/contracts/core/events/index";

export function composePublishContentStores(required: { outbox: InMemoryOutbox }, _optional = {}) {
  const { outbox } = required;
  // Extracted (not inlined into the return object below), same reasoning as `restorePointsRepo`
  // above: Task 8's real `publishContentApplyPort` (`apply-loop.ts`) must read/write the SAME
  // in-memory bundle/baseline/run stores the routes below expose on `RouteDeps`, not a second,
  // disconnected instance — an apply loop reading an empty baseline store would never see `applied`,
  // only ever `created`/`conflict`. `changeSets` is hoisted for the identical reason: the apply
  // loop's `executeCommand` calls must land in the SAME change-set store every other route/test
  // reads off `RouteDeps.changeSets`.
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  const assetBlobRepo = new InMemoryAssetBlobRepo({}, { initialRows: [] });
  // Shared by the render path and publish's media apply, which records what render reads.
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const blobStore = new InMemoryBlobStore();
  const publishContentBundleRepo = new InMemoryPublishContentBundleRepo();
  const publishContentBaselineRepo = new InMemoryPublishContentBaselineRepo();
  const publishContentRunRepo = new InMemoryPublishContentRunRepo();
  // `publish-files-plan-2026-09-24.md` §3 — no rule-of-two double needed: `FileBlobIndexPort` is
  // already an in-memory LRU (`file-blob-index.ts`'s own doc), so this hermetic root shares the
  // SAME real factory the SQLite root uses. Hoisted for the identical "one process-lifetime
  // instance" reason as every repo above. See `routes/types.ts`'s `fileBlobIndex` doc.
  const fileBlobIndex = createFileBlobIndex();
  // Task 10 — the rule-of-two in-memory peer repo. See `routes/types.ts`'s
  // `publishContentPeerRepo` doc.
  const publishContentPeerRepo = new InMemoryPublishContentPeerRepo();
  return { publishContentBundleRepo, publishContentBaselineRepo, publishContentRunRepo, changeSets, assetBlobRepo, blobStore, mediaContentTypeStore, fileBlobIndex, publishContentPeerRepo };
}
