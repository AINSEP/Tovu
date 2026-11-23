import { REDIRECT_ENTITY_TYPE } from "#src/features/trash/index";
import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import { RedirectSlugChangeCapture } from "@jini-ai/cms/redirects";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { bindRemoveEntity } from "@jini-ai/cms/trash";
import { redirectMatcher } from "@jini-ai/cms/redirects";
import { registerRedirectHitOutboxHandler } from "@jini-ai/cms/redirects";
import { registerRedirectsPhaseHandlers } from "@jini-ai/cms/redirects/site/phase-handler";
import { registerResolvePhase, registerSlugChangeCapture } from "#src/platform/routing/adapter";
import { removeEntityWithoutBlocker } from "#src/features/trash/index";
import type { SqliteRedirectRepo } from "#src/features/redirects/index";
import type { createTrashService } from "@jini-ai/cms/trash";
import type { SqliteTrashRepo } from "#src/features/trash/index";
import type { OriginRegistry } from "@jini-ai/core/contracts/server/verified-origin";
import type { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import type { StoreCloseRegistration } from "./open-store.js";
import type { InMemoryEventBus } from "#src/contracts/core/events/index";
import type { RedirectHitSinkImpl } from "@jini-ai/cms/redirects";

interface ComposeRedirectsRequired {
  redirectRepo: ReturnType<typeof SqliteRedirectRepo>;
  trash: ReturnType<typeof createTrashService>;
  trashRepo: SqliteTrashRepo;
  originRegistry: OriginRegistry;
  clock: { nowMs: () => number; nowIso: () => string };
  idGen: { newId: () => string };
  outbox: SqliteOutboxAdapter;
  onStoreClose: (required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void;
  bus: InMemoryEventBus;
  redirectHitSink: RedirectHitSinkImpl;
}

export function composeRedirects(required: ComposeRedirectsRequired, _optional = {}) {
  const { redirectRepo, trash, trashRepo, originRegistry, clock, idGen, outbox, onStoreClose, bus, redirectHitSink } = required;

  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeEntityWithoutBlocker({ remove: bindRemoveEntity({
      trash: trash,
      entityType: REDIRECT_ENTITY_TYPE
    }) }),
    // S7 (web-high fix plan 2026-09-24) — same identity `isInTrash` shape as above, pre-bound to
    // this domain's entity type. `trash.restore` is the real `TrashPort` method, not a bespoke one.
    isInTrash: async (required) =>
      (await trashRepo.findByEntity({ workspaceId: required.workspaceId, entityType: REDIRECT_ENTITY_TYPE, entityId: required.id })) !== null,
    restore: (required) =>
      trash.restore({
        workspaceId: required.workspaceId,
        entityType: REDIRECT_ENTITY_TYPE,
        entityId: required.id,
        at: required.at      }, {
        actor: required.actor      }),
    db: redirectRepo,
    transaction: (fn) => redirectRepo.transaction(fn),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry,
    clock,
    idGen,
    outbox,
  };
  // Disposed with the store: the resolver and the slug capture close over this site's
  // `redirectRepo`, and the phase registry and capture slot are process-wide, so neither may outlive
  // the database it queries. The hit fold's bus is this site's own; it leaves with the site too.
  onStoreClose({ registration: registerRedirectsPhaseHandlers({
    repo: redirectRepo,
    matcher: redirectMatcher,
    originRegistry,
    reservedSegments: RESERVED_SEGMENTS,
    registerResolvePhase,
  }, { hits: { outbox, clock, idGen } }) });
  onStoreClose({ registration: registerSlugChangeCapture({ impl: new RedirectSlugChangeCapture({ reservedSegments: RESERVED_SEGMENTS, repo: redirectRepo, db: redirectRepo, clock, idGen }) }) });
  onStoreClose({ registration: registerRedirectHitOutboxHandler({ bus, hitSink: redirectHitSink }) });
  return { redirectsWriteDeps };
}
