# Commit manifest — unaudited, 2026-08-03

Committed to get the work into git so cloud/worktree agents can see it (a capability probe
confirmed they branch from a commit and cannot see uncommitted changes). **None of this has had a
bug / security / architecture sweep.** That audit is owed.

## Tovu — repo github.com/leonaburime-ucla/Tovu-AI-CMS, branch refactor/jini-admin-extraction

### This session (CMS extraction) — 126 paths
     M package.json
     M src/core/commands/__tests__/change-sets-restart.integration.test.ts
     M src/core/commands/__tests__/repo.contract.test.ts
     M src/core/commands/change-set.ts
     M src/core/commands/command.ts
     M src/core/entry-refs/__tests__/repo.contract.test.ts
     M src/core/entry-refs/repo.sqlite.ts
     M src/core/events/__tests__/outbox-repo.contract.test.ts
     M src/core/events/__tests__/outbox-restart.integration.test.ts
     M src/core/gated-mutations/__tests__/integration/boot-reconciliation.integration.test.ts
     M src/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts
     M src/core/gated-mutations/__tests__/integration/watermark-transaction.integration.test.ts
     M src/core/gated-mutations/ports.ts
     M src/core/gated-mutations/watermark.ts
     M src/core/ports.ts
     M src/core/tools/registration-kit.ts
    D  src/identity/__tests__/admin-crud-service.test.ts
    D  src/identity/__tests__/agent-tools.schema-agreement.test.ts
    D  src/identity/__tests__/auth-service.test.ts
    D  src/identity/__tests__/authorize.test.ts
    D  src/identity/__tests__/grant-service.test.ts
     M src/identity/__tests__/hasher.test.ts
     M src/identity/__tests__/permission-migrations.test.ts
    D  src/identity/__tests__/permissions.test.ts
     M src/identity/__tests__/repo.contract.test.ts
    D  src/identity/__tests__/seed.test.ts
     M src/identity/__tests__/wiring.test.ts
    D  src/identity/admin-crud-service.ts
    D  src/identity/agent-tool-input.ts
    D  src/identity/agent-tools.ts
    D  src/identity/auth-service.ts
    D  src/identity/authorize.ts
    D  src/identity/grant-service.ts
    D  src/identity/hasher.ts
     M src/identity/index.ts
    D  src/identity/password-policy.ts
    D  src/identity/permission-migrations.ts
    D  src/identity/permissions.ts
    D  src/identity/ports.ts
    D  src/identity/repo.memory.ts
     M src/identity/repo.sqlite.ts
    D  src/identity/seed.ts
     M src/identity/tool-registrations.ts
    D  src/identity/types.ts
    D  src/identity/username.ts
     M src/identity/wiring.ts
     D src/media/__tests__/blob-gc.test.ts
     D src/media/__tests__/blob-store.test.ts
     D src/media/__tests__/content-type-sniffer.test.ts
     D src/media/__tests__/image-transformer.sharp.test.ts
     D src/media/__tests__/media-service.test.ts
     D src/media/__tests__/rendition-service.test.ts
     M src/media/__tests__/repo.contract.test.ts
     D src/media/__tests__/transform-registry.test.ts
     D src/media/agent-tools.ts
     D src/media/blob-gc-lock.ts
     D src/media/blob-gc.ts
     D src/media/blob-key.ts
     D src/media/blob-store.fs.ts
     D src/media/blob-store.memory.ts
     D src/media/content-type-sniffer.ts
     D src/media/image-transformer.sharp.ts
     D src/media/image-transformer.ts
     M src/media/index.ts
     D src/media/media-service.ts
     D src/media/ports.ts
     D src/media/rendition-service.ts
     D src/media/repo.memory.ts
     M src/media/tool-registrations.ts
     D src/media/transform-lock.ts
     D src/media/transform-registry.ts
     D src/media/transform-types.ts
     D src/media/types.ts
     D src/navigation/__tests__/menu-service.test.ts
     D src/navigation/__tests__/reconcile.test.ts
     M src/navigation/__tests__/repo.sqlite.test.ts
     D src/navigation/__tests__/resolver.test.ts
     D src/navigation/agent-tools.ts
     D src/navigation/contracts.ts
     M src/navigation/index.ts
     D src/navigation/menu-service.ts
     D src/navigation/ports.ts
     D src/navigation/read-model.ts
     D src/navigation/reconcile.ts
     D src/navigation/repo.memory.ts
     M src/navigation/repo.sqlite.ts
     D src/navigation/resolver.ts
     M src/navigation/tool-registrations.ts
     D src/navigation/types.ts
     M src/server/__tests__/admin-menus-routes.test.ts
     M src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts
     M src/server/__tests__/integration/database-migration-reconciliation-boot.integration.test.ts
     M src/server/__tests__/routes/widgets-dynamic-resolver-site-serving.test.ts
     M src/server/app.ts
     M src/server/deps.ts
     D src/server/gated-mutations-composition.ts
     M src/server/http/admin/forms.ts
     M src/server/http/admin/menus.ts
     M src/server/http/admin/newsletter.ts
     M src/server/http/admin/widgets.ts
     M src/server/http/site/__tests__/render-handlebars.test.ts
     M src/server/http/site/__tests__/render.test.ts
     M src/server/routes/admin/database/migrate-forward.ts
     M src/server/routes/admin/database/restore-points.ts
     M src/server/routes/admin/menus/assign-location.ts
     M src/server/routes/admin/menus/create.ts
     M src/server/routes/admin/menus/delete.ts
     M src/server/routes/admin/menus/update-tree.ts
     M src/server/routes/admin/newsletter/create-campaign.ts
     M src/server/routes/admin/pages/create.ts
     M src/server/routes/admin/pages/delete.ts
     M src/server/routes/admin/pages/update.ts
     M src/server/routes/admin/plugins/set-enabled.ts
     M src/server/routes/admin/posts/create.ts
     M src/server/routes/admin/posts/delete.ts
     M src/server/routes/admin/posts/update.ts
     M src/server/routes/admin/recovery/restore.ts
     M src/server/routes/admin/recovery/status.ts
     M src/server/routes/admin/taxonomy/merge-term.ts
     M src/server/routes/types.ts
     M src/server/seed.ts
     M tsconfig.json
    ?? src/core/gated-mutations/composition.ts
    ?? src/features/database/gated-hooks.ts
    ?? src/features/recovery/gated-hooks.ts
    ?? src/features/taxonomy/gated-hooks.ts

