# C-contracts-core-3 — contracts-core → @jini-ai/core (Jini step J then Tovu step T)

Lane C. Batch J:2 T:4. Depends on: C-contracts-core-1, C-contracts-core-2. Est: J 65 min, T 102 min.

## J — move verbatim into Jini (11 files, 545 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/website/src/contracts/core/tool-metadata/approval-policy.ts` | `packages/core/src/contracts/site/tool-metadata/approval-policy.ts` | 12 |  |
| `apps/website/src/contracts/core/widget-tables.ts` | `packages/core/src/contracts/site/widget-tables.ts` | 3 | W1 |
| `apps/website/src/contracts/core/gated-mutations/gateway.ts` | `packages/core/src/contracts/site/gated-mutations/gateway.ts` | 214 | W2 |
| `apps/website/src/contracts/core/scheduled-publish.ts` | `packages/core/src/contracts/site/scheduled-publish.ts` | 63 |  |
| `apps/website/src/contracts/core/tool-metadata/agent-plugins.ts` | `packages/core/src/contracts/site/tool-metadata/agent-plugins.ts` | 54 | W2 |
| `apps/website/src/contracts/core/tool-metadata/analytics.ts` | `packages/core/src/contracts/site/tool-metadata/analytics.ts` | 20 |  |
| `apps/website/src/contracts/core/tool-metadata/change-sets.ts` | `packages/core/src/contracts/site/tool-metadata/change-sets.ts` | 22 |  |
| `apps/website/src/contracts/core/tool-metadata/comments.ts` | `packages/core/src/contracts/site/tool-metadata/comments.ts` | 109 |  |
| `apps/website/src/contracts/core/tool-metadata/commerce.ts` | `packages/core/src/contracts/site/tool-metadata/commerce.ts` | 14 |  |
| `apps/website/src/contracts/core/tool-metadata/consent.ts` | `packages/core/src/contracts/site/tool-metadata/consent.ts` | 17 |  |
| `apps/website/src/contracts/core/tool-metadata/content-duplication.ts` | `packages/core/src/contracts/site/tool-metadata/content-duplication.ts` | 17 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/core" exports["./contracts/site/gated-mutations/gateway"]
- "@jini-ai/core" exports["./contracts/site/scheduled-publish"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/agent-plugins"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/analytics"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/approval-policy"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/change-sets"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/comments"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/commerce"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/consent"]
- "@jini-ai/core" exports["./contracts/site/tool-metadata/content-duplication"]
- "@jini-ai/core" exports["./contracts/site/widget-tables"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (2, 654 LOC) → Jini `__tests__/` beside the destination
- `apps/website/src/contracts/core/gated-mutations/__tests__/unit/gateway.unit.test.ts`
- `apps/website/src/contracts/core/__tests__/unit/scheduled-publish.unit.test.ts`


## T — Tovu repoint: delete the 11 sources, rewrite every importer (123 lines)

```
apps/website/src/contracts/core/tool-metadata/assistant.ts:3  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/content-read.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/content-types.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/custom-credentials.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/database-transfer.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/database.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/deploy-ops.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/deployments.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/domain-dns.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/email-templates.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/entries.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/external-mcp.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/files-copy.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/forms.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/frontend-control.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/fs-files.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/identity.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/image-transform.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/index.ts:4  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/mail-status.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/media-generation.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/media-import.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/media.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/members.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/navigation.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/newsletter.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/observability.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/pages.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/permanent-delete.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/plugin-runtime.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/post.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/publish-content.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/recovery.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/redirects.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/search.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/seo.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/server-logs.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/settings.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/site-backup.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/site-evidence.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/site-guide.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/site-inspection.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/sites.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/skills.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/source-control.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/taxonomy.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/theme.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/trash.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/visitor-tools.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/web-screenshot.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/web.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/webhooks.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/widgets.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/core/tool-metadata/workspace.ts:2  './approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:2  '../core/tool-metadata/approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:12  '../core/tool-metadata/approval-policy.js' -> '@jini-ai/core/contracts/site/tool-metadata/approval-policy'
apps/website/src/features/entries/unreadable-owner-entries-repair.ts:1  '../../contracts/core/widget-tables.js' -> '@jini-ai/core/contracts/site/widget-tables'
apps/website/src/features/widgets/publish-content.ts:1  '../../contracts/core/widget-tables.js' -> '@jini-ai/core/contracts/site/widget-tables'
apps/website/src/features/widgets/repo.sqlite.ts:6  '../../contracts/core/widget-tables.js' -> '@jini-ai/core/contracts/site/widget-tables'
apps/website/src/features/widgets/repo.sqlite.ts:7  '../../contracts/core/widget-tables.js' -> '@jini-ai/core/contracts/site/widget-tables'
apps/website/src/contracts/core/gated-mutations/composition.ts:5  './gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/database/tool-registrations.ts:37  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/deployments/publish-agent-tools.ts:15  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/deployments/publish-tool-deps.ts:4  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/deployments/static-publish/domain-publish-tool.ts:6  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts:6  '../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts:30  '../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:45  '../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/__tests__/plan-pull-tool.test.ts:158  '../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/__tests__/publish-tool.test.ts:4  '../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/gated-hooks.ts:5  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/tool-deps.ts:4  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/publish-content/tool-registrations.ts:18  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts:4  '../../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts:8  '../../../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/recovery/tool-registrations.ts:28  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/recovery/tool-registrations.ts:29  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/taxonomy/gated-hooks.ts:2  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/taxonomy/tool-registrations.ts:26  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts:9  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/__tests__/routes/publish-trust-content-authorize.test.ts:4  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts:4  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:15  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts:5  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts:16  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/publish-content/import-errors.ts:2  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts:9  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts:5  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts:4  '#src/contracts/core/gated-mutations/gateway' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/server/routes/types.ts:115  '../../contracts/core/gated-mutations/gateway.js' -> '@jini-ai/core/contracts/site/gated-mutations/gateway'
apps/website/src/features/post/__tests__/post.schedule-featured.test.ts:6  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/post/post-read.ts:5  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/post/post-tool-views.ts:6  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/post/post-write-effects.ts:5  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/post/repo.memory.ts:12  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/post/repo.ts:18  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/seo/index.ts:21  '../../contracts/core/scheduled-publish.js' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/features/site-search/cms-document-source.ts:20  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/platform/routing/adapter.ts:5  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/http/site/render/components/entry-lists.ts:8  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/http/site/render/post-body.ts:11  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/http/site/render/template-render-data.ts:3  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/http/site/render/widgets/post-content.ts:9  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/routes/site/pages/handlers/home.ts:12  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/server/inbound/public-http/routes/site/pages/render-context/post-previews.ts:9  '#src/contracts/core/scheduled-publish' -> '@jini-ai/core/contracts/site/scheduled-publish'
apps/website/src/contracts/core/tool-metadata/index.ts:5  './agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/features/agent-plugins/__tests__/unit/install-tool-update.unit.test.ts:18  '../../../../contracts/core/tool-metadata/agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/features/agent-plugins/automatic-agent-plugins.ts:12  '../../contracts/core/tool-metadata/agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/features/agent-plugins/host-tool-ports.ts:8  '../../contracts/core/tool-metadata/agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/features/agent-plugins/install-tool.ts:3  '../../contracts/core/tool-metadata/agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/features/agent-plugins/tool-registrations.ts:16  '../../contracts/core/tool-metadata/agent-plugins.js' -> '@jini-ai/core/contracts/site/tool-metadata/agent-plugins'
apps/website/src/contracts/core/tool-metadata/index.ts:6  './analytics.js' -> '@jini-ai/core/contracts/site/tool-metadata/analytics'
apps/website/src/features/analytics/tool-registrations.ts:1  '../../contracts/core/tool-metadata/analytics.js' -> '@jini-ai/core/contracts/site/tool-metadata/analytics'
apps/website/src/contracts/core/tool-metadata/index.ts:8  './change-sets.js' -> '@jini-ai/core/contracts/site/tool-metadata/change-sets'
apps/website/src/features/change-sets/tool-registrations.ts:1  '../../contracts/core/tool-metadata/change-sets.js' -> '@jini-ai/core/contracts/site/tool-metadata/change-sets'
apps/website/src/contracts/core/tool-metadata/index.ts:9  './comments.js' -> '@jini-ai/core/contracts/site/tool-metadata/comments'
apps/website/src/features/comments/tool-registrations.ts:1  '../../contracts/core/tool-metadata/comments.js' -> '@jini-ai/core/contracts/site/tool-metadata/comments'
apps/website/src/contracts/core/tool-metadata/index.ts:1  './commerce.js' -> '@jini-ai/core/contracts/site/tool-metadata/commerce'
apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:37  '#src/contracts/core/tool-metadata/commerce' -> '@jini-ai/core/contracts/site/tool-metadata/commerce'
apps/website/src/contracts/core/tool-metadata/index.ts:2  './consent.js' -> '@jini-ai/core/contracts/site/tool-metadata/consent'
apps/website/src/features/consent/tool-registrations.ts:6  '#src/contracts/core/tool-metadata/consent' -> '@jini-ai/core/contracts/site/tool-metadata/consent'
apps/website/src/contracts/core/tool-metadata/index.ts:10  './content-duplication.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-duplication'
apps/website/src/features/content-duplication/tool-registrations.ts:1  '../../contracts/core/tool-metadata/content-duplication.js' -> '@jini-ai/core/contracts/site/tool-metadata/content-duplication'
```

## Tovu tests that must stay green (13; import lines are repointed above, assertions untouched)
- `apps/website/src/features/agent-plugins/__tests__/unit/install-tool-update.unit.test.ts`
- `apps/website/src/features/post/__tests__/post.schedule-featured.test.ts`
- `apps/website/src/features/publish-content/__tests__/execute-pull-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.baseline-principal.test.ts`
- `apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts`
- `apps/website/src/features/publish-content/__tests__/plan-pull-tool.test.ts`
- `apps/website/src/features/publish-content/__tests__/publish-tool.test.ts`
- `apps/website/src/features/recovery/__tests__/unit/gated-hooks.unit.test.ts`
- `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts`
- `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`
- `apps/website/src/server/__tests__/routes/publish-trust-content-authorize.test.ts`
- `apps/website/src/server/inbound/admin-http/__tests__/credential-provenance.unit.test.ts`
- `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`

## Tovu words (Jini guard N1 fails on /tovu/i, comments included)
- `apps/website/src/contracts/core/widget-tables.ts` (1)
- `apps/website/src/contracts/core/gated-mutations/gateway.ts` (2)
- `apps/website/src/contracts/core/tool-metadata/agent-plugins.ts` (2)
Comments: replace the product name with "the host" and keep every why-sentence. Literals (`data-tovu-*`, `.tovu/`, `TOVU_*`, `tovu-*` ids): rename to the `jini` form in Jini and add one row per literal to `plans/P9-BREAKS.md`; never inject a product string from Tovu.

## Product literals → BREAKS ledger (rename to the jini form; one row each in plans/P9-BREAKS.md)
```
apps/website/src/contracts/core/tool-metadata/agent-plugins.ts:35: search: { keywords: 'edit customize change bundled agent plugin tovu-theme fork copy skills source EACCES PLUGIN_BUNDLED' },
```

## Named mutation
in the Jini copy of `gateway.ts`, negate the first `if (` condition of its first exported function; `gateway.unit.test.ts` must go red, then revert
