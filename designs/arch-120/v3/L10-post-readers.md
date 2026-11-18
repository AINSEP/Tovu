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
`features/pages/__tests__/html-document-store*.test.ts`; *cover image resolution/OG tags change* →
`features/seo/__tests__/cover-image*.test.ts`; *member-gated posts leak into search* →
`features/site-search/__tests__/access*.test.ts`, `cms-document-source*.test.ts`; *widget render
changes* → `server/__tests__/routes/entries-routes.test.ts`, `publish-trust-apply-coverage.test.ts`,
widget render-context tests; plugin capability stored/fresh-result tests
(`features/plugin-runtime/__tests__/capability-tool*.test.ts`).

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
