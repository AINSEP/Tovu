# C-contracts-core-2 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:1 T:3. Depends on: none (only already-Jini code). Est: J 54 min, T 117 min.

## J — move verbatim into Jini (8 files, 274 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/request-facts.ts` | `packages/core/src/contracts/site/request-facts.ts` | 40 | W8 |
| `apps/website/src/contracts/core/runtime-mode.ts` | `packages/core/src/contracts/site/runtime-mode.ts` | 33 | W2 |
| `apps/website/src/contracts/core/settings-vocabulary.ts` | `packages/core/src/contracts/site/settings-vocabulary.ts` | 12 |  |
| `apps/website/src/contracts/core/site-key-state.ts` | `packages/core/src/contracts/site/site-key-state.ts` | 39 | W2 |
| `apps/website/src/contracts/core/soft-delete.ts` | `packages/core/src/contracts/site/soft-delete.ts` | 14 |  |
| `apps/website/src/contracts/core/strict-base64.ts` | `packages/core/src/contracts/site/strict-base64.ts` | 34 |  |
| `apps/website/src/contracts/core/theme-ids.ts` | `packages/core/src/contracts/site/theme-ids.ts` | 60 | W4 |
| `apps/website/src/contracts/core/theme-slots.ts` | `packages/core/src/contracts/site/theme-slots.ts` | 42 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/request-facts"]
- "@jini-ai/core" exports["./contracts/site/runtime-mode"]
- "@jini-ai/core" exports["./contracts/site/settings-vocabulary"]
- "@jini-ai/core" exports["./contracts/site/site-key-state"]
- "@jini-ai/core" exports["./contracts/site/soft-delete"]
- "@jini-ai/core" exports["./contracts/site/strict-base64"]
- "@jini-ai/core" exports["./contracts/site/theme-ids"]
- "@jini-ai/core" exports["./contracts/site/theme-slots"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 110 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/contracts/core/__tests__/unit/runtime-mode.unit.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/strict-base64.unit.test.ts`


## T — Tovu repoint: delete the 8 sources, rewrite every importer (120 lines)

```
apps/website/src/assistant/__tests__/admin-frontend-owner.unit.test.ts:4  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/assistant/admin-frontend-owner.ts:3  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/assistant/site/visitor-frontend-control.ts:13  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/assistant/site/visitor-request-origin.ts:3  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/server/inbound/shared/__tests__/request-facts.unit.test.ts:5  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/server/inbound/shared/request-facts.ts:4  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/server/runtime/composition/__tests__/jini-routes.unit.test.ts:8  '#src/contracts/core/request-facts' -> '@jini-ai/core/contracts/site/request-facts'
apps/website/src/contracts/core/agent-permission-mode.ts:1  './runtime-mode.js' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/comments/ip-hash-salt.ts:2  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/deployments/deploy-ops/run-ops.ts:3  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/origin/configured-origin.ts:17  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/post/post-tool-deps.ts:11  '../../contracts/core/runtime-mode.js' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/post/post-tool-views.ts:7  '../../contracts/core/runtime-mode.js' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/publish-content/live-site-policy.ts:1  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/seo/index.ts:22  '../../contracts/core/runtime-mode.js' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/site-backup/backup-service.ts:16  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/webhooks/site-key-ensure.ts:16  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/webhooks/site-key-sources.ts:5  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/platform/mail/purpose-gate-probe.ts:10  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/platform/mail/purpose-scoped-mailer.ts:9  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/platform/site-dir/site-registry.ts:14  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts:15  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts:7  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:29  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/boot-readiness-gate.ts:7  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/boot-readiness-warnings.ts:2  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/local-owner-signin.ts:6  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/production-readiness-gate.ts:12  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/resolve-mailer.ts:12  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/boot/site-key-boot-notice.ts:4  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/agent-plugin-connections.ts:20  '../../../contracts/core/runtime-mode.js' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/build-release.ts:6  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/http-app/visitor-submit.ts:13  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/memory-deps/route-deps/members-media-newsletter-forms.ts:5  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/observability-export.ts:6  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/project-store.ts:10  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/registered-sites.ts:4  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/site-deps/provider-identity.ts:3  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/site-deps/site-keys-members.ts:6  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/storage-secret.ts:6  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/server/runtime/composition/vault-boot.ts:3  '#src/contracts/core/runtime-mode' -> '@jini-ai/core/contracts/site/runtime-mode'
apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts:12  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/mail/attempts.repo.ts:8  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/mail-status/__tests__/test-send.test.ts:202  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/mail-status/test-send.ts:16  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/settings/mail-provider.ts:1  '../../contracts/core/settings-vocabulary.js' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/settings/publish-content.ts:1  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/features/site-backup/share-database/repo.sqlite.ts:13  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/server/routes/types.ts:437  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/server/runtime/boot/__tests__/mail-delivery-policy.unit.test.ts:6  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/server/runtime/boot/__tests__/mail-engine-parity.unit.test.ts:10  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/server/runtime/boot/mail-delivery-policy.ts:10  '#src/contracts/core/settings-vocabulary' -> '@jini-ai/core/contracts/site/settings-vocabulary'
apps/website/src/server/inbound/admin-http/routes/system/site-key.ts:30  '#src/contracts/core/site-key-state' -> '@jini-ai/core/contracts/site/site-key-state'
apps/website/src/assistant/__tests__/small-contracts.unit.test.ts:8  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/contracts/core/scheduled-publish.ts:1  './soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/__tests__/post.delete.test.ts:10  '../../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/__tests__/publish-content.test.ts:26  '../../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/__tests__/retire-post.test.ts:5  '../../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/index.ts:6  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/features/post/post-import.ts:5  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-read.ts:4  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-retire.ts:6  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-slugs.ts:8  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-tool-delete.ts:1  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-trash.ts:4  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-update.ts:9  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/post-write-effects.ts:3  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/publish-content.ts:21  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/post/reverters.ts:5  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/publish-content/__tests__/apply-loop.test.ts:29  '#src/contracts/core/soft-delete' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/features/widgets/deps.ts:6  '../../contracts/core/soft-delete.js' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:10  '#src/contracts/core/soft-delete' -> '@jini-ai/core/contracts/site/soft-delete'
apps/website/src/contracts/core/index.ts:7  './strict-base64.js' -> '@jini-ai/core/contracts/site/strict-base64'   [BARREL re-export: DELETE this line; repoint the barrel's users of these names to the Jini subpath]
apps/website/src/assistant/__tests__/tool-registrations.theme-set-active.test.ts:13  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/pages/tool-registrations.ts:21  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/post/template-options.ts:3  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-backup/import-keep-off.ts:6  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-backup/share-backend.ts:7  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-export/__tests__/route-manifest.test.ts:8  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-export/route-manifest.ts:6  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-inspection/__tests__/site-profile.unit.test.ts:13  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/site-inspection/site-profile.ts:6  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/__tests__/active-theme.test.ts:4  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/__tests__/preview-switcher.integration.test.ts:17  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/__tests__/theme-ids.unit.test.ts:3  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/__tests__/verify-active-theme.test.ts:12  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/active-theme-publish-content.ts:12  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/active-theme.ts:1  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/theme-discovery.ts:4  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/theme-read-tools.ts:5  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/theme/verify-active-theme.ts:7  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/__tests__/routes/admin-post-template-preview.test.ts:10  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/__tests__/routes/bare-page-site-serving.test.ts:9  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/admin-http/routes/posts/__tests__/preview-consent.integration.test.ts:9  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/admin-http/routes/posts/__tests__/template-preview-render.test.ts:11  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts:7  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts:12  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/admin-http/routes/widgets/preview-render.ts:5  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/middleware/site-cookie-consent.ts:24  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/middleware/theme-asset-dirs.ts:4  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/__tests__/no-theme.route.test.ts:11  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts:20  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts:9  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/slug-routes.ts:4  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/virtual-page.ts:6  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/inbound/public-http/routes/site/products.ts:6  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/runtime/composition/__tests__/static-site-context.unit.test.ts:4  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/runtime/composition/commerce-http.ts:11  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/runtime/composition/site-consent.ts:19  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/server/runtime/composition/static-site-context.ts:2  '#src/contracts/core/theme-ids' -> '@jini-ai/core/contracts/site/theme-ids'
apps/website/src/features/plugin-runtime/widget-partials.ts:7  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/__tests__/static-render-expand-partials.test.ts:5  '../../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/__tests__/static-theme-migrated-asset-paths.test.ts:8  '../../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/render-contract.ts:2  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/static-portability-index.ts:5  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/static-render.ts:2  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/theme-manifest.ts:2  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/features/theme/theme-static-assets.ts:1  '../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/server/inbound/public-http/routes/site/pages/static-tier.ts:12  '../../../../../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
apps/website/src/server/inbound/public-http/routes/site/pages/template-render.ts:15  '../../../../../../contracts/core/theme-slots.js' -> '@jini-ai/core/contracts/site/theme-slots'
```

## Tovu tests that must stay green (30; import lines are repointed above, assertions untouched)
- `apps/website/src/assistant/__tests__/admin-frontend-owner.unit.test.ts`
- `apps/website/src/assistant/__tests__/small-contracts.unit.test.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.theme-set-active.test.ts`
- `apps/website/src/features/mail-status/__tests__/test-send.test.ts`
- `apps/website/src/features/mail/__tests__/attempts-retention.dialects.test.ts`
- `apps/website/src/features/post/__tests__/post.delete.test.ts`
- `apps/website/src/features/post/__tests__/publish-content.test.ts`
- `apps/website/src/features/post/__tests__/retire-post.test.ts`
- `apps/website/src/features/publish-content/__tests__/apply-loop.test.ts`
- `apps/website/src/features/site-export/__tests__/route-manifest.test.ts`
- `apps/website/src/features/site-inspection/__tests__/site-profile.unit.test.ts`
- `apps/website/src/features/theme/__tests__/active-theme.test.ts`
- `apps/website/src/features/theme/__tests__/preview-switcher.integration.test.ts`
- `apps/website/src/features/theme/__tests__/static-render-expand-partials.test.ts`
- `apps/website/src/features/theme/__tests__/static-theme-migrated-asset-paths.test.ts`
- `apps/website/src/features/theme/__tests__/theme-ids.unit.test.ts`
- `apps/website/src/features/theme/__tests__/verify-active-theme.test.ts`
- `apps/website/src/server/__tests__/integration/production-readiness-boot.integration.test.ts`
- `apps/website/src/server/__tests__/routes/admin-post-template-preview.test.ts`
- `apps/website/src/server/__tests__/routes/bare-page-site-serving.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/preview-consent.integration.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/template-preview-render.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/no-theme.route.test.ts`
- `apps/website/src/server/inbound/public-http/routes/site/__tests__/pages.edge-paths.route.test.ts`
- `apps/website/src/server/inbound/shared/__tests__/request-facts.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-delivery-policy.unit.test.ts`
- `apps/website/src/server/runtime/boot/__tests__/mail-engine-parity.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/jini-routes.unit.test.ts`
- `apps/website/src/server/runtime/composition/__tests__/static-site-context.unit.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/request-facts.ts` (8)
- `apps/website/src/contracts/core/runtime-mode.ts` (2)
- `apps/website/src/contracts/core/site-key-state.ts` (2)
- `apps/website/src/contracts/core/theme-ids.ts` (4)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/website/src/contracts/core/site-key-state.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/core/request-facts.ts:10: export const TOVU_REQUEST_FACTS = "tovuRequestFacts";
apps/website/src/contracts/core/request-facts.ts:12: export interface TovuRequestFacts {
apps/website/src/contracts/core/request-facts.ts:23: function isFacts(value: unknown): value is TovuRequestFacts {
apps/website/src/contracts/core/request-facts.ts:25: const facts = value as Partial<Record<keyof TovuRequestFacts, unknown>>;
apps/website/src/contracts/core/request-facts.ts:35: export function readRequestFacts({ locals }: { readonly locals: Readonly<Record<string, unknown>> }, _optional: Record<string, never> = {}):
apps/website/src/contracts/core/request-facts.ts:36: const facts = locals[TOVU_REQUEST_FACTS];
apps/website/src/contracts/core/request-facts.ts:37: if (!isFacts(facts)) throw new Error(`request facts are missing from locals.${TOVU_REQUEST_FACTS}: the route was mounted without mountJiniRo
apps/website/src/contracts/core/runtime-mode.ts:22: return env.TOVU_RUNTIME_MODE === "production" ? "production" : "local";
apps/website/src/contracts/core/theme-ids.ts:22: export const RENAMED_THEME_IDS: Readonly<Record<string, string>> = { basic: "tovu-theme" };
```

## Named mutation
in the Jini copy of `theme-ids.ts`, negate the first `if (` condition of its first exported function; `runtime-mode.unit.test.ts` must go red, then revert
