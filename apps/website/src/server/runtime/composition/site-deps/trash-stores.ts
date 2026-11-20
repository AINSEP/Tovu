import { createSiteFormDeliveryRepo } from "#src/platform/db/repos/form-delivery-binding";
import { SqliteTaxonomyRevisionRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteTermRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteTrashRepo } from "#src/features/trash/index";
import { buildTrashRegistry } from "#src/features/trash/index";
import { toTaxonomyOutbox } from "#src/features/taxonomy/index";
import type { SiteStore } from "../open-site-store.js";
import type { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";

interface ComposeTrashStoresRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  outbox: SqliteOutboxAdapter;
  clock: { nowMs: () => number; nowIso: () => string };
  idGen: { newId: () => string };
}

export function composeTrashStores(required: ComposeTrashStoresRequired, _optional = {}) {
  const { kernel, workspaceId, outbox, clock, idGen } = required;
  // `TRASHABLE` (plan §1/§4) — built once here. Adding a type needs
  // no edit below this line, only a new `registry.ts` `Map` entry — the adapter map beneath already
  // loops over every registered entry generically.
  const trashRegistry = buildTrashRegistry();
  const sqliteTrashDb = kernel;
  // Finishes a hide/restore/purge a generic marker flip alone cannot (`follow-ups.ts`), per type.
  // `widget`: an adopted legacy widget keeps its `purged` payload while in the Trash (an older site
  // build still reads it), and its restore makes the payload active again. `routeDeps` is read at
  // restore time, long after it exists below. T5/T6 add their own entries here (menu/taxonomy
  // revision + event follow-ups) — this map stays the one per-type wiring point (plan §2 T1 item 6).
  // Hoisted above `trashFollowUpHooks` (needs `findByEntity` for the term/taxonomy purge
  // follow-ups below) — the constructor takes only `db`, no dependency on
  // `trashAdapters`/`trash` itself, so this is safe to build early (T6, step 3).
  const trashRepo = new SqliteTrashRepo({ store: kernel });
  // Purge-only audit trail for `term`/`taxonomy` (plan §6 Q2): one `taxonomy_revisions` row plus a
  // domain event, matching `deleteTerm`/`deleteTaxonomy`'s own writes — see
  // `taxonomy-trash-follow-ups.ts`'s file header. A second, cheap `SqliteTermRepo`/
  // `SqliteTaxonomyRevisionRepo` instance each (stateless wrappers over the same tables `termRepo`/
  // `taxonomyRevisionRepo` below use) rather than hoisting those out of the return object literal.
  const taxonomyFollowUpTermRepo = new SqliteTermRepo({ db: kernel, workspaceId });
  const taxonomyFollowUpRevisions = new SqliteTaxonomyRevisionRepo({ db: kernel, workspaceId });
  const taxonomyFollowUpOutbox = toTaxonomyOutbox({ outbox, clock, idGen, workspaceId });
  // Built here (stateless over `kernel`) because a form or submission purge scrubs its frozen
  // delivery jobs; the delivery wiring further down reuses the same instance.
  const formDeliveryRepo = createSiteFormDeliveryRepo({ kernel });
  return { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions, taxonomyFollowUpOutbox, formDeliveryRepo };
}
