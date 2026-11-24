import { SqlTaxonomyRepo, SqlTermRepo, SqlEntryTermRepo, SqlTaxonomyRevisionRepo } from "@jini-ai/cms/taxonomy/sql";
import { formDefinitionRepoFor } from "@jini-ai/cms/forms/sql";
import { widgetRegionBindingRepoFor } from "@jini-ai/cms/widgets/sql";
import { entryRepoFor } from "#src/features/entries/entry-repo";
import type { MediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import { FORMS_TABLES, TAXONOMY_TABLES, WIDGETS_TABLES } from "#src/platform/db/content-tables";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import type { SiteStore } from "../open-site-store.js";
import type { storeBoundServicesFor } from "../store-bound-services.js";

interface ComposeContentReposRequired {
  kernel: SiteStore["content"];
  workspaceId: string;
  storeBound: ReturnType<typeof storeBoundServicesFor>;
  mediaAccessEvidence: MediaAccessEvidence;
}

export function composeContentRepos(required: ComposeContentReposRequired, _optional = {}) {
  const { kernel, workspaceId, storeBound, mediaAccessEvidence } = required;

  // ADR-031/ADR-023 (SPEC-033) — hoisted so the Comments module's `entryLookup` reads the SAME
  // repo the rest of this composition root wires (mirrors `restorePointsRepo`'s identical
  // hoisting rationale above). The actual `commentsReady` I/O (declareDataModule against the
  // SAME shared `db.$client` connection) is chained AFTER `newsletterReady` below — this is
  // pure, synchronous, I/O-free wiring only.
  const entryRepo = entryRepoFor({ store: kernel, mediaAccessEvidence });
  // Hoisted (2026-09-02 taxonomy render-surface gap fix) so the SAME instance backs both
  // `entryTermRepo` and the new `entryTermReadRepo` field below — one concrete class satisfying two
  // differently-shaped dependency slots, rather than two separate connections to the same table.
  const sqliteEntryTermRepo = new SqlEntryTermRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: TAXONOMY_TABLES, workspaceId: workspaceId }, {});
  // Hoisted so `routeDeps` and the publish apply bag share these instances.
  const taxonomyRepo = new SqlTaxonomyRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: TAXONOMY_TABLES, workspaceId: workspaceId }, {});
  const termRepo = new SqlTermRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: TAXONOMY_TABLES, workspaceId: workspaceId }, {});
  const taxonomyRevisionRepo = new SqlTaxonomyRevisionRepo({ kernel: schemaErasedKernel({ store: kernel }), tables: TAXONOMY_TABLES, workspaceId: workspaceId }, {});
  const stampWatermark = storeBound.stampWatermark;
  // SPEC-043/ADR-047 (widgets) — hoisted alongside `entryRepo` for the same reason: both the admin
  // `widgets` routes and the public site-render path (`routes/site/pages.ts` → `resolvePageWidgets`,
  // W-004) read/write against the SAME real tables, via the same `db` connection.
  const widgetBindingRepo = widgetRegionBindingRepoFor({ kernel: schemaErasedKernel({ store: kernel }), tables: WIDGETS_TABLES });
  const entryRefsRepo = new SqliteEntryRefsRepo({ store: kernel });
  const formDefinitionRepo = formDefinitionRepoFor({ kernel: schemaErasedKernel({ store: kernel }), tables: FORMS_TABLES });
  return { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark, widgetBindingRepo, entryRefsRepo, formDefinitionRepo };
}
