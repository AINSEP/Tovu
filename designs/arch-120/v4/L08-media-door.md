# L08 — media door (9 edges + 4 boundary errors; I + S + D) — one repo (Tovu); Opus executor (two composition roots)

Combine-3 line covered: `forms/form-file-maintenance.ts -> media/index.ts`.

**Coordinator decision (judge 3 F8), binding:** the access-evidence cache **stays owned by
`features/media/access-evidence.ts`**. Nothing moves to `contracts/core`. Both composition roots
wire the one shared cache into the repos and the rendition route through a small read and
invalidate port. The module keeps both `WeakMap`s (`postCaches`, `widgetCaches`), synchronous
invalidation, and its pending-scan behaviour. Clearing a cache still detaches in-flight scans. The
media-generation chat preview stays bound on every call.

### Changes

1. **`media/access-evidence.ts` → `post/post.ts` (S).** Replace `import type { PostRecord }` with a local
   `type AccessEvidencePost = { readonly memberAccessJson?: string | null }` (`post.ts:142` declares
   `memberAccessJson?: string | null`). Every `Pick<PostRecord, 'memberAccessJson'>` in the file
   becomes `AccessEvidencePost`. The function bodies and both `WeakMap`s are unchanged.
2. **Invalidate port into the repos (I, 3 edges).** The port is the existing callback shape that
   Jini's `SqlEntryRepo` already takes: `onWriteSettled?: (input: { repo: object }) => void`.
   - `post/repo.ts`: `SqlPostRepo` constructor `(kernel, search)` gains a third parameter
     `{ onWriteSettled }: { onWriteSettled?: (input: { repo: object }) => void } = {}`, stored as a
     private field. Each of the five call sites `invalidateMediaAccessEvidence({ owner: this })`
     (`:165, :194` inside `if (result.applied)`, `:218, :251, :355` inside `finally`) becomes
     `this.onWriteSettled?.({ repo: this })` **at the same line, under the same condition**. Delete
     the import at `:1`.
   - `post/repo.sqlite.ts`: `SqlitePostRepo({ store })` gains `optional: { onWriteSettled? } = {}`
     and forwards it to `super`.
   - `post/repo.memory.ts`: `InMemoryPostRepo(_required, { initialRows, onWriteSettled })`; the five
     call sites (`:95, :122, :146, :165, :257`) change as above. Delete the import at `:1`.
   - `entries/repo.sqlite.ts`: `SqliteEntryRepo({ store }, { onWriteSettled }: {...} = {})` passes
     `onWriteSettled` to `SqlEntryRepo` in place of the hard-wired invalidator at `:27`. Delete the import at `:3`.
3. **Bind at every production construction site (both roots), so production behaviour is unchanged.**
   Composition imports the media functions from `#src/features/media/access-evidence` as
   `deps.ts:308` does today. `invalidate` below means `({ repo }) => invalidateMediaAccessEvidence({ owner: repo })`.
   - `server/runtime/composition/deps.ts:1622` `new SqliteEntryRepo({ store: kernel }, { onWriteSettled: invalidate })`
   - `deps.ts:1965` `new SqlitePostRepo({ store: kernel }, { onWriteSettled: invalidate })`
   - `publish-content-seed-hash.ts:86` (post) and `:120` (entry), plus `peer-site-reads.ts:215` (post)
     and `:272` (entry): pass the same `onWriteSettled`. Today every SQLite repo invalidates, so
     every production site keeps doing so.
   - `app.ts:133` `new InMemoryPostRepo({}, { initialRows: seededPosts, onWriteSettled: invalidate })`
   - `memory-deps/slices/repos.ts:42` is unchanged (it already passes `onWriteSettled`).
   - `deps.ts:1528` (trash transaction `finally` invalidation) is unchanged.
   - `post/repo.ts:360` `postRepoFor(kernel)` has no production caller. It stays unbound, and its
     test callers keep today's semantics only if they pass the option. See STOP.