### Pre-existing on this branch (admin extraction + earlier sessions) — NOT this session's work
     M apps/admin/src/App.tsx
     M apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts
     D apps/admin/src/components/ConfirmButton.tsx
     D apps/admin/src/components/ConfirmDialog.tsx
     D apps/admin/src/components/RowMenu.tsx
     D apps/admin/src/components/Sidebar.tsx
     D apps/admin/src/components/__tests__/ConfirmButton.unit.test.tsx
     D apps/admin/src/components/__tests__/ConfirmDialog.unit.test.tsx
     D apps/admin/src/components/__tests__/RowMenu.unit.test.tsx
     D apps/admin/src/hooks/use-sidebar-rail.hooks.ts
     M apps/admin/src/nav.ts
     M apps/admin/src/panels.tsx
     M apps/admin/src/sections/Analytics.tsx
     M apps/admin/src/sections/CollectionEntries.tsx
     M apps/admin/src/sections/Collections.tsx
     M apps/admin/src/sections/Comments.tsx
     M apps/admin/src/sections/Database.tsx
     M apps/admin/src/sections/FormEditor.tsx
     M apps/admin/src/sections/FormsList.tsx
     M apps/admin/src/sections/IntegrationDeliveries.tsx
     M apps/admin/src/sections/Integrations.tsx
     M apps/admin/src/sections/Media.tsx
     M apps/admin/src/sections/Members.tsx
     M apps/admin/src/sections/Menus.tsx
     M apps/admin/src/sections/Pages.tsx
     M apps/admin/src/sections/Placeholder.tsx
     M apps/admin/src/sections/Plugins.tsx
     M apps/admin/src/sections/PostEditor.tsx
     M apps/admin/src/sections/Posts.tsx
     M apps/admin/src/sections/Recovery.tsx
     M apps/admin/src/sections/Redirects.tsx
     M apps/admin/src/sections/Roles.tsx
     M apps/admin/src/sections/Users.tsx
     M apps/admin/src/sections/WidgetRegions.tsx
     M apps/admin/src/sections/WidgetsLibrary.tsx
     M apps/admin/src/sections/__tests__/AiAssistant.unit.test.tsx
     M apps/admin/src/sections/__tests__/Placeholder.unit.test.tsx
     M apps/admin/tsconfig.json
     M apps/admin/vite.config.ts
     M apps/admin/vitest.config.ts
     M development/playwright.config.ts
     M development/scripts/check-architecture.baseline.json
     M development/scripts/write-path-inventory.baseline.json
     M development/scripts/write-path-inventory.ts
    ?? apps/admin/src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts
    ?? apps/admin/src/__tests__/unit/app-sidebar-rail-storage-key.unit.test.tsx
    ?? ops/

