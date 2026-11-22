# C-platform-routing-1 — platform-routing → @jini-ai/cms (Jini step J then Tovu step T)

Lane C. Batch J:3 T:5. Depends on: C-contracts-core-3. Est: J 34 min, T 74 min.

## J — move verbatim into Jini (3 files, 99 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/platform/routing/reserved-paths.ts` | `packages/cms/src/routing/site/reserved-paths.ts` | 68 | W2 |
| `apps/website/src/platform/routing/adapter.ts` | `packages/cms/src/routing/site/adapter.ts` | 20 | W1 |
| `apps/website/src/platform/routing/index.ts` | `packages/cms/src/routing/site/index.ts` | 11 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/cms" exports["./routing/site"]
- "@jini-ai/cms" exports["./routing/site/adapter"]
- "@jini-ai/cms" exports["./routing/site/reserved-paths"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (0, 0 LOC) → Jini `__tests__/` beside the destination
- none: write characterization tests first in Jini for the moved behaviour (tests-first)

## T — Tovu repoint: delete the 3 sources, rewrite every importer (58 lines)

```
apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts:2  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/publish-content.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/tool-contract.characterization.test.ts:25  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts:1  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/platform/routing/__tests__/reserved-paths.test.ts:4  '../reserved-paths.js' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts:3  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/server/runtime/composition/app.ts:28  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/server/runtime/composition/site-deps/redirects.ts:2  '#src/platform/routing/reserved-paths' -> '@jini-ai/cms/routing/site/reserved-paths'
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:41  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts:14  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/features/redirects/__tests__/phase-handler.error-isolation.test.ts:5  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts:12  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/features/redirects/__tests__/phase-handler.repo-identity-binding.test.ts:7  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/platform/routing/__tests__/routing.wiring.test.ts:7  '../adapter.js' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/__tests__/routes/site-phase-handler-fail-policy.test.ts:9  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:22  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.paging.route.test.ts:12  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts:28  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts:21  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts:5  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/__tests__/redirects-phase-disposed-on-store-close.integration.test.ts:8  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/__tests__/registrations-disposed-on-store-close.integration.test.ts:8  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts:20  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/app.ts:65  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/memory-deps/route-deps/trash-and-content.ts:9  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/site-deps/redirects.ts:9  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/server/runtime/composition/site-deps/route-deps-content-chat.ts:27  '#src/platform/routing/adapter' -> '@jini-ai/cms/routing/site/adapter'
apps/website/src/assistant/site/visitor-page-tools.ts:7  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/content-types/write-service.ts:30  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/navigation/migrate-footer-page-links.ts:3  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/navigation/page-target-resolver.ts:2  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/post/post-slugs.ts:3  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/post/post-tool-views.ts:5  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/publish-content/push-plan.ts:7  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/redirects/phase-handler.ts:6  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/seo/index.ts:20  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/site-export/route-manifest.ts:8  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/site-inspection/site-path-policy.ts:1  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/site-inspection/site-path-policy.ts:2  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/site-search/cms-document-source.ts:21  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/theme/theme-page-eligibility.ts:1  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/features/theme/visitor-publication.ts:6  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts:6  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/forms-submit.ts:6  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts:3  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/marketing.ts:8  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/post.ts:8  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:7  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/redirect-phase.ts:2  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:11  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/static-menus.ts:4  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts:17  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
apps/website/src/server/runtime/composition/visitor-page-targets.ts:6  '#src/platform/routing/index' -> '@jini-ai/cms/routing/site'
```

## Tovu tests that must stay green (24; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.redirects.test.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.disposer-scope.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.error-isolation.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.multi-site-lifecycle.test.ts`
- `apps/website/src/features/redirects/__tests__/phase-handler.repo-identity-binding.test.ts`
- `apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts`
- `apps/website/src/features/redirects/__tests__/publish-content.test.ts`
- `apps/website/src/features/redirects/__tests__/tool-contract.characterization.test.ts`
- `apps/website/src/features/redirects/__tests__/tool-registrations.model-facing-errors.test.ts`
- `apps/website/src/platform/routing/__tests__/reserved-paths.test.ts`
- `apps/website/src/platform/routing/__tests__/routing.wiring.test.ts`
- `apps/website/src/server/__tests__/routes/site-phase-handler-fail-policy.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.paging.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.response-matrix.characterization.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.route.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/app-module-load-registers-no-phase-handler.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/redirects-phase-disposed-on-store-close.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/registrations-disposed-on-store-close.integration.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/sqlite-create-site-app-module-identity.integration.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/platform/routing/reserved-paths.ts` (2)
- `apps/website/src/platform/routing/adapter.ts` (1)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Named mutation
in the Jini copy of `reserved-paths.ts`, negate the first `if (` condition of its first exported function; `mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts` must go red, then revert
