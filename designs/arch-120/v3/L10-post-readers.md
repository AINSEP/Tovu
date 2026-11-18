# L10 — post readers (9 edges, D + I + S + H)

- `pages/html-document-store.ts:18,19` — `PostKind` via L03 (D); `PostRepoPort` → local
  `HtmlDocumentPostRepo` (methods called) (S); `SYSTEM_ACTOR_ID` → **D** into the existing
  `contracts/core/post-author.ts` (owner `post.ts` re-imports it); `announcePendingGoLive` → **I**
  store deps `announceGoLive`, passed by composition (`memory-deps/route-deps/trash-and-content.ts`
  and the SQLite root).
- `plugin-runtime/service-ports.ts:3` (`PostRecord`) → local preview shape listing the fields
  `capability-tool-registrations.ts:75-95` maps (judge 2 #7: one shape, used by caller and provider).
- `seo/cover-image.ts:3` (`collectCoverMediaRefs`, `resolveCoverImage`) → **I** seo deps `coverImage`.
- `site-search/access.ts:13` (`MemberContext`) → local shape (S); `site-search/cms-document-source.ts:23,24`
  (`toRecord`, `toPostSearchDocument`, `resolvePostMemberAccess`) → **I** fields on the document-source
  deps, passed from `server/runtime/composition/modules/site-search.ts`.
- `publish-content/push-plan.ts:8` (`PostRecord`) → local `PushPlanPost` (fields read) (S).
- **H** `widgets/deps.ts:40` imports 13 post values to assemble widget deps — it is wiring. All its
  importers are already `server/**` (`composition/deps.ts`, `composition/app.ts`, public-http
  render-context, admin widget routes, 2 server tests). Move it to
  `server/runtime/composition/widgets-deps.ts`; repoint those importers. **STOP** if any feature
  file imports it (would become a back-edge into composition — hard metric).

**Characterization (named risks):** *pending go-live not announced* →
`features/pages/__tests__/html-document-store.{go-live,noop-save}.test.ts`, `external-embed-authoring.integration.test.ts`; *cover image resolution/OG tags change* →
`features/seo/__tests__/cover-image-{defaults,resolve,source}.test.ts`; *member-gated posts leak into search* →
`features/site-search/__tests__/cms-search.test.ts` (the only test importing `access.ts`/`cms-document-source.ts`; **add** a member-gated-post case if it lacks one); *widget render
changes* → `server/__tests__/routes/entries-routes.test.ts`, `publish-trust-apply-coverage.test.ts`,
widget render-context tests; plugin capability stored/fresh-result tests
(`features/plugin-runtime/__tests__/integration/capability-tool-{revocation,search-discoverability}.integration.test.ts`, fixtures `plugin-post-read.ts`, `plugins-tool-harness.ts`).

**Gates:** shared gate, `LANE=L10`; G2 also guarantees back-edges into composition stay 0 (any would add a second failing metric).

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L10.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L10`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `pages/html-document-store.ts` -> `post/contracts.ts` [D+S] PostKind -> contracts/core/post-kind.ts; PostRepoPort -> local HtmlDocumentPostRepo
- `pages/html-document-store.ts` -> `post/index.ts` [D+I] SYSTEM_ACTOR_ID -> contracts/core/post-author.ts; announcePendingGoLive -> store deps
- `plugin-runtime/service-ports.ts` -> `post/index.ts` [S] PostRecord -> local preview shape (fields mapped)
- `seo/cover-image.ts` -> `post/rendering.ts` [I] collectCoverMediaRefs,resolveCoverImage -> SeoDeps.coverImage port
- `site-search/access.ts` -> `members/index.ts` [S] MemberContext -> local SearchMemberContext
- `site-search/cms-document-source.ts` -> `members/index.ts` [I] resolvePostMemberAccess -> source deps
- `site-search/cms-document-source.ts` -> `post/read-model.ts` [I] toRecord,toPostSearchDocument -> source deps
- `widgets/deps.ts` -> `post/post.ts` [H] deps assembly moves to server/runtime/composition (all importers are server/)
- `publish-content/push-plan.ts` -> `post/contracts.ts` [S] PostRecord -> local PushPlanPost

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `PostKind`:
    - `features/email-templates/__tests__/operations.test.ts:5` import from `features/post/index.ts`
    - `features/email-templates/operations.ts:9` import from `features/post/index.ts`
    - `features/pages/html-document-store.memory.ts:11` import from `features/post/contracts.ts`
    - `features/pages/html-document-store.ts:19` import from `features/post/contracts.ts`
    - `features/post/__tests__/post-vocabulary.test.ts:4` import from `features/post/post-vocabulary.ts`
    - `features/post/__tests__/publish-content.round-trip.test.ts:30` import from `features/post/post.ts`
    - `features/post/contracts.ts:1` reexport from `features/post/post-vocabulary.ts`
    - `features/post/go-live.ts:5` import from `features/post/post-vocabulary.ts`
    - `features/post/index.ts:1` reexport from `features/post/post.ts`
    - `features/post/post.ts:14` import from `features/post/post-vocabulary.ts`
    - `features/post/post.ts:15` reexport from `features/post/post-vocabulary.ts`
    - `features/post/publish-content.ts:21` import from `features/post/post.ts`
    - `features/post/repo.memory.ts:60` import()-type from `features/post/post.ts`
    - `features/post/repo.rows.ts:8` import from `features/post/post.ts`
    - `features/post/repo.ts:86` import()-type from `features/post/post.ts`
    - `features/post/search-index.contract.ts:3` import from `features/post/post.ts`
    - `features/post/search.ts:2` import from `features/post/post.ts`
    - `features/post/tool-registrations.ts:68` import from `features/post/post.ts`
    - `features/site-search/access.ts:14` import from `features/post/contracts.ts`
    - `features/site-search/cms-document-source.ts:22` import from `features/post/contracts.ts`
    - `server/inbound/admin-http/routes/themes/explore.ts:56` import from `features/post/index.ts`
    - `server/runtime/composition/deps.ts:2198` import()-type from `features/post/index.ts`
    - `server/runtime/composition/memory-deps/route-deps/trash-and-content.ts:158` import()-type from `features/post/index.ts`
- `SYSTEM_ACTOR_ID`:
    - `features/pages/__tests__/html-document-store.revisions.test.ts:7` import from `features/post/post.ts`
    - `features/pages/html-document-store.memory.ts:10` import from `features/post/index.ts`
    - `features/pages/html-document-store.ts:18` import from `features/post/index.ts`
    - `features/post/__tests__/post.revisions.test.ts:7` import from `features/post/post.ts`
    - `features/post/__tests__/post.slug-change.test.ts:6` import from `features/post/post.ts`
    - `features/post/index.ts:1` reexport from `features/post/post.ts`
    - `features/post/reverters.ts:5` import from `features/post/post.ts`

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/pages/html-document-store.ts`
    - prod: features/pages/html-document-store.memory.ts, features/pages/html-document-store.sqlite.ts, features/pages/tool-registrations.ts
    - tests: features/email-templates/__tests__/operations.sql.test.ts, features/pages/__tests__/external-embed-authoring.integration.test.ts, features/pages/__tests__/html-document-store.go-live.test.ts, features/pages/__tests__/html-document-store.noop-save.test.ts, features/pages/__tests__/html-document-store.revisions.test.ts, features/pages/__tests__/html-document-store.sqlite.test.ts, features/pages/__tests__/media-token-authoring.integration.test.ts, features/pages/__tests__/metadata-edit-preserves-html.test.ts, features/site-search/__tests__/cms-search.test.ts, features/trash/__tests__/email-template-trash-flow.test.ts
- `features/plugin-runtime/service-ports.ts`
    - prod: features/plugin-runtime/capability-tool-registrations.ts, features/plugin-runtime/install.ts, features/plugin-runtime/lower-tool-access.ts, features/plugin-runtime/tool-registrations.ts, server/inbound/admin-http/routes/plugins/deps.ts, server/routes/route-deps/credentials-deps.ts, server/runtime/composition/agent-plugin-service-ports.ts
    - tests: features/plugin-runtime/__tests__/fixtures/plugin-post-read.ts, features/plugin-runtime/__tests__/fixtures/plugins-tool-harness.ts
- `features/publish-content/push-plan.ts`
    - prod: features/publish-content/publish-tool.ts, server/inbound/admin-http/routes/publish-content/peer-transport.ts
    - tests: features/publish-content/__tests__/publish-tool.test.ts, features/publish-content/__tests__/push-plan.characterization.test.ts
- `features/seo/cover-image.ts`
    - prod: features/seo/index.ts, features/seo/page-head-contributor.ts
    - tests: features/seo/__tests__/cover-image-defaults.test.ts, features/seo/__tests__/cover-image-resolve.test.ts, features/seo/__tests__/cover-image-source.test.ts
- `features/site-search/access.ts`
    - prod: server/runtime/composition/modules/site-search.ts
    - tests: features/site-search/__tests__/cms-search.test.ts
- `features/site-search/cms-document-source.ts`
    - prod: features/site-search/access.ts, server/runtime/composition/modules/site-search.ts
    - tests: features/site-search/__tests__/cms-search.test.ts
- `features/widgets/deps.ts`
    - prod: features/widgets/publish-content.ts, features/widgets/tool-registrations.ts, server/inbound/admin-http/routes/widgets/agent-tools.ts, server/inbound/admin-http/routes/widgets/create.ts, server/inbound/admin-http/routes/widgets/embed-insert.ts, server/inbound/admin-http/routes/widgets/embed-remove.ts, server/inbound/admin-http/routes/widgets/embed-reorder.ts, server/inbound/admin-http/routes/widgets/region-bind.ts, server/inbound/admin-http/routes/widgets/region-mutate-placements.ts, server/inbound/admin-http/routes/widgets/trash.ts, server/inbound/admin-http/routes/widgets/update.ts, server/inbound/public-http/routes/site/pages/render-context/content-markers.ts, server/inbound/public-http/routes/site/pages/render-context/widgets.ts, server/inbound/public-http/routes/site/pages/static-tier.ts, server/inbound/public-http/routes/site/pages/template-render.ts, server/runtime/composition/app.ts, server/runtime/composition/deps.ts
    - tests: assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts, contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts, features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts, features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts, features/publish-content/__tests__/media-video-embed.round-trip.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/trash/__tests__/widget-trash-flow.test.ts, features/widgets/__tests__/agent-tools.trash-confirmation.test.ts, features/widgets/__tests__/integration/embed-service.integration.test.ts, features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts, features/widgets/__tests__/integration/gallery-widget.integration.test.ts, features/widgets/__tests__/integration/gallery.integration.test.ts, features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts, features/widgets/__tests__/integration/html-form-embeds.integration.test.ts, features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts, features/widgets/__tests__/integration/mediawidget.integration.test.ts, features/widgets/__tests__/integration/region-area-service.integration.test.ts, features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts, features/widgets/__tests__/integration/write-service.integration.test.ts, features/widgets/__tests__/unit/deps.unit.test.ts, features/widgets/__tests__/unit/publish-content.test.ts, server/__tests__/routes/entries-routes.test.ts, server/__tests__/routes/publish-trust-apply-coverage.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/preview.unit.test.ts, server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts

#### G5 suites — exact (every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 177 files

```
SUITES="
  apps/website/src/assistant/__tests__/content-read-post-filters.test.ts
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts
  apps/website/src/assistant/__tests__/merged-readers-batch.test.ts
  apps/website/src/assistant/__tests__/pages-read-html-batch.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.post.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.seo.test.ts
  apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts
  apps/website/src/assistant/site/__tests__/capability-registry.test.ts
  apps/website/src/assistant/site/__tests__/tools.test.ts
  apps/website/src/assistant/site/__tests__/visitor-page-resolver.unit.test.ts
  apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts
  apps/website/src/contracts/core/commands/__tests__/command-atomicity.test.ts
  apps/website/src/contracts/core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts
  apps/website/src/contracts/core/commands/__tests__/post-delete-reverter.test.ts
  apps/website/src/contracts/core/events/__tests__/outbox-workspace-id.integration.test.ts
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-export.test.ts
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-render.test.ts
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts
  apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-scripts.test.ts
  apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts
  apps/website/src/features/consent/__tests__/ensure-privacy-defaults.test.ts
  apps/website/src/features/email-templates/__tests__/operations.sql.test.ts
  apps/website/src/features/email-templates/__tests__/operations.test.ts
  apps/website/src/features/email-templates/__tests__/tool-registrations.test.ts
  apps/website/src/features/media/__tests__/mediawidget-where-used.test.ts
  apps/website/src/features/navigation/__tests__/page-target-fallback.test.ts
  apps/website/src/features/pages/__tests__/edit-html-permission.test.ts
  apps/website/src/features/pages/__tests__/external-embed-authoring.integration.test.ts
  apps/website/src/features/pages/__tests__/hidden-until-script.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.go-live.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.memory.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.noop-save.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.revisions.test.ts
  apps/website/src/features/pages/__tests__/html-document-store.sqlite.test.ts
  apps/website/src/features/pages/__tests__/media-token-authoring.integration.test.ts
  apps/website/src/features/pages/__tests__/metadata-edit-preserves-html.test.ts
  apps/website/src/features/pages/__tests__/read-html-scope.integration.test.ts
  apps/website/src/features/pages/__tests__/tool-registrations.move-region.test.ts
  apps/website/src/features/pages/__tests__/tool-registrations.read-html.test.ts
  apps/website/src/features/pages/__tests__/tool-registrations.test.ts
  apps/website/src/features/pages/__tests__/tool-registrations.write-region.test.ts
  apps/website/src/features/plugin-runtime/__tests__/integration/activation.integration.test.ts
  apps/website/src/features/plugin-runtime/__tests__/integration/testimonials-faq-sample.integration.test.ts
  apps/website/src/features/plugin-runtime/__tests__/unit/capability-tool-registrations.unit.test.ts
  apps/website/src/features/post/__tests__/content-stats-tool.test.ts
  apps/website/src/features/post/__tests__/integration/post-plugin-hook.integration.test.ts
  apps/website/src/features/publish-content/__tests__/media-video-embed.round-trip.test.ts
  apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts
  apps/website/src/features/publish-content/__tests__/publish-tool.test.ts
  apps/website/src/features/publish-content/__tests__/push-plan.characterization.test.ts
  apps/website/src/features/seo/__tests__/cover-image-defaults.test.ts
  apps/website/src/features/seo/__tests__/cover-image-resolve.test.ts
  apps/website/src/features/seo/__tests__/cover-image-source.test.ts
  apps/website/src/features/seo/__tests__/sitemap-invalidation.integration.test.ts
  apps/website/src/features/seo/__tests__/sitemap.test.ts
  apps/website/src/features/seo/__tests__/tool-contract.characterization.test.ts
  apps/website/src/features/seo/__tests__/write-service.revision.test.ts
  apps/website/src/features/seo/__tests__/write-service.sqlite.test.ts
  apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts
  apps/website/src/features/site-export/__tests__/route-manifest.test.ts
  apps/website/src/features/site-export/__tests__/site-exporter.test.ts
  apps/website/src/features/site-search/__tests__/cms-search.test.ts
  apps/website/src/features/taxonomy/__tests__/tool-contract.characterization.test.ts
  apps/website/src/features/theme/__tests__/menu-authored-html.test.ts
  apps/website/src/features/theme/__tests__/template-render.canary.test.ts
  apps/website/src/features/trash/__tests__/email-template-trash-flow.test.ts
  apps/website/src/features/trash/__tests__/post-delete-undo-index.test.ts
  apps/website/src/features/trash/__tests__/post-trash-media-evidence.integration.test.ts
  apps/website/src/features/trash/__tests__/record-store-adapter.purge.test.ts
  apps/website/src/features/trash/__tests__/term-trash-flow.test.ts
  apps/website/src/features/trash/__tests__/widget-trash-flow.test.ts
  apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts
  apps/website/src/features/widgets/__tests__/integration/embed-service.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/gallery-widget.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/gallery.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/header-occurrence-collision.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/html-form-embeds.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/html-taxonomy-embeds.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/region-area-service.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.handler-gaps.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.input-validation-status.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.plugin-hook-failed.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts
  apps/website/src/features/widgets/__tests__/integration/tool-registrations.shape-rejection.test.ts
  apps/website/src/features/widgets/__tests__/integration/write-service.integration.test.ts
  apps/website/src/features/widgets/__tests__/tool-contract.characterization.test.ts
  apps/website/src/features/widgets/__tests__/unit/deps.unit.test.ts
  apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts
  apps/website/src/platform/routing/__tests__/routing.wiring.test.ts
  apps/website/src/server/__tests__/media-original-video-route.test.ts
  apps/website/src/server/__tests__/media-rendition-gating-bypass.test.ts
  apps/website/src/server/__tests__/media-rendition-route.test.ts
  apps/website/src/server/__tests__/routes/admin-post-template-preview.test.ts
  apps/website/src/server/__tests__/routes/bare-page-site-serving.test.ts
  apps/website/src/server/__tests__/routes/entries-routes.test.ts
  apps/website/src/server/__tests__/routes/post-template-author.test.ts
  apps/website/src/server/__tests__/routes/post-template-comments.test.ts
  apps/website/src/server/__tests__/routes/post-template-featured-image.test.ts
  apps/website/src/server/__tests__/routes/post-template-site-serving.test.ts
  apps/website/src/server/__tests__/routes/publish-trust-apply-coverage.test.ts
  apps/website/src/server/__tests__/routes/render-depth-bound-site-serving.test.ts
  apps/website/src/server/__tests__/routes/request-cost-traversal.measurement.test.ts
  apps/website/src/server/__tests__/routes/seo-og-image-crawlability.test.ts
  apps/website/src/server/__tests__/routes/seo-site-serving.test.ts
  apps/website/src/server/__tests__/routes/site-profile-route.test.ts
  apps/website/src/server/__tests__/routes/widgets-dynamic-resolver-site-serving.test.ts
  apps/website/src/server/__tests__/routes/widgets-site-serving.test.ts
  apps/website/src/server/__tests__/visitor-assistant-readiness.integration.test.ts
  apps/website/src/server/__tests__/visitor-assistant-safety.integration.test.ts
  apps/website/src/server/__tests__/widgets-error-code-parity.test.ts
  apps/website/src/server/http/__tests__/headless-contracts.test.ts
  apps/website/src/server/inbound/admin-http/routes/pages/__tests__/pages-route-gaps.test.ts
  apps/website/src/server/inbound/admin-http/routes/pages/__tests__/unit/h4-delete.unit.test.ts
  apps/website/src/server/inbound/admin-http/routes/posts/__tests__/autosave.test.ts
  apps/website/src/server/inbound/admin-http/routes/posts/__tests__/unit/post-list-preview.unit.test.ts
  apps/website/src/server/inbound/admin-http/routes/seo/__tests__/get-entry-analyze.test.ts
  apps/website/src/server/inbound/admin-http/routes/seo/__tests__/get-entry.test.ts
  apps/website/src/server/inbound/admin-http/routes/seo/__tests__/post-sitemap-regenerate.test.ts
  apps/website/src/server/inbound/admin-http/routes/seo/__tests__/put-entry.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-access-and-not-found.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-modified.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-route-branches.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-detail-slug-collision.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-group-edge-cases.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-reset-byte-exact.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-file-reset-layout-mismatch.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-liquid-readable.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-save-original-route.test.ts
  apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-v2-layout-classification.test.ts
  apps/website/src/server/inbound/admin-http/routes/trash/__tests__/page-display-kind.integration.test.ts
  apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/library.unit.test.ts
  apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/preview.unit.test.ts
  apps/website/src/server/inbound/admin-http/routes/widgets/__tests__/unit/update.unit.test.ts
  apps/website/src/server/inbound/public-http/http/shared/__tests__/post.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/bare-page.unit.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/handlebars-sandbox.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/landing-page-render.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/liquid-sandbox.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/no-silent-drops.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-featured-image.unit.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-handlebars.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-no-theme.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render-site-timezone.unit.test.ts
  apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts
  apps/website/src/server/inbound/public-http/middleware/__tests__/public-page-security-headers.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/embeds-everywhere.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/feed.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/forms-timing.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/pages-branch-coverage.integration.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/taxonomy-render-surface.integration.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/llms.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/media-rendition.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/member-pages.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.home.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.member-access.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.paging.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.site-timezone.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/render-context-resolution-helpers.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/resolve-html-format-content-markers.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/sitemap.route.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/static-menu-embed-resolution.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/unit/h4-pages.unit.test.ts
  apps/website/src/server/inbound/public-http/routes/site/__tests__/widget-body-embeds.test.ts
  apps/website/src/server/runtime/composition/__tests__/bundled-inactive-gating.integration.test.ts
  apps/website/src/server/runtime/composition/__tests__/public-site-guide.test.ts
  apps/website/src/server/runtime/composition/__tests__/publish-content-seed-hash.test.ts
  apps/website/src/server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts
"
```
Add the new characterization tests named above to `SUITES`. Barrel-importing suites (`*/index.ts` homes) are large by nature; run them all — G5 is the lane's behaviour net.
