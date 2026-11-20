import { createLazyProxy } from "../lazy-proxy.js";
import { InMemoryRedirectRepo, RedirectHitSinkImpl } from "@jini-ai/cms/redirects";
import { InMemoryOutbox, InMemoryEventBus } from "#src/contracts/core/events/index";
import { InMemoryRestorePointsRepo } from "#src/features/database/repo.memory";
import { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import { InMemoryAssetRenditionRepo } from "#src/features/media/index";
import { InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";
import { invalidateMediaAccessEvidence } from "#src/features/media/access-evidence";
import { seededWorkspace } from "../../../configuration/seed.js";
import { type ContentDb, openContentDb } from "#src/platform/db/sqlite/content-db";
import { type TrashDb } from "#src/features/trash/index";
import { contentKernel } from '#src/platform/db/content-kernel';

export function composeMemoryRepos(_required: Record<string, never> = {}, _optional = {}) {
  const redirectRepo = new InMemoryRedirectRepo();
  const redirectHitSink = new RedirectHitSinkImpl();
  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  // Admin-UI backend-gap closure (design-spec.md §0.4/§4.8, this dispatch): declared here (not
  // inline in the return object) so Recovery's `deepLinkRestorePointLookup` below reads the SAME
  // in-memory rows Database's restore-points routes write into, not a second, disconnected instance.
  const restorePointsRepo = new InMemoryRestorePointsRepo();
  // Local admin Trash, hermetic half. A plain Map resolved at CALL time, same as `deps.ts`'s —
  // never a module-level registry. Every domain whose delete path is wired to `deps.remove` in this
  // composition must be registered here; an unregistered type fails loudly at the call rather than
  // silently trashing something that could never be restored.
  const commentRepo = new InMemoryCommentRepo();
  // Hoisted here (from beside `changeSets` further down) for TWO reasons now: the apply loop's
  // `media.apply()` must write into the very stores the media routes and this file's own tests
  // read — constructed twice they would be two disconnected in-memory stores — and the media
  // `TrashAdapter` just below needs the same instance.
  const assetRenditionRepo = new InMemoryAssetRenditionRepo({}, { initialRows: [] });
  const mediaRepo = new InMemoryVersionedMediaRepo({}, { initialRows: [], renditionRepo: assetRenditionRepo });
  // Hoisted for the same reason: the `form_submission` `TrashAdapter` below must flip the marker on
  // the very store the Forms routes read.
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  // ADR-031/ADR-023 (SPEC-033) — hoisted so the Comments module's `entryLookup` reads the SAME
  // in-memory entries the rest of the hermetic composition writes into (mirrors
  // `restorePointsRepo`'s identical hoisting rationale above) — and so the `widget` `TrashAdapter`
  // below flips the marker on the very store the widget routes read.
  const entryRepo = new TrashAwareInMemoryEntryRepo({ onWriteSettled: ({ repo }) => invalidateMediaAccessEvidence({ owner: repo }) });
  const workspaceId = seededWorkspace.id;
  const taxonomyDb = createLazyProxy<ContentDb>({ factory: () => openContentDb(":memory:") });
  const sqliteTrashDb = createLazyProxy<TrashDb>({ factory: () => contentKernel({ store: taxonomyDb }) });
  return { taxonomyDb, workspaceId, outbox, redirectRepo, commentRepo, mediaRepo, formSubmissionRepo, entryRepo, sqliteTrashDb, bus, redirectHitSink, assetRenditionRepo, restorePointsRepo };
}