### Other src/ paths (import repoints from the extraction, plus earlier branch work)
     M src/analytics/__tests__/repo.contract.test.ts
     M src/analytics/repo.memory.ts
     M src/assistant/__tests__/custom-instructions.test.ts
     M src/assistant/__tests__/mcp-federation.registrations.test.ts
     M src/assistant/__tests__/public-assistant-settings.test.ts
     M src/assistant/__tests__/tool-registrations.authorization.test.ts
     M src/assistant/__tests__/tool-registrations.comments.test.ts
     M src/assistant/__tests__/tool-registrations.contracts.test.ts
     M src/assistant/__tests__/tool-registrations.database-recovery.test.ts
     M src/assistant/__tests__/tool-registrations.identity-authorization.test.ts
     M src/assistant/__tests__/tool-registrations.identity-contracts.test.ts
     M src/assistant/__tests__/tool-registrations.media.test.ts
     M src/assistant/__tests__/tool-registrations.members.test.ts
     M src/assistant/__tests__/tool-registrations.menus.test.ts
     M src/assistant/__tests__/tool-registrations.newsletter.test.ts
     M src/assistant/__tests__/tool-registrations.seo.test.ts
     M src/assistant/mcp-federation/adapter.stdio.ts
     M src/assistant/mcp-federation/registrations.ts
     M src/assistant/persistence/__tests__/ddl-parity.test.ts
     M src/assistant/public-assistant-settings.ts
     M src/comments/__tests__/settings.test.ts
     M src/comments/settings.ts
     M src/comments/tool-registrations.ts
     M src/db/drizzle.config.ts
     M src/db/drizzle.database-journal.config.ts
     M src/db/schema.ts
     M src/db/sqlite/__tests__/repo-helpers.test.ts
     M src/db/sqlite/analytics-sink.sqlite.ts
     M src/db/sqlite/change-set-repo.sqlite.ts
     M src/db/sqlite/content-db.ts
     M src/db/sqlite/database-journal-db.ts
     M src/db/sqlite/database-journal-repo.ts
     M src/db/sqlite/database-journal-schema.ts
     M src/db/sqlite/db-ops.ts
     M src/db/sqlite/media-repo.sqlite.ts
     M src/db/sqlite/origin-repo.sqlite.ts
     M src/db/sqlite/outbox-repo.sqlite.ts
     M src/features/content-types/__tests__/integration/repo.sqlite.integration.test.ts
     M src/features/content-types/list.ts
     M src/features/content-types/repo.sqlite.ts
     M src/features/content-types/tool-registrations.ts
     M src/features/database/__tests__/integration/adapter.sqlite.integration.test.ts
     M src/features/database/adapter.sqlite.ts
     M src/features/database/agent-tools.ts
     M src/features/database/repo.memory.ts
     M src/features/database/restore-points.ts
     M src/features/database/tool-registrations.ts
     M src/features/entries/__tests__/integration/repo.sqlite.integration.test.ts
     M src/features/entries/repo.sqlite.ts
     M src/features/entries/tool-registrations.ts
     M src/features/plugin-runtime/__tests__/integration/repo.contract.test.ts
     M src/features/plugin-runtime/repo.sqlite.ts
     M src/features/plugins/__tests__/data-module.test.ts
     M src/features/plugins/data-module.ts
     M src/features/plugins/migration-recovery.ts
     M src/features/plugins/snapshot.ts
     M src/features/post/__tests__/post.delete.test.ts
     M src/features/post/__tests__/search-index.sqlite.test.ts
     M src/features/post/repo.sqlite.ts
     M src/features/post/search-index.memory.ts
     M src/features/post/search-index.sqlite.ts
     M src/features/presentation/repo.sqlite.ts
     D src/features/recovery/__tests__/integration/recovery-route.integration.test.ts
     M src/features/recovery/tool-registrations.ts
     M src/features/settings/__tests__/cache.test.ts
     M src/features/settings/__tests__/migration.test.ts
     M src/features/settings/__tests__/purge-service.fk.test.ts
     M src/features/settings/__tests__/purge-service.test.ts
     M src/features/settings/__tests__/repo.contract.test.ts
     M src/features/settings/__tests__/repo.sqlite.test.ts
     M src/features/settings/__tests__/settings.lifecycle-deprecate-tombstone.test.ts
     M src/features/settings/__tests__/settings.lifecycle-rename.test.ts
     M src/features/settings/__tests__/settings.lifecycle-retype.test.ts
     M src/features/settings/__tests__/settings.registration.test.ts
     M src/features/settings/__tests__/write-service.definitions-manage-authorization.test.ts
     M src/features/settings/__tests__/write-service.principal-check.test.ts
     M src/features/settings/__tests__/write-service.reconcile-default.test.ts
     M src/features/settings/__tests__/write-service.reset.test.ts
     M src/features/settings/__tests__/write-service.set.test.ts
     M src/features/settings/ensure-definitions.ts
     M src/features/settings/migration.ts
     M src/features/settings/repo.sqlite.ts
     M src/features/settings/tool-registrations.ts
     M src/features/settings/write-service.ts
     M src/features/taxonomy/__tests__/integration/repo.sqlite.integration.test.ts
     M src/features/taxonomy/repo.sqlite.ts
     M src/features/taxonomy/tool-registrations.ts
     M src/features/theme/__tests__/handlebars-allowlist.test.ts
     M src/features/theme/__tests__/liquid-allowlist.test.ts
     M src/features/theme/__tests__/theme.test.ts
     M src/features/theme/tool-registrations.ts
     M src/features/tool-audit/__tests__/integration/repo.sqlite.integration.test.ts
     M src/features/tool-audit/repo.sqlite.ts
     M src/features/workspace/repo.sqlite.ts
     M src/features/workspace/tool-registrations.ts
     M src/forms/__tests__/repo.contract.test.ts
     M src/forms/__tests__/write-service.test.ts
     M src/forms/repo.sqlite.ts
     M src/forms/write-service.ts
     M src/integrations/__tests__/repo.delivery.contract.test.ts
     M src/integrations/__tests__/repo.subscription.contract.test.ts
     M src/integrations/repo.sqlite.ts
     M src/integrations/tool-registrations.ts
     M src/members/__tests__/repo.contract.test.ts
     M src/members/__tests__/restart.integration.test.ts
     M src/members/repo.sqlite.ts
     M src/members/tool-registrations.ts
     M src/newsletter/__tests__/campaign-write-service.test.ts
     M src/newsletter/__tests__/repo.contract.test.ts
     M src/newsletter/repo.sqlite.ts
     M src/newsletter/tool-registrations.ts
     M src/newsletter/types.ts
     M src/origin/__tests__/repo.contract.test.ts
     M src/redirects/__tests__/repo.contract.test.ts
     M src/redirects/hit-sink.ts
     M src/redirects/repo.sqlite.ts
     M src/redirects/tool-registrations.ts
     M src/seo/__tests__/media.test.ts
     M src/seo/__tests__/settings.definitions.test.ts
     M src/seo/__tests__/settings.test.ts
     M src/seo/__tests__/write-service.sqlite.test.ts
     M src/seo/__tests__/write-service.test.ts
     M src/seo/media.ts
     M src/seo/settings.ts
     M src/seo/tool-registrations.ts
     M src/seo/write-service.ts
     M src/site-dir/__tests__/integration/boot-site-dir.integration.test.ts
     M src/site-dir/__tests__/integration/init-site.integration.test.ts
     M src/site-dir/__tests__/integration/path-containment.integration.test.ts
     M src/site-dir/__tests__/integration/portability-moved-dir.integration.test.ts
     M src/site-dir/__tests__/unit/resolve-workspace.unit.test.ts
     M src/site-dir/__tests__/unit/schema-guard.unit.test.ts
     M src/site-dir/boot-site-dir.ts
     M src/site-dir/init-site.ts
     M src/site-dir/read-template.ts
     M src/site-dir/resolve-workspace.ts
     M src/site-dir/schema-guard.ts
     M src/widgets/__tests__/repo.contract.test.ts
     M src/widgets/__tests__/unit/resolvers-menu.unit.test.ts
     M src/widgets/repo.sqlite.ts
     M src/widgets/resolvers/create-core-resolvers.ts
     M src/widgets/resolvers/menu.ts
     M src/widgets/tool-registrations.ts
    ?? src/features/database/gated-hooks.ts
    ?? src/features/recovery/gated-hooks.ts
    ?? src/features/taxonomy/gated-hooks.ts

