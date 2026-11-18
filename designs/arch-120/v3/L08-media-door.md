# L08 — media door (M1 rethought) (9 edges, D + I + S)

Combine-3 line covered: `forms/form-file-maintenance.ts -> media/index.ts`. 

**Why not "route through `media/index.ts`" (rev2 M1):** judge 2 #6 — the broad index loads Node blob
and image adapters into the repo/worker closure. **Why not a required repo callback either:** the
inventory shows `post/repo.memory.ts` has 147 importers and `post/repo.ts` 48 (tests construct
repos directly); a required constructor input would touch ~200 files, and an optional one with a
no-op default would silently drop invalidation (the named risk).

- **D — the evidence cache moves down (4 edges).** `features/media/access-evidence.ts` (38 lines)
  is a module-level `WeakMap` cache: no repository, no I/O, no agent surface, and its only import is
  `type PostRecord` used as `Pick<PostRecord, 'memberAccessJson'>`. `git mv` it to
  `contracts/core/media-access-evidence.ts`, replacing that pick with a local
  `AccessEvidencePost = { readonly memberAccessJson?: string | null }` (`post.ts:142`). Module
  identity is preserved (one module, one `WeakMap`), so writers and readers still share the same
  cache — behaviour is byte-for-byte the same. Precedent for stateful helpers in `contracts/core`:
  `operation-lock.ts`. Repoint all 10 importers (rg on tip): `entries/repo.sqlite.ts`,
  `post/repo.ts`, `post/repo.memory.ts`, `server/runtime/composition/deps.ts`,
  `server/runtime/composition/memory-deps/slices/repos.ts`,
  `server/inbound/public-http/routes/site/media-rendition.ts`, and tests
  `entries/__tests__/repo.characterization.test.ts`, `entries/__tests__/support/trash-aware-entry-repo.ts`,
  `entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts`,
  `trash/__tests__/post-trash-media-evidence.integration.test.ts`. This also clears the **4**
  `no-deep-imports:features/media` boundary errors (incl. the server `media-rendition.ts` one), and
  the worker closure gains nothing (the file imports nothing).