4. **Read port into the rendition route (I, boundary error `media-rendition.ts → media/access-evidence.ts`).**
   `server/inbound/admin-http/routes/media/deps.ts:36` `MediaRenditionRouteDeps` gains a required
   `readonly mediaAccessEvidenceCache: (input: { postRepo: object; entryRepo?: object }) => MediaAccessScanCache`.
   `media-rendition.ts:278` calls `deps.mediaAccessEvidenceCache({ postRepo: deps.postRepo, entryRepo: deps.entryRepo })`.
   The types `AssetReferenceScan`, `AssetReferenceIndex` and a newly exported `MediaAccessScanCache`
   (today's private `ScanCache` alias, same definition) are re-exported **type-only** from
   `features/media/index.ts`. `media-rendition.ts:1` imports them from `#src/features/media/index` as
   types, which adds nothing to the runtime closure. `RouteDeps` (`server/routes/types.ts`) gains the
   same field. Both roots set it to `getMediaAccessEvidenceCache`: `deps.ts` (RouteDeps literal) and
   `app.ts` `createRouteDeps`.
5. **S** `media/where-used.ts:6` (`PostRepoPort`) → local `WhereUsedPostReader` with exactly the methods called.
6. **I** `forms/form-file-maintenance.ts:5,10,87` (`purgeMedia`) → required `purgeMedia` in the
   maintenance deps; the deps type is declared locally as the argument shape forms passes.
7. **I** `site-export/media-original-urls.ts:6` (`resolveContentTypes`) → required export deps field, bound in both roots.
8. **D, preview (judge 3 F8: an absent callback could drop the preview).** `features/media/chat-preview.ts`
   (35 lines; imports only `type ImageCodecPort` from `@jini-ai/cms/media` and Node's `Buffer`) moves
   to `contracts/core/media-chat-preview.ts` with `git mv`. Its 4 importers are repointed:
   `media/tool-registrations.ts:2`, `media-generation/tool-registrations.ts:2`,
   `media-import/tool-registrations.ts:2`, `media/__tests__/media-producing-previews.test.ts:23`.
   No forwarder. No dependency becomes optional. `media-generation/tool-registrations.ts:465` keeps
   calling `withChatPreview` unconditionally, so the generation preview binding is unchanged.

### Callers and tests to repoint
- Tests that construct the repos are unchanged when they never read evidence: an absent
  `onWriteSettled` is a no-op on a repo whose cache nobody primed, the same as today. Tests that
  assert invalidation must pass `onWriteSettled` (imported from `#src/features/media/access-evidence`):
  `features/entries/__tests__/support/trash-aware-entry-repo.ts:3` (already imports the invalidator; keep),
  `entries/__tests__/repo.characterization.test.ts`, `entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts`,
  `trash/__tests__/post-trash-media-evidence.integration.test.ts`.
- Rendition tests that build `MediaRenditionRouteDeps` by hand add `mediaAccessEvidenceCache: getMediaAccessEvidenceCache`:
  `server/__tests__/{media-rendition-gating-bypass,media-rendition-route,media-slug-uuid-collision,media-original-video-route}.test.ts`,
  `server/__tests__/routes/{media-site-serving,content-post-get-by-slug,seo-og-image-crawlability}.test.ts`,
  `server/__tests__/integration/media-real-composition.unrun.integration.test.ts`,
  `server/inbound/public-http/routes/site/__tests__/integration/media-validation.integration.test.ts`,
  `server/inbound/admin-http/routes/media/__tests__/library.test.ts`, `features/site-backup/__tests__/library-share.integration.test.ts`.
  Tests that spread `createRouteDeps()` get the field from the memory root.

### Characterization tests to add (write them on the parent first; they must pass on parent and candidate)
- `features/media/__tests__/access-evidence.roots.integration.test.ts`: for the SQLite post and entry repos built by
  `composition/deps.ts`, and for the memory post repo (`app.ts`) plus the entry repo (`memory-deps/slices/repos.ts`):
  (a) prime the cache through the rendition route's `mediaAccessEvidenceCache`, write a post or entry, and assert the next read rebuilds;
  (b) start a scan, invalidate while it is pending, and assert that the scan's completion does not re-insert old evidence;
  (c) assert that an entry write clears the post cache linked through `widgetCaches`;
  (d) assert that invalidation is synchronous: the cache is empty on the line after the write resolves.
- `features/media-generation/__tests__/tool-registrations.test.ts`: add one case asserting that a generated raster image returns the `{ content: [text, image] }` preview envelope.
- Keep: `features/trash/__tests__/post-trash-media-evidence.integration.test.ts`,
  `server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts`, `features/media/__tests__/media-producing-previews.test.ts`.

### STOP
- If any production `new SqlitePostRepo|SqlPostRepo|InMemoryPostRepo|SqliteEntryRepo|TrashAwareInMemoryEntryRepo(`
  exists outside the sites listed in step 3, bind it the same way and record the site in the PR.
- If a test fails only because it relied on implicit invalidation, pass `onWriteSettled` in that
  test. Do not change its assertions.
- If `worker-import-graph.test.ts` changes its result, stop and report it.

**Expected removals:** the 9 lines in `v4/edges/L08.txt`, plus the 4 `no-deep-imports:features/media`
boundary errors. The three repo errors go with the edges. The `media-rendition.ts` error goes with
step 4.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `post/repo.ts` -> `media/access-evidence.ts` [I] invalidator -> constructor `onWriteSettled` (bound by both roots)
- `post/repo.memory.ts` -> `media/access-evidence.ts` [I] same
- `entries/repo.sqlite.ts` -> `media/access-evidence.ts` [I] same
- `media/access-evidence.ts` -> `post/post.ts` [S] `Pick<PostRecord,'memberAccessJson'>` -> local `AccessEvidencePost`
- `media/where-used.ts` -> `post/contracts.ts` [S] PostRepoPort -> local WhereUsedPostReader
- `forms/form-file-maintenance.ts` -> `media/index.ts` [I] purgeMedia -> FormFileMaintenanceDeps.purgeMedia
- `site-export/media-original-urls.ts` -> `media/index.ts` [I] resolveContentTypes -> export deps
- `media-generation/tool-registrations.ts` -> `media/chat-preview.ts` [D] chat-preview.ts -> contracts/core/media-chat-preview.ts
- `media-import/tool-registrations.ts` -> `media/chat-preview.ts` [D] same


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

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 131 files

```text
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
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