### ADS-memory (reports + handoff written this session)
     M ADS-memory/reports/recon/open-lovable-analysis.md
    ?? ADS-memory/reports/refactors/2026-08-02-cms-identity-canary.md
    ?? ADS-memory/reports/refactors/2026-08-02-zana-portability-measurement.md
    ?? ADS-memory/reports/refactors/2026-08-03-commit-manifest-unaudited.md
    ?? ADS-memory/reports/refactors/20260802-ports-and-composio-fold.md
    ?? ADS-memory/reports/refactors/agent-report-routedeps.md

## Jini — repo github.com/AINSEP/Jini, branch refactor/jini-admin-extraction

### This session — `packages/cms` (the whole port)
    packages/cms/package.json                 subpath exports, argon2 + sharp optional peers, sideEffects
    packages/cms/scripts/check-packaging.mjs  NEW guard (undeclared deps / sideEffects / process.env)
    packages/cms/src/core/                    kernel: ports, commands/{command,change-set}, tools/registration-kit
    packages/cms/src/identity/                identity domain (17 files) + hasher subpath
    packages/cms/src/navigation/              menus domain (11 files)
    packages/cms/src/media/                   media domain (18 files)
    packages/cms/src/settings/                IN FLIGHT at commit time — agent still working
    packages/cms/vitest.config.ts             (records the "no ./react layer" decision — under review)