- **S** `media/where-used.ts:6` (`PostRepoPort`) → local reader shape (the methods called).
- **I** `forms/form-file-maintenance.ts:5,10,87` (`purgeMedia`) → required `purgeMedia` in the
  maintenance deps; its deps type is declared locally as the argument shape forms passes
  (combine-3's "port-location decision": the port belongs to the consumer, forms).
- **I** `site-export/media-original-urls.ts:6` (`resolveContentTypes`) → export deps field.
- **I** `media-generation/tool-registrations.ts:2`, `media-import/tool-registrations.ts:2`
  (`withChatPreview`) → tool deps `chatPreview` (media-import already documents it as optional at
  `:90`; keep that semantics — absent = plain JSON — and make media-generation match).

**Characterization (named risk: an entry/post write stops invalidating a linked media cache —
judge 2 #6):** new `contracts/core/__tests__/media-access-evidence.integration.test.ts`: for the
SQLite entry repo, SQLite post repo and memory post repo **as built by both composition roots**
(`composition/deps.ts`, `memory-deps/slices/repos.ts`), link a media item, prime evidence
(including a *pending* scan), mutate the entry/post, assert the next evidence read reflects the
write and the pending scan does not re-insert old evidence. Fails if any writer stops calling the
invalidator or if two module copies of the cache exist. Keep
`features/trash/__tests__/post-trash-media-evidence.integration.test.ts`, purge/retained-reference
tests, `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts`.

**Gates:** shared gate, `LANE=L08`; G3 must show the 4 `no-deep-imports:features/media` errors gone.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L08.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L08`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `post/repo.ts` -> `media/access-evidence.ts` [D] invalidateMediaAccessEvidence -> contracts/core/media-access-evidence.ts (whole cache module moves down)
- `post/repo.memory.ts` -> `media/access-evidence.ts` [D] same
- `entries/repo.sqlite.ts` -> `media/access-evidence.ts` [D] same
- `media/access-evidence.ts` -> `post/post.ts` [D] file moves to contracts/core; PostRecord pick -> local AccessEvidencePost
- `media/where-used.ts` -> `post/contracts.ts` [S] PostRepoPort -> local WhereUsedPostReader (methods called)
- `forms/form-file-maintenance.ts` -> `media/index.ts` [I] purgeMedia -> FormFileMaintenanceDeps.purgeMedia (composition)
- `site-export/media-original-urls.ts` -> `media/index.ts` [I] resolveContentTypes -> deps port (composition)
- `media-generation/tool-registrations.ts` -> `media/chat-preview.ts` [I] withChatPreview -> tool deps chatPreview (composition)
- `media-import/tool-registrations.ts` -> `media/chat-preview.ts` [I] withChatPreview -> tool deps chatPreview (already optional there: line 90)

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `file`:
- `invalidateMediaAccessEvidence`:
    - `features/entries/__tests__/support/trash-aware-entry-repo.ts:3` import from `features/media/access-evidence.ts`
    - `features/entries/repo.sqlite.ts:3` import from `features/media/access-evidence.ts`
    - `features/post/repo.memory.ts:1` import from `features/media/access-evidence.ts`
    - `features/post/repo.ts:1` import from `features/media/access-evidence.ts`
    - `server/runtime/composition/deps.ts:308` import from `features/media/access-evidence.ts`
    - `server/runtime/composition/memory-deps/slices/repos.ts:9` import from `features/media/access-evidence.ts`
- `same`:

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/entries/repo.sqlite.ts`
    - prod: server/runtime/composition/deps.ts, server/runtime/composition/peer-site-reads.ts, server/runtime/composition/publish-content-seed-hash.ts
    - tests: features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts, features/entries/__tests__/integration/repo.compare-and-set.test.ts, features/entries/__tests__/integration/repo.dialects.test.ts, features/entries/__tests__/integration/repo.sqlite.integration.test.ts, features/entries/__tests__/repo.characterization.test.ts, features/entries/__tests__/unit/publish-content.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/publish-content/__tests__/round-trip-harness.ts, features/trash/__tests__/widget-trash-flow.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts
- `features/forms/form-file-maintenance.ts`
    - prod: 
    - tests: features/forms/__tests__/form-file-maintenance.test.ts
- `features/media-generation/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: features/media-generation/__tests__/providers-tools.test.ts, features/media-generation/__tests__/tool-registrations.test.ts, features/media/__tests__/media-producing-previews.test.ts
- `features/media-import/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, features/asset-transfer/asset-destinations.ts, features/asset-transfer/copy-tool.ts, features/image-transform/tool.ts, features/theme/import-theme-file-tool.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts, features/media-import/__tests__/import-local-file.test.ts, features/media-import/__tests__/replace-file.test.ts, features/media-import/__tests__/tool-registrations.test.ts, features/media/__tests__/media-producing-previews.test.ts
- `features/media/access-evidence.ts`
    - prod: features/entries/repo.sqlite.ts, features/post/repo.memory.ts, features/post/repo.ts, server/inbound/public-http/routes/site/media-rendition.ts, server/runtime/composition/deps.ts, server/runtime/composition/memory-deps/slices/repos.ts
    - tests: features/entries/__tests__/repo.characterization.test.ts, features/entries/__tests__/support/trash-aware-entry-repo.ts, features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts, features/trash/__tests__/post-trash-media-evidence.integration.test.ts
- `features/media/where-used.ts`
    - prod: features/media/index.ts, features/media/purge-media.ts
    - tests: features/media/__tests__/mediawidget-where-used.test.ts
- `features/post/repo.memory.ts`
    - prod: features/post/index.ts
    - tests: assistant/__tests__/plugin-guidance-reload.integration.test.ts, assistant/__tests__/tool-input-chat-regressions.test.ts, features/consent/__tests__/ensure-privacy-defaults.test.ts, features/forms/__tests__/common-fields.test.ts, features/pages/__tests__/html-document-store.memory.go-live.test.ts, features/pages/__tests__/html-document-store.noop-save.test.ts, features/plugin-runtime/__tests__/fixtures/extract-s6-g-plug-observe.ts, features/plugin-runtime/__tests__/integration/capability-tool-revocation.integration.test.ts, features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts, features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts, features/post/__tests__/L156-characterization.test.ts, features/post/__tests__/agent-tools.delete-confirmation.test.ts, features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts, features/post/__tests__/content-duplicate.post-page.test.ts, features/post/__tests__/content-post-list-filters.test.ts, features/post/__tests__/go-live.repo.test.ts, features/post/__tests__/integration/content-tools-default-kind.integration.test.ts, features/post/__tests__/list-published-previews.test.ts, features/post/__tests__/post.author.test.ts, features/post/__tests__/post.authorship.test.ts, features/post/__tests__/post.autosave.test.ts, features/post/__tests__/post.body-format.test.ts, features/post/__tests__/post.concurrent-save.test.ts, features/post/__tests__/post.delete.test.ts, features/post/__tests__/post.derived-slug-limit.test.ts, features/post/__tests__/post.noop-save.test.ts, features/post/__tests__/post.optimistic-concurrency.test.ts, features/post/__tests__/post.presentation-validation.unit.test.ts, features/post/__tests__/post.reserved-slugs.test.ts, features/post/__tests__/post.restore-forward.test.ts, features/post/__tests__/post.revisions.test.ts, features/post/__tests__/post.schedule-events.test.ts, features/post/__tests__/post.schedule-featured.test.ts, features/post/__tests__/post.slug-change.test.ts, features/post/__tests__/post.test.ts, features/post/__tests__/post.title-limit.test.ts, features/post/__tests__/post.transition-events.test.ts, features/post/__tests__/post.trashed-slug-release.test.ts, features/post/__tests__/post.write-guards.test.ts, features/post/__tests__/publish-content.round-trip.test.ts, features/post/__tests__/publish-content.schedule-featured.test.ts, features/post/__tests__/publish-content.terms.test.ts, features/post/__tests__/publish-content.test.ts, features/post/__tests__/repo.save-if-version.test.ts, features/post/__tests__/retire-post.test.ts, features/post/__tests__/reverters.schedule-events.test.ts, features/post/__tests__/reverters.test.ts, features/post/__tests__/search-index.memory.test.ts, features/post/__tests__/tool-registrations.admin-url.test.ts, features/post/__tests__/tool-registrations.author.test.ts, features/post/__tests__/tool-registrations.featured-image-refusal.test.ts, features/post/__tests__/tool-registrations.guards.test.ts, features/post/__tests__/tool-registrations.header-navigation.test.ts, features/post/__tests__/tool-registrations.html-page-body.test.ts, features/post/__tests__/tool-registrations.kind-status-validation-status.integration.test.ts, features/post/__tests__/tool-registrations.list-compact.test.ts, features/post/__tests__/tool-registrations.list-scale.test.ts, features/post/__tests__/tool-registrations.model-facing-errors.test.ts, features/post/__tests__/tool-registrations.optimistic-concurrency.test.ts, features/post/__tests__/tool-registrations.partial-update.test.ts, features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts, features/post/__tests__/tool-registrations.public-url.test.ts, features/post/__tests__/tool-registrations.published-where.test.ts, features/post/__tests__/tool-registrations.revisions-sink.test.ts, features/post/__tests__/tool-registrations.schedule-featured.test.ts, features/publish-content/__tests__/apply-loop.test.ts, features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts, features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts, features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts, features/publish-content/__tests__/planner.test.ts, features/seo/__tests__/index.unit.test.ts, features/widgets/__tests__/unit/menu-page-links.unit.test.ts, server/inbound/admin-http/routes/posts/__tests__/author.test.ts, server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts, server/runtime/composition/__tests__/installed-extension-tools.executable-tools.test.ts, server/runtime/composition/__tests__/installed-extension-tools.preview-port.test.ts, server/runtime/composition/__tests__/site-consent.ports.unit.test.ts
- `features/post/repo.ts`
    - prod: features/post/repo.sqlite.ts
    - tests: features/email-templates/__tests__/operations.sql.test.ts, features/navigation/__tests__/footer-page-links.test.ts, features/pages/__tests__/external-embed-authoring.integration.test.ts, features/pages/__tests__/html-document-store.go-live.test.ts, features/pages/__tests__/html-document-store.noop-save.test.ts, features/pages/__tests__/html-document-store.revisions.test.ts, features/pages/__tests__/html-document-store.sqlite.test.ts, features/pages/__tests__/media-token-authoring.integration.test.ts, features/pages/__tests__/metadata-edit-preserves-html.test.ts, features/post/__tests__/go-live.repo.test.ts, features/post/__tests__/pglite-repo.fixture.ts, features/post/__tests__/post.noop-save.test.ts, features/post/__tests__/post.schedule-featured.test.ts, features/post/__tests__/repo.author.test.ts, features/post/__tests__/repo.dialects.test.ts, features/post/__tests__/repo.postgres.test.ts, features/post/__tests__/search-index.pb1.test.ts, features/post/__tests__/search-index.postgres.test.ts, features/post/__tests__/search-index.reindex.test.ts, features/post/__tests__/search.dialects.test.ts, features/post/__tests__/search.pglite-socket.integration.test.ts, features/site-search/__tests__/cms-search.test.ts, features/trash/__tests__/email-template-trash-flow.test.ts
- `features/site-export/media-original-urls.ts`
    - prod: features/site-export/site-exporter.ts
    - tests: features/site-export/__tests__/media-original-urls.test.ts

#### G5 suites — exact (every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 131 files

```
SUITES="
  apps/website/src/assistant/__tests__/plugin-guidance-reload.integration.test.ts
  apps/website/src/assistant/__tests__/tool-input-chat-regressions.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts
  apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts
  apps/website/src/features/email-templates/__tests__/operations.sql.test.ts
  apps/website/src/features/email-templates/__tests__/operations.test.ts
  apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.postgres.test.ts
  apps/website/src/features/entries/__tests__/integration/repo.compare-and-set.test.ts
  apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts
  apps/website/src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts
  apps/website/src/features/entries/__tests__/repo.characterization.test.ts
  apps/website/src/features/entries/__tests__/unit/publish-content.test.ts
  apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts
  apps/website/src/features/forms/__tests__/common-fields.test.ts
  apps/website/src/features/forms/__tests__/form-file-maintenance.test.ts
  apps/website/src/features/media-generation/__tests__/providers-tools.test.ts
  apps/website/src/features/media-generation/__tests__/tool-registrations.test.ts
  apps/website/src/features/media-import/__tests__/import-local-file.test.ts
  apps/website/src/features/media-import/__tests__/replace-file.test.ts
  apps/website/src/features/media-import/__tests__/tool-registrations.test.ts
  apps/website/src/features/media/__tests__/media-producing-previews.test.ts
  apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts
  apps/website/src/features/navigation/__tests__/footer-page-links.test.ts
  apps/website/src/features/pages/__tests__/external-embed-authoring.integration.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.go-live.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.memory.go-live.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.revisions.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts
  apps/website/src/features/pages/__tests__/media-token-authoring.integration.test.ts
  apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts
  apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-revocation.integration.test.ts
  apps/website/src/features/plugin-runtime/__tests__/integration/capability-tool-search-discoverability.integration.test.ts
  apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts
  apps/website/src/features/post/__tests__/L156-characterization.test.ts
  apps/website/src/features/post/__tests__/agent-tools.delete-confirmation.test.ts
  apps/website/src/features/post/__tests__/content-duplicate.plugin-hook-failed.test.ts
  apps/website/src/features/post/__tests__/content-duplicate.post-page.test.ts
  apps/website/src/features/post/__tests__/content-post-list-filters.test.ts
  apps/website/src/features/post/__tests__/expected-version.core-parser.test.ts
  apps/website/src/features/post/__tests__/expected-version.test.ts
  apps/website/src/features/post/__tests__/featured-image.test.ts
  apps/website/src/features/post/__tests__/go-live.characterization.test.ts
  apps/website/src/features/post/__tests__/go-live.repo.test.ts
  apps/website/src/features/post/__tests__/go-live.test.ts
  apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts
  apps/website/src/features/post/__tests__/list-published-previews.test.ts
  apps/website/src/features/post/__tests__/post.author.test.ts
  apps/website/src/features/post/__tests__/post.authorship.test.ts
  apps/website/src/features/post/__tests__/post.autosave.test.ts
  apps/website/src/features/post/__tests__/post.body-format.test.ts
  apps/website/src/features/post/__tests__/post.concurrent-save.test.ts
  apps/website/src/features/post/__tests__/post.delete.test.ts
  apps/website/src/features/post/__tests__/post.derived-slug-limit.test.ts
  apps/website/src/features/post/__tests__/post.noop-save.test.ts
  apps/website/src/features/post/__tests__/post.optimistic-concurrency.test.ts
  apps/website/src/features/post/__tests__/post.presentation-validation.unit.test.ts
  apps/website/src/features/post/__tests__/post.reserved-slugs.test.ts
  apps/website/src/features/post/__tests__/post.restore-forward.test.ts
  apps/website/src/features/post/__tests__/post.revisions.test.ts
  apps/website/src/features/post/__tests__/post.schedule-events.test.ts
  apps/website/src/features/post/__tests__/post.schedule-featured.test.ts
  apps/website/src/features/post/__tests__/post.slug-change.test.ts
  apps/website/src/features/post/__tests__/post.test.ts
  apps/website/src/features/post/__tests__/post.title-limit.test.ts
  apps/website/src/features/post/__tests__/post.transition-events.test.ts
  apps/website/src/features/post/__tests__/post.trashed-slug-release.test.ts
  apps/website/src/features/post/__tests__/post.write-guards.test.ts
  apps/website/src/features/post/__tests__/publish-content.characterization.test.ts
  apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts
  apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts
  apps/website/src/features/post/__tests__/publish-content.terms.test.ts
  apps/website/src/features/post/__tests__/publish-content.test.ts
  apps/website/src/features/post/__tests__/repo.author.test.ts
  apps/website/src/features/post/__tests__/repo.dialects.test.ts
  apps/website/src/features/post/__tests__/repo.postgres.test.ts
  apps/website/src/features/post/__tests__/repo.rows.test.ts
  apps/website/src/features/post/__tests__/repo.save-if-version.test.ts
  apps/website/src/features/post/__tests__/retire-post.test.ts
  apps/website/src/features/post/__tests__/reverters.schedule-events.test.ts
  apps/website/src/features/post/__tests__/reverters.test.ts
  apps/website/src/features/post/__tests__/search-index.memory.test.ts
  apps/website/src/features/post/__tests__/search-index.pb1.test.ts
  apps/website/src/features/post/__tests__/search-index.postgres.test.ts
  apps/website/src/features/post/__tests__/search-index.reindex.test.ts
  apps/website/src/features/post/__tests__/search-index.sqlite.test.ts
  apps/website/src/features/post/__tests__/search.dialects.test.ts
  apps/website/src/features/post/__tests__/search.pglite-socket.integration.test.ts
  apps/website/src/features/post/__tests__/search.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.admin-url.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.author.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.featured-image-refusal.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.guards.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.header-navigation.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.html-page-body.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.kind-status-validation-status.integration.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.list-compact.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.list-scale.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.model-facing-errors.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.optimistic-concurrency.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.plugin-hook-failed.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.public-url.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.published-where.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.revisions-sink.test.ts
  apps/website/src/features/post/__tests__/tool-registrations.schedule-featured.test.ts
  apps/website/src/features/publish-content/__tests__/apply-loop.test.ts
  apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts
  apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts
  apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts
  apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts
  apps/website/src/features/publish-content/__tests__/planner.test.ts
  apps/website/src/features/seo/__tests__/index.unit.test.ts
  apps/website/src/features/site-export/__tests__/media-original-urls.test.ts
  apps/website/src/features/site-search/__tests__/cms-search.test.ts
  apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts
  apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts
  apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts
  apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts
  apps/website/src/features/widgets/__tests__/unit/menu-page-links.unit.test.ts
  apps/website/src/server/__tests__/routes/content-post-get-by-slug.test.ts
  apps/website/src/server/__tests__/routes/publish-content-types-round-trip.test.ts
  apps/website/src/server/inbound/admin-http/routes/posts/__tests__/author.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts
  apps/website/src/server/runtime/composition/__tests__/installed-extension-tools.executable-tools.test.ts
  apps/website/src/server/runtime/composition/__tests__/installed-extension-tools.preview-port.test.ts
  apps/website/src/server/runtime/composition/__tests__/pages-html-revisions-wiring.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/site-consent.ports.unit.test.ts
"
```
Add the new characterization tests named above to `SUITES`. Barrel-importing suites (`*/index.ts` homes) are large by nature; run them all — G5 is the lane's behaviour net.
