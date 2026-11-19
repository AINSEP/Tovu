import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import { SqliteEntryRepo } from "#src/features/entries/repo.sqlite";
import { SqliteEntryTermRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteFormDefinitionRepo } from "#src/features/forms/repo.sqlite";
import { SqliteTaxonomyRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteTaxonomyRevisionRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteTermRepo } from "#src/features/taxonomy/repo.sqlite";
import { SqliteWidgetRegionBindingRepo } from "#src/features/widgets/repo.sqlite";
import type { SiteStore } from "../open-site-store.js";
import type { storeBoundServicesFor } from "../store-bound-services.js";

interface ComposeContentReposRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  storeBound: ReturnType<typeof storeBoundServicesFor>;
}

export function composeContentRepos(required: ComposeContentReposRequired, _optional = {}) {
  const { kernel, workspaceId, storeBound } = required;

  // ADR-031/ADR-023 (SPEC-033) — hoisted so the Comments module's `entryLookup` reads the SAME
  // repo the rest of this composition root wires (mirrors `restorePointsRepo`'s identical
  // hoisting rationale above). The actual `commentsReady` I/O (declareDataModule against the
  // SAME shared `db.$client` connection) is chained AFTER `newsletterReady` below — this is
  // pure, synchronous, I/O-free wiring only.
  const entryRepo = new SqliteEntryRepo({ store: kernel });
  // Hoisted (2026-09-02 taxonomy render-surface gap fix) so the SAME instance backs both
  // `entryTermRepo` and the new `entryTermReadRepo` field below — one concrete class satisfying two
  // differently-shaped dependency slots, rather than two separate connections to the same table.
  const sqliteEntryTermRepo = new SqliteEntryTermRepo({ db: kernel, workspaceId: workspaceId });
  // Hoisted so `routeDeps` and the publish apply bag share these instances.
  const taxonomyRepo = new SqliteTaxonomyRepo({ db: kernel, workspaceId: workspaceId });
  const termRepo = new SqliteTermRepo({ db: kernel, workspaceId: workspaceId });
  const taxonomyRevisionRepo = new SqliteTaxonomyRevisionRepo({ db: kernel, workspaceId: workspaceId });
  const stampWatermark = storeBound.stampWatermark;
  // SPEC-043/ADR-047 (widgets) — hoisted alongside `entryRepo` for the same reason: both the admin
  // `widgets` routes and the public site-render path (`routes/site/pages.ts` → `resolvePageWidgets`,
  // W-004) read/write against the SAME real tables, via the same `db` connection.
  const widgetBindingRepo = new SqliteWidgetRegionBindingRepo(kernel);
  const entryRefsRepo = new SqliteEntryRefsRepo({ store: kernel });
  const formDefinitionRepo = new SqliteFormDefinitionRepo({ store: kernel });
  return { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo };
}