### Pre-existing, NOT this session, NOT audited by anyone here
    packages/admin/package.json               modified by an earlier session
    packages/admin/tsconfig.json              "
    packages/admin/vitest.config.ts           "
    packages/admin/vitest.setup.ts            untracked, earlier session
    packages/admin/src/react/                 untracked, earlier session — SLATED TO MOVE to @jini-ai/ui
    packages/agent-runtime/src/providers/connection-guard.ts   modified by an earlier session
    pnpm-lock.yaml                            lock churn
    agentlab-check.png, assistant-blocked.png deletions from an earlier session

## What the audit should focus on

1. **`packages/cms/src/settings/` was mid-write when this was committed.** Verify it is complete
   and green before trusting it.
2. **Deliberate behavior changes made during the port** — each is a real semantic change, not a move:
   - `SeedIdentityInput.ownerPassword` is now REQUIRED with no default (was
     `process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev"`). Host supplies it in `src/identity/wiring.ts`.
   - `identityInput()` returns `{req, opt}` accessors instead of `Readonly<Record<string,string>>`.
   - ~30 optional properties widened to `?: T | undefined` across identity/media/navigation/core.
   - `TOVU_TEST_TRANSFORM` tag renamed to `TEST_TRANSFORM` in media's in-memory transformer.
   - `sharp` loading changed from `require()` to `createRequire(import.meta.url)`.
   - Tovu's `tsconfig.json` moved to `module`/`moduleResolution: nodenext`.
3. **Security-relevant surface in the port**: `identity/permissions.ts` (the permission catalog and
   its import-time registration), `identity/authorize.ts`, `identity/auth-service.ts` (session
   tokens via `node:crypto`), `identity/password-policy.ts`, and `core/tools/registration-kit.ts`
   (the tool permission gate). None of these were reviewed for correctness — only for compilation
   and test-passing.
4. **Known-failing tests carried into this commit** (all pre-existing, none introduced):
   3x `src/server/__tests__/identity-crud-routes.test.ts` (fixtures below the 12-char password
   minimum from `4b459f1`), 1x `src/features/plugins/store/__tests__/store-plugin.test.ts`, and an
   intermittent `src/server/http/site/__tests__/liquid-sandbox.test.ts` OOM-message flake.
5. **Kernel has 0% test coverage inside the package** — its tests stayed in Tovu.
