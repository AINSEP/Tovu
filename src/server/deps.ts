import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { InMemoryEventBus } from "../core/events/index.js";
// A plain static import, unlike `createApp`/`exportSite` below: `resolveStorefrontProducts` has no
// eager top-level side effect (`routes/site/products.ts`'s module body only declares functions/a
// route registrar), so there is no load-order hazard to defer — see `routes/types.ts`'s
// `resolveStorefrontProducts` doc for why this field exists at all.
import { resolveStorefrontProducts } from "./routes/site/products.js";
import { backfillPostSearchIndex, SqlitePostRepo, SqlitePostSearchIndex, createPostRevertRegistry } from "../features/post/index.js";
import { SqliteDeploymentsReadRepo } from "../features/deployments/index.js";
import { SqlitePublishCredentialSetRepo } from "../db/sqlite/publish-credential-repo.sqlite.js";
import { SqlitePublishHistoryStore } from "../db/sqlite/publish-history-repo.sqlite.js";
import { SqliteCustomCredentialSetRepo } from "../db/sqlite/custom-credential-repo.sqlite.js";
import { SqliteSourceControlCredentialSetRepo } from "../db/sqlite/source-control-credential-repo.sqlite.js";
import { SqliteVendorCredentialSetRepo } from "../db/sqlite/vendor-credential-repo.sqlite.js";
import { executionModeFromEnv } from "../features/deployments/publish-credentials/index.js";
import { InMemoryPublishCredentialVerificationCache } from "../features/deployments/static-publish/index.js";
// NOT a static import — `export/site-exporter.ts` imports `createApp` from `server/app.ts`, and a
// top-level import here reaches that same cycle. See `server/app.ts`'s `runExportSiteLazily` for
// the full trace and the crash it produced. Resolved at call time instead.
import type { ExportEngine } from "../features/deployments/export-run.js";
import { PagesHtmlDocumentStore } from "../features/pages/index.js";
import { createChatStoreFactory, ensurePublicAssistantSettingDefinitions, ensureExecutionSettingDefinitions } from "../assistant/index.js";
import { SqlitePresentationSettingsRepo } from "../features/presentation/index.js";
import { SqliteSettingsRepo } from "../features/settings/repo.sqlite.js";
import { discoverAllBuiltInThemes, seedSiteThemes } from "../features/theme/index.js";
import { SqliteWorkspaceRepo } from "../features/workspace/index.js";
import { openContentDb, type ContentDb } from "../db/sqlite/content-db.js";
import { resolveWorkspace } from "../site-dir/resolve-workspace.js";
import { resolveSiteRoot } from "../site-dir/index.js";
import { recoverIncompleteDataModuleMigrations } from "../features/plugins/migration-recovery.js";
import { SqliteChangeSetRepo } from "../db/sqlite/change-set-repo.sqlite.js";
import { SqliteOutboxAdapter } from "../db/sqlite/outbox-repo.sqlite.js";
import { openDatabaseJournalDb } from "../db/sqlite/database-journal-db.js";
import { SqliteMigrationRunsRepo, SqliteDatabaseLedgerRepo } from "../db/sqlite/database-journal-repo.js";
import { ensureSeoSettingDefinitions } from "../seo/index.js";
import { installNewsletterDataModule } from "../features/newsletter/data-module-manifest.js";
import { ensureDefaultList } from "../features/newsletter/lists.js";
import { createHookRegistry } from "../features/newsletter/hooks.js";
import {
  SqliteNewsletterAudienceSnapshotRepo,
  SqliteNewsletterCampaignRepo,
  SqliteNewsletterConfirmationTokenRepo,
  SqliteNewsletterListRepo,
  SqliteNewsletterSendRepo,
  SqliteNewsletterSubscriptionRepo,
} from "../features/newsletter/repo.sqlite.js";
import { MembersSubscriberDirectory } from "../features/members/index.js";
import {
  seededPosts,
  seededPresentation,
  seededWorkspace,
  seedSettingsFromPresentation,
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "./seed.js";
import { SqliteBufferSink } from "../db/sqlite/analytics-sink.sqlite.js";
import {
  ConsoleMailerAdapter,
  SqliteMagicLinkTokenRepo,
  SqliteMemberRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,
} from "../features/members/index.js";
import { SqliteCommercePriceRepo, SqliteCommerceProductRepo } from "../features/commerce/repo.sqlite.js";
import { rebuildNavLocationBindings } from "../navigation/index.js";
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "../navigation/repo.sqlite.js";
import { SqliteWebhookDeliveryRepo, SqliteWebhookSubscriptionRepo } from "../db/sqlite/webhook-repo.sqlite.js";
import { EnvOrFileKeyring } from "../features/webhooks/keyring.env.js";
import { createKeyringBackedSigner } from "../features/webhooks/signing.keyring.js";
import { AesGcmSecretSealer } from "../features/webhooks/secret-sealer.aesgcm.js";
import { SqliteSiteAssistantCredentialRepo } from "../db/sqlite/site-credential-repo.sqlite.js";
import { SqliteAdminExecutionCredentialRepo } from "../db/sqlite/execution-credential-repo.sqlite.js";
import { SqliteComposioConfigRepo } from "../db/sqlite/composio-config-repo.sqlite.js";
import { SqliteConnectorCredentialRepo } from "../db/sqlite/composio-connector-credential-repo.sqlite.js";
import { SqliteMediaProviderCredentialRepo } from "../db/sqlite/media-provider-credential-repo.sqlite.js";
import { SqliteExternalMcpServerRepo } from "../db/sqlite/external-mcp-repo.sqlite.js";
import { createComposioConnectors } from "../connectors/composio-service.js";
import {
  LocalFsBlobStore,
  SharpImageTransformer,
} from "../media/index.js";
import { ensureCoreMediaTransform } from "../media/bootstrap.js";
import { createSqliteIdentityRouteDeps } from "../identity/wiring.js";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "../features/forms/repo.sqlite.js";
import { FORMS_SUBMIT_PROFILE } from "../features/forms/rate-limit-profile.js";
import { createRateLimiter, SITE_ASSISTANT_PER_IP } from "#src/core/rate-limit/rate-limit";
import type { Express } from "express";
import type { RouteDeps } from "./routes/types.js";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps.js";
import { createVerifiedOrigin, OriginRegistry } from "../origin/index.js";
import { seedDevCapabilityOrigin, SqliteOriginSettingRepo } from "../db/sqlite/origin-repo.sqlite.js";
import {
  SqliteAssetBlobRepo,
  SqliteAssetRenditionRepo,
  SqliteMediaContentTypeStore,
  SqliteMediaRepo,
  SqliteTransformDefinitionRepo,
} from "../db/sqlite/media-repo.sqlite.js";
import {
  RedirectHitSinkImpl,
  RedirectPhaseHandlerResolver,
  redirectMatcher,
  RedirectSlugChangeCapture,
  registerRedirectHitOutboxHandler,
  registerRedirectsPhaseHandlers,
  SqliteRedirectRepo,
  type RedirectsWriteDeps,
} from "../features/redirects/index.js";
import { registerSlugChangeCapture } from "../routing/index.js";
import { SqliteDbOpsAdapter } from "../db/sqlite/db-ops.js";
import { SqliteRestorePointsRepo } from "../db/sqlite/database-journal-repo.js";
import { SqliteDatabaseIntrospectionAdapter } from "../db/sqlite/database-introspection-adapter.sqlite.js";
import { InMemorySiteStatusRepo } from "../features/database/repo.memory.js";
import { NoopContentTypeIndexProvisioner } from "../features/content-types/index.js";
import { SqliteContentTypeRepo } from "../features/content-types/repo.sqlite.js";
import { SqliteEntryRepo } from "../features/entries/repo.sqlite.js";
import { SqliteWidgetRegionBindingRepo } from "../widgets/repo.sqlite.js";
import { SqliteEntryRefsRepo } from "../db/sqlite/entry-refs-repo.sqlite.js";
import { SqlitePluginActivationRepo } from "../features/plugin-runtime/repo.sqlite.js";
import { WORD_COUNT_RUNTIME_SOURCE } from "../features/plugin-runtime/built-ins/word-count/index.js";
import { composePluginRuntime } from "./plugin-runtime.js";
import { wireCoreResolvers } from "../widgets/resolvers/index.js";
import { createNavMenuReadModel } from "../navigation/index.js";
import { createCommentsModule, ensureCommentsSettingDefinitions } from "../features/comments/index.js";
import {
  ensureSettingsUiTabDefinitions,
  getEffective,
  set,
  resolveDefinitionRaw,
  registerDefinitions,
  ensureSettingDefinitions,
  SCOPE_BIT,
  INSTRUCTIONS_NAMESPACE,
} from "../features/settings/index.js";
import { createSettingsAnalyticsConfig, ensureAnalyticsSettingDefinitions } from "../analytics/config.settings.js";
import { SqliteCommentRepo } from "../features/comments/repo.sqlite.js";
import { installCommentsDataModule } from "../features/comments/data-module-install.js";
import {
  SqliteEntryTermRepo,
  SqliteTaxonomyRepo,
  SqliteTaxonomyRevisionRepo,
  SqliteTermRepo,
  sqliteStampWatermark,
} from "../features/taxonomy/repo.sqlite.js";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "../features/recovery/repo.memory.js";
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from "../core/gated-mutations/composition.js";
import { resolveRuntimeMode } from "#src/core/runtime-mode";
import { wrapMailerWithPurposeGate } from "../mail/purpose-scoped-mailer.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "#src/assistant/index";
import { createPendingAuthorizationStore } from "#src/oauth/index";

/**
 * The one site folder this process serves — the root every other runtime path below derives from.
 *
 * Replaces the old `infra/` convention (2026-08-27). `infra/` conflated two different things: the
 * repo's own scratch space, and the SITE's data. They have opposite lifecycles — upgrading Tovu
 * should replace the first and never touch the second — and keeping them in one directory is why
 * a site's themes ended up living inside the package (`src/themes/`), where an upgrade destroys
 * them along with their own "reset to original" backups.
 *
 * A site is a portable folder that owns its own `content.db`, `uploads/`, `themes/`, and journals
 * — ADR-012's install-dir model, already implemented for the CLI by SPEC-003's `tovu init` /
 * `tovu serve <dir>` (`site-dir/boot-site-dir.ts`). This function is that same model's DEFAULT for
 * the non-CLI boot path (`src/index.ts`), which previously had no site folder at all and derived
 * everything from `process.cwd()`.
 *
 * A thin `process`-reading wrapper, not the rule itself: {@link resolveSiteRoot} (`site-dir/`) owns
 * the `TOVU_SITE_DIR` / `TOVU_SITE` precedence, because `features/skills/layout.ts` and
 * `features/agent-plugins/layout.ts` need the same answer and must not import this composition
 * root to get it. Every `TOVU_*_DIR` below still overrides its own subpath independently, so a
 * deployment that relocates exactly one directory (a large uploads volume, say) does not have to
 * move the rest.
 */
export function siteDir(): string {
  return resolveSiteRoot();
}

/**
 * Root directory `LocalFsBlobStore` writes blob bytes under (ADR-012 `uploads/` convention,
 * mirroring `defaultContentDbPath()` below).
 */
export function mediaUploadsDir(): string {
  // Sibling of `defaultContentDbPath()`'s `<site>/content.db` — both now derive from the same
  // {@link siteDir}. Note this one is NOT derived from `dirname(contentDbPath)`, so a deployment
  // that overrides `TOVU_CONTENT_DB` alone still leaves uploads here; that independence is why
  // `uploads/` was historically the one runtime directory that did not follow the database
  // automatically, and it is preserved deliberately.
  return process.env.TOVU_MEDIA_UPLOADS_DIR ?? join(siteDir(), "uploads");
}

/**
 * The read-only STOCK themes tree that ships with the product: `content/themes/`, copied to
 * `dist/content/themes/` at build time (mirrors `content/templates/` -> `dist/content/templates/`)
 * and resolved package-relative to this file — never `process.cwd()` (CR-R04 fix: `tovu serve` used
 * to read `process.cwd()/themes`, which is wrong whenever the CLI is invoked from outside the repo
 * checkout).
 *
 * TWO levels up, not one (2026-08-27: this tree moved out of `src/` — it holds zero `.ts` files and
 * is data, not code). The offset is what makes the expression layout-portable, not the absolute
 * result: `src/server/` and `dist/src/server/` are each exactly two levels below their own root, so
 * `../../content/themes` lands on `<repo>/content/themes` under `tsx` and on `dist/content/themes`
 * under `node dist/src/index.js`. A path that resolves correctly in only one of those two trees is
 * the specific bug this shape avoids.
 *
 * SEED SOURCE ONLY as of 2026-08-27. Nothing serves or writes this tree at runtime any more —
 * `RouteDeps.themesDir` is {@link siteThemesDir}, and `seedSiteThemes()` copies this into a site
 * once, on the first boot where the site has no `themes/` of its own. That split is the whole point
 * of the `infra/` -> `sites/` move: an upgrade replaces `src/` (and therefore this tree), so a
 * site's edited themes and their `__original-themes__/` backups cannot live here.
 *
 * The env var is `TOVU_STOCK_THEMES_DIR`, NOT `TOVU_THEMES_DIR` — the latter moved to
 * {@link siteThemesDir}, where "where MY themes live" is what an operator setting it actually
 * means.
 */
export function builtInThemesDir(): string {
  return process.env.TOVU_STOCK_THEMES_DIR ?? resolve(import.meta.dirname, "../../content/themes");
}

/**
 * `TOVU_THEMES_DIR` env, then `<site>/themes` — the site's OWN themes root, and the only theme tree
 * anything reads or writes at runtime (`RouteDeps.themesDir`: the Theme Studio's file editor, the
 * agent theme tools, marketplace downloads, `__original-themes__/` resets, and both static-asset
 * mounts in `server/app.ts`).
 *
 * Seeded from {@link builtInThemesDir} on a site's first boot — see `seedSiteThemes()`'s own header
 * for why that copies the whole ~19MB tree rather than filling in on demand.
 */
export function siteThemesDir(): string {
  return process.env.TOVU_THEMES_DIR ?? join(siteDir(), "themes");
}

/**
 * Agent Plugins that ship WITH the product live in `content/agent-plugins/<pluginId>/`, copied to
 * `dist/content/agent-plugins/` at build time and resolved package-relative to this file — the exact
 * same shape as {@link builtInThemesDir} immediately above, including the two-levels-up offset that
 * makes it land correctly in both the source and compiled layouts, and for the same reason (CR-R04:
 * a `process.cwd()`-relative path is wrong the moment the CLI is invoked from outside the checkout).
 *
 * Deliberately NOT `<site>/agent-plugins/`. That directory is `layout.ts`'s per-workspace INSTALL
 * root — gitignored site data (`sites/README.md`), populated by extraction, and frozen read-only
 * per digest. Product-shipped source cannot live there: it would not be tracked, would not ship in
 * a release, and would collide with the content-addressed tree the installer owns. Bundled source
 * is an INPUT to installation (`features/agent-plugins/seed-bundled.ts`), not a location within it.
 */
export function bundledAgentPluginsDir(): string {
  return process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR ?? resolve(import.meta.dirname, "../../content/agent-plugins");
}

/**
 * `TOVU_EXPORT_DIR` env, then `<site>/out/export` — the static-site export engine's default output
 * directory root. Build OUTPUT, grouped under the site's `out/` so it is visibly regenerable and
 * never confused with the site's own source data (`content.db`, `uploads/`, `themes/`).
 * Read ONCE here (mirrors `siteThemesDir()`/`mediaUploadsDir()` immediately
 * above) rather than re-read deep in `features/deployments/export-run.ts` (the admin route's export
 * trigger + the `deployment_trigger_export` agent tool) or `cli/commands/export.ts` (`tovu export`)
 * — both now read `RouteDeps.exportOutputRootDir` instead, which this function feeds in both
 * composition roots (`server/app.ts`'s `createRouteDeps()` and this file's
 * `createSqliteRouteDeps()`). See `routes/types.ts`'s `exportOutputRootDir` doc for the full
 * reasoning.
 */
export function resolveExportOutputRootDir(): string {
  return process.env.TOVU_EXPORT_DIR !== undefined ? resolve(process.env.TOVU_EXPORT_DIR) : join(siteDir(), "out", "export");
}

/**
 * `TOVU_SOURCE_CONTROL_EXPORT_DIR` env, then `<site>/out/source-control-export` — the
 * `source-control` domain's own export scratch directory, deliberately separate from
 * {@link resolveExportOutputRootDir} above so a static-site export and a source-control commit
 * export never race over the same on-disk output (see `features/source-control/commit-site.ts`'s
 * header). Read ONCE here, same reasoning as {@link resolveExportOutputRootDir}.
 */
export function resolveSourceControlExportRootDir(): string {
  return process.env.TOVU_SOURCE_CONTROL_EXPORT_DIR !== undefined
    ? resolve(process.env.TOVU_SOURCE_CONTROL_EXPORT_DIR)
    : join(siteDir(), "out", "source-control-export");
}

/**
 * `TOVU_PUBLISH_DIR` env, then `<site>/out/publish` — the static-publish flow's parent output
 * directory; each target gets its own subdirectory under it (see
 * `features/deployments/static-publish/adapter.ts`'s `publishOutputDir`). Read ONCE here, same
 * reasoning as {@link resolveExportOutputRootDir}.
 */
export function resolvePublishOutputRootDir(): string {
  return process.env.TOVU_PUBLISH_DIR !== undefined ? resolve(process.env.TOVU_PUBLISH_DIR) : join(siteDir(), "out", "publish");
}

/**
 * `TOVU_PLUGINS_DIR` env, then `<site>/plugins` — the per-site root `discoverPlugins()`
 * scans for site-installed plugins (SPEC-005 REQ-02's `<install-dir>/plugins/<id>/<version>/`
 * layout; this function resolves the `<install-dir>/plugins` segment itself, matching what
 * `discoverPlugins({ installDir })`'s own fixtures pass — see `discovery.ts`'s
 * `listInstalledPluginIdFolders`, which lists `<installDir>/<id>/` directly).
 *
 * Deliberately instance-wide, not per-workspace (unlike `src/features/agent-plugins/layout.ts`'s
 * `ws/<workspaceId>/` tenant isolation, a DIFFERENT feature with its own later, separate tenancy
 * decision): SPEC-005's `plugin_activations` table is already the per-workspace boundary (REQ-07,
 * `workspaceId`+`pluginId` primary key) — an installed plugin ARTIFACT is shared across every
 * workspace on this instance, same as `siteThemesDir()`'s themes; only its enabled/disabled
 * state is workspace-scoped. Read ONCE here, same reasoning as {@link resolveExportOutputRootDir}.
 */
export function pluginsInstallDir(): string {
  return process.env.TOVU_PLUGINS_DIR !== undefined ? resolve(process.env.TOVU_PLUGINS_DIR) : join(siteDir(), "plugins");
}

/**
 * @file SQLite-backed composition of route dependencies.
 *
 * Purpose:
 * Builds the same `RouteDeps` shape the in-memory path produces, but with the
 * three feature repos backed by a persistent content.db.
 *
 * How it relates to the project:
 * - Used by the process entrypoint (`index.ts`) for the running server.
 * - Tests keep using the in-memory default in `server/app.ts` (hermetic).
 *
 * Note: outbox + event bus remain in-memory for now (events are fire-on-write
 * side effects, not yet durable across restarts) — a durable outbox is a later
 * slice. Persistence here covers the content model (workspaces/posts/themes).
 */
export function defaultContentDbPath(): string {
  // `sites/<name>/content.db` (2026-08-27), via {@link siteDir}. Was `infra/content.db`, and before
  // that the bare working directory. ADR-012's model is unchanged — a site is a portable folder
  // owning its own `content.db`/`uploads/` — but the *default* now names a real site folder rather
  // than a shared scratch directory, so everything derived from `dirname(contentDbPath)` (the `ops/`
  // sidecar journals, every plugin-migration snapshot, every captured restore point, and
  // `agent-daemon-server.ts`'s `uploads/chat-attachments`) lands inside that one site instead of
  // beside the repo. A deployment still passes an explicit dir, and `TOVU_CONTENT_DB` still
  // overrides this outright. ABSOLUTE now, where the old `join("infra", "content.db")` was relative.
  return process.env.TOVU_CONTENT_DB ?? join(siteDir(), "content.db");
}

/**
 * ADR-041 §2 — the sidecar `ops/database-journal.db` lives as a sibling of `content.db` in the
 * install-dir tree, never inside it (a physically separate SQLite file so a `content.db` restore
 * never erases the incident record narrating that very restore). Defaults to `<dirname of
 * content.db>/ops/database-journal.db`; overridable independently via `TOVU_DATABASE_JOURNAL_DB`
 * for deployments that relocate the sidecar journal on its own.
 */
export function defaultDatabaseJournalDbPath(contentDbPath: string = defaultContentDbPath()): string {
  return process.env.TOVU_DATABASE_JOURNAL_DB ?? join(dirname(contentDbPath), "ops", "database-journal.db");
}

/**
 * SPEC-003 (ADR-PIPE-003 C-010) — an already-opened db + a resolved workspace id, supplied by
 * the install-dir boot path (`site-dir/boot-site-dir.ts`) instead of this function opening its
 * own db. `db`/`workspaceId` are required together or omitted together (validated below) — there
 * is no legal state where only one is supplied. `uploadsDir` is independent of that pair.
 */
export interface CreateSqliteRouteDepsOverrides {
  db: ContentDb;
  workspaceId: string;
  /** Consecutive plugin hook failures before automatic quarantine. */
  pluginFailureThreshold: number;
  /**
   * Install-dir-relative uploads path — `cli/commands/serve.ts` supplies `<dir>/uploads` (CR-R01
   * fix: uploads used to always default to `mediaUploadsDir()`, which is `process.cwd()`-relative
   * and therefore wrong whenever `tovu serve <dir>` is invoked from outside that dir). Omitted, it
   * falls back to `mediaUploadsDir()` — the legacy same-directory dev boot's existing behavior.
   */
  uploadsDir: string;
  /**
   * Install-dir-relative themes path — `cli/commands/{serve,export}.ts` supply `<dir>/themes`, for
   * exactly the reason `uploadsDir` above exists (CR-R01): the default {@link siteThemesDir} is
   * `process.cwd()`-relative, so `tovu serve <dir>` invoked from outside `<dir>` would otherwise
   * seed and serve a `sites/tovu-com/themes` next to wherever the operator happened to be standing
   * rather than the site it was told to run. Omitted, it falls back to {@link siteThemesDir}.
   */
  themesDir: string;
}

/**
 * 2026-08-20 (complexity pass) — CIC U-001 / Contract Map C-010's paired-override guard, hoisted
 * out of `createSqliteRouteDeps`. Each `overrides?.field` read is its own branch under ESLint's
 * `complexity` rule; splitting the two reads plus the comparison `if` into their own 4-line
 * function moves those 3 points of complexity here instead of onto the composition root, without
 * changing what gets checked or when.
 */
function assertOverridesPairedOrAbsent(overrides?: Partial<CreateSqliteRouteDepsOverrides>): void {
  const hasOverrideDb = overrides?.db !== undefined;
  const hasOverrideWorkspaceId = overrides?.workspaceId !== undefined;
  if (hasOverrideDb !== hasOverrideWorkspaceId) {
    throw new Error(
      "createSqliteRouteDeps: overrides.db and overrides.workspaceId must be supplied together or not at all"
    );
  }
}

/**
 * Builds `composePluginRuntime`'s optional `failureThreshold` field from `overrides` — the exact
 * undefined-check-and-conditional-spread shape `server/app.ts`'s `createRouteDeps` repeats for its
 * own optional `composePluginRuntime` fields, hoisted here for the same reason
 * {@link assertOverridesPairedOrAbsent} is: one ternary counted once, not inline in the composition
 * root.
 */
function pluginFailureThresholdOverride(
  overrides?: Partial<CreateSqliteRouteDepsOverrides>
): { failureThreshold?: number } {
  return overrides?.pluginFailureThreshold === undefined ? {} : { failureThreshold: overrides.pluginFailureThreshold };
}

export function createSqliteRouteDeps(
  dbPath: string = defaultContentDbPath(),
  overrides?: Partial<CreateSqliteRouteDepsOverrides>
): NewsletterRouteDeps {
  assertOverridesPairedOrAbsent(overrides);

  // Resolved ONCE and threaded down, the same discipline `exportOutputRootDir`/`themesDir` already
  // follow (see `routes/types.ts`). Seeded before anything discovers themes off it: on a site's
  // first boot `<site>/themes` does not exist yet, and `discoverAllBuiltInThemes` below would
  // otherwise hand the admin an empty theme list. Deliberately NOT done in `server/app.ts`'s
  // in-memory `createRouteDeps()` — that is the hermetic/test path, and seeding there would copy
  // the whole ~19MB stock tree per test run.
  const resolvedThemesDir = overrides?.themesDir ?? siteThemesDir();
  seedSiteThemes({ stockDir: builtInThemesDir(), siteThemesDir: resolvedThemesDir });

  // When `overrides.db` is supplied (the install-dir `serve` path), reuse that SAME handle rather
  // than opening/migrating a second db — `bootSiteDir` has already validated, migrated, and
  // stamped this db before calling here (BR-05/BR-06).
  const db =
    overrides?.db ??
    openContentDb(
      dbPath,
      {
        workspace: seededWorkspace,
        posts: seededPosts,
        presentation: seededPresentation,
      },
      // ADR-023 §2 — mandatory, blocking boot-time recovery for any crash-interrupted dataModule
      // DDL attempt, before the site opens to end users.
      recoverIncompleteDataModuleMigrations
    );
  // CIC U-001 (Workspace-id single-source-of-truth): ONE resolved variable, reused by every
  // internal construction below that used to read the old seeded-workspace literal directly —
  // this is the sole `resolveWorkspace` call site in this function (U-001-B1's grep-checkable
  // invariant: zero remaining literal references outside this line). The legacy default path (no
  // overrides) resolves it dynamically too (rather than keeping the literal for that branch
  // only), so both paths share one mechanism instead of two that could drift (REQ-06/REQ-10;
  // every existing seeded fixture has exactly one workspace row, so this is behavior-identical to
  // the old literal for every current caller — see CIC's Design Context).
  const workspaceId = overrides?.workspaceId ?? resolveWorkspace({ db }).id;
  // Posts written before migration 0022 existed — and the demo content `openContentDb` seeds
  // directly into `posts`, bypassing `SqlitePostRepo` entirely — have no FTS projection yet, so
  // `content_post_search` would not find them without an edit. Synchronous and unconditional (not
  // one of this file's fire-and-forget `*Ready` promises): on a warm database it is a single
  // indexed anti-join that writes nothing, and running it before the deps are handed out means no
  // consumer can ever observe a half-indexed corpus. See `backfillPostSearchIndex`'s own doc for
  // why it fills gaps rather than rebuilding.
  backfillPostSearchIndex(db.$client);
  const clock = { nowIso: () => new Date().toISOString() };
  const idGen = { newId: () => randomUUID() };
  const pluginActivationRepo = new SqlitePluginActivationRepo(db);
  const pluginRuntime = composePluginRuntime({
    workspaceId,
    clock,
    activationRepo: pluginActivationRepo,
    sources: [WORD_COUNT_RUNTIME_SOURCE],
    // Reachability fix: previously omitted entirely, so `discoverPlugins()` only ever scanned the
    // compiled-in built-in registry — a plugin placed on disk (REQ-02's install layout) was
    // invisible to every real boot of this composition root, no matter how it got there.
    installDir: pluginsInstallDir(),
    ...pluginFailureThresholdOverride(overrides),
  });
  // SQLite-backed identity (principals/users/sessions/roles/policies persist in content.db) so a
  // login survives a `tsx watch` restart instead of being silently wiped every file save.
  const identity = createSqliteIdentityRouteDeps({ db, workspaceId, clock, idGen });
  const presentationRepo = new SqlitePresentationSettingsRepo(db);
  const settingsRepo = new SqliteSettingsRepo(db);
  // Fire-and-forget, mirroring `identityReady` (see routes/types.ts's `settingsReady` doc) — this
  // composition root stays synchronous; consumers await `settingsReady` before relying on the
  // migrated value being present.
  const settingsReady = seedSettingsFromPresentation({
    presentationRepo,
    settingsRepo,
    clock,
    ids: idGen,
    principals: identity.principalRepo,
    systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
  }).then(() => undefined);
  // SPEC-008 (ADR-PIPE-008 Decision §3, T050) — idempotently registers the 8 `site.seo.*`
  // definitions at boot, mirroring `settingsReady`'s fire-and-forget shape. Chained AFTER
  // `settingsReady` resolves, not fired in parallel with it — both are SQLite writers on the
  // SAME single better-sqlite3 connection, and `SettingsWriteService`'s chokepoint opens a real
  // `BEGIN IMMEDIATE` transaction; two independent async chains racing to BEGIN on one connection
  // throws "cannot start a transaction within a transaction" (caught directly, not theoretical).
  const seoReady = settingsReady.then(() =>
    ensureSeoSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: workspaceId, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // SPEC-035 (ADR-028 Settings Layered Ledger wiring for Comments) — idempotently registers the 6
  // `comments.*` definitions at boot, mirroring `seoReady`'s exact fire-and-forget shape. Chained
  // AFTER `seoReady` resolves, not fired in parallel — same single-SQLite-connection transaction
  // hazard `seoReady`'s own comment documents immediately above.
  const commentsSettingsReady = seoReady.then(() =>
    ensureCommentsSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: workspaceId, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The visitor-facing assistant's master switch (`assistant/public-assistant-settings.ts`).
  // Chained after `commentsSettingsReady`, not fired in parallel, for the same
  // single-SQLite-connection transaction hazard `seoReady`'s comment above documents. Registering
  // the definition does NOT enable anything: its default is `false`.
  const assistantSettingsReady = commentsSettingsReady.then(() =>
    ensurePublicAssistantSettingDefinitions(
      {
        settingsRepo,
        clock,
        ids: idGen,
        principals: identity.principalRepo,
        resolveDefinitionRaw,
        registerDefinitions,
        scopeBit: SCOPE_BIT,
      },
      { workspaceId: workspaceId, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The admin "Execution mode" tab's `core.execution.*` definitions
  // (`assistant/execution-mode-settings.ts`). Chained after `assistantSettingsReady` rather than
  // fired in parallel, for the identical single-SQLite-connection-transaction reason `seoReady`'s
  // own comment above documents. `ownerKind: "core"` (not "site"), so unlike the three bindings
  // above this one does not pass a `workspaceId` into the registration call — see that file's
  // header for the namespace-fence reasoning.
  const executionSettingsReady = assistantSettingsReady.then(() =>
    ensureExecutionSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo, ensureSettingDefinitions },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The remaining ledger-only settings-dialog tabs (Instructions, Notifications, Privacy).
  // Chained after `executionSettingsReady` rather than fired alongside it for the same
  // single-SQLite-connection-transaction reason every registration above documents.
  const settingsUiTabsReady = executionSettingsReady.then(() =>
    ensureSettingsUiTabDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // The public analytics beacon's `core.analytics.*` definitions (`analytics/config.settings.ts`).
  // Chained after `settingsUiTabsReady` rather than fired alongside it, for the identical
  // single-SQLite-connection-transaction reason every registration above documents.
  const analyticsSettingsReady = settingsUiTabsReady.then(() =>
    ensureAnalyticsSettingDefinitions(
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
    ).then(() => undefined)
  );

  // ADR-PIPE-012 D-5/D-8 (T043/T044): the persistent composition root uses the real SQLite
  // adapters for both navigation repo ports, and runs the binding-index rebuild once at boot
  // (after the SQLite db above has already opened) so the derived index starts in sync with
  // whatever menus this content.db already holds. Fire-and-forget, mirroring `settingsReady`'s
  // shape — logged and swallowed rather than aborting boot, matching W-003's "logs and continues
  // on failure" contract (ADR-PIPE-012 Wiring Map).
  const menuRepo = new SqliteMenuRepo(db);
  const navLocationBindingRepo = new SqliteNavLocationBindingRepo(db);
  const menuBindingsReady = rebuildNavLocationBindings({
    menuRepo,
    bindingRepo: navLocationBindingRepo,
    clock,
    workspaceId: workspaceId,
  })
    .then(() => undefined)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`rebuildNavLocationBindings failed at boot: ${(err as Error).message}`);
    });
  void menuBindingsReady;

  // SPEC-011 (Newsletter, ADR-PIPE-011 T011/W-010): boot-time `declareDataModule()` invocation for
  // Newsletter's real 5-table manifest, against the SAME raw better-sqlite3 handle underneath the
  // Drizzle `ContentDb` (mirrors `SqliteSettingsRepo.transaction`'s `$client` cast). Idempotent —
  // `declareDataModule()`'s own skip-if-exists logic makes repeated boot calls safe (T010 proves the
  // failure/rollback path separately). Fire-and-forget, mirroring `menuBindingsReady`'s shape: logged
  // and swallowed rather than aborting boot on failure — a failed install leaves Newsletter's admin
  // routes 404/500ing against missing tables, but never bricks the rest of the server.
  const newsletterClient = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  const newsletterListRepo = new SqliteNewsletterListRepo(db);
  // T030: seed the workspace's default "all subscribers" list right after the tables exist —
  // idempotent (`ensureDefaultList` is itself a find-or-create), matching `declareDataModule()`'s own
  // skip-if-exists convention.
  const newsletterReady = installNewsletterDataModule({ db: newsletterClient, dbPath })
    .then(() => ensureDefaultList({ deps: { listRepo: newsletterListRepo, clock, ids: idGen }, input: { workspaceId: workspaceId } }))
    .then(() => undefined)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`installNewsletterDataModule failed at boot: ${(err as Error).message}`);
    });

  /**
   * ADR-031/ADR-023 (SPEC-033) — Comments' `declareDataModule()` call, against the SAME shared
   * `db.$client` connection Newsletter's install just used. Chained AFTER `newsletterReady`
   * resolves (NOT fired in parallel), for the exact same reason `seoReady` is chained after
   * `settingsReady` above: two independent fire-and-forget async chains racing SQLite calls
   * (including SPEC-032's exclusive-lock pragma toggling) against ONE shared connection produced
   * a real, deterministically-reproduced "database is locked" failure — caught via a live
   * multi-boot smoke test, not a synthetic case. This is the identical hazard class this file's
   * own `seoReady` comment already documents; this fixes the same mistake made fresh here.
   */
  const commentsReady = newsletterReady
    .then(() => installCommentsDataModule({ db: db.$client, dbPath }))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`installCommentsDataModule failed at boot: ${(err as Error).message}`);
    });

  // ADR-027 §4 — the core "public" transform definition that lets the unauthenticated `/m/`
  // rendition route serve ANY asset at all (`media/bootstrap.ts`'s file header has the full
  // diagnosis: with zero rows in `transform_registry`, every `/m/` request 404s regardless of
  // what media exists). Hoisted here (rather than down with the other media repos below) so this
  // call and the returned `RouteDeps.transformDefinitionRepo` field share the SAME repo instance
  // rather than two independent wrappers over the same table. Chained after `commentsReady`, not
  // fired in parallel, for the identical single-SQLite-connection transaction hazard every `Ready`
  // chain in this function documents; fire-and-forget and not exposed on `RouteDeps`, mirroring
  // `menuBindingsReady`'s shape — nothing downstream needs to gate a request on this resolving,
  // since `ensureCoreMediaTransform` is idempotent and the window between boot and its single
  // insert completing is a few milliseconds.
  const transformDefinitionRepo = new SqliteTransformDefinitionRepo(db);
  const mediaTransformReady = commentsReady
    .then(() =>
      ensureCoreMediaTransform({
        deps: { clock, idGen, transformRepo: transformDefinitionRepo },
        input: { workspaceId: workspaceId },
      })
    )
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`ensureCoreMediaTransform failed at boot: ${(err as Error).message}`);
    });
  void mediaTransformReady;

  // SPEC-009 (Redirects, ADR-PIPE-009) — FIRST-TIME composition-root wiring of `origin`'s
  // OriginRegistry and `routing`'s registration functions, mirroring `server/app.ts`'s identical
  // wiring. `redirects` DOES get its real `SqliteRedirectRepo` here (unlike the in-memory-only
  // libraries above), since T014 built a full rule-of-two adapter for it.
  // ADR-046 Phase 1 (BR-04 resolution, 2026-07-16 swarm debate): durable SQLite outbox. Events
  // survive a restart; `SqliteChangeSetRepo.insert()`'s co-persisted event and this adapter's
  // `claimPending()`/`markDelivered()`/`markFailed()` share the same `outbox_events` table.
  const outbox = new SqliteOutboxAdapter(db);
  const bus = new InMemoryEventBus();
  // ADR-046 Phase 1 (2026-07-16): durable SQLite origin-settings adapter. `seedDevCapabilityOrigin`
  // is idempotent (find-or-create) — a real future verification flow's write is never clobbered by
  // a re-run of this seed. Read-only adapter/port by design; see `origin-repo.sqlite.ts`'s file
  // header for the disclosed "no real production-origin verification flow exists yet" gap this
  // durability slice does not itself close.
  seedDevCapabilityOrigin({
    db,
    seed: {
      workspaceId: workspaceId,
      origin: createVerifiedOrigin({
        scheme: "http",
        host: "localhost",
        port: 3000,
        verifiedAt: clock.nowIso(),
        source: "dev-capability",
      }),
      // ADR-PIPE-015 T016: a dev-capability egress allowlist entry so the real
      // isAllowedEgressTarget oracle doesn't fail-closed on every fresh dev server — matches the
      // `example.com` target every integrations fixture/test in this repo already uses.
      egressAllowlist: ["example.com"],
    },
  });
  const originRegistry = new OriginRegistry({ repo: new SqliteOriginSettingRepo(db) });
  const redirectRepo = new SqliteRedirectRepo(db);
  const redirectHitSink = new RedirectHitSinkImpl();
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    db: redirectRepo,
    transaction: (fn) => redirectRepo.transaction(fn),
    matcher: redirectMatcher,
    originRegistry,
    clock,
    idGen,
    outbox,
  };
  registerRedirectsPhaseHandlers({
    resolver: new RedirectPhaseHandlerResolver({
      repo: redirectRepo,
      matcher: redirectMatcher,
      originRegistry,
      hits: { outbox, clock, idGen },
    }),
  });
  registerSlugChangeCapture(
    new RedirectSlugChangeCapture({ repo: redirectRepo, db: redirectRepo, clock, idGen })
  );
  void registerRedirectHitOutboxHandler({ bus, hitSink: redirectHitSink });

  // ADR-041 §2 — opens the sidecar ops journal alongside content.db. `mkdirSync` (recursive) is
  // required first: unlike `openContentDb`'s target (the process cwd, which already exists),
  // `ops/` is a new subdirectory better-sqlite3 will not create for us.
  const databaseJournalDbPath = defaultDatabaseJournalDbPath(dbPath);
  mkdirSync(dirname(databaseJournalDbPath), { recursive: true });
  const databaseJournalDb = openDatabaseJournalDb(databaseJournalDbPath);
  // `siteId` reuses `workspaceId` for v1's single-workspace-per-content.db topology — ADR-041 §7
  // names `siteId` vs `workspaceId` as SPEC-003 OQ-04, explicitly unresolved by that ADR; this
  // composition root does not resolve it either, it just picks the only value available today.
  const databaseLedgerRepo = new SqliteDatabaseLedgerRepo({ db: databaseJournalDb, siteId: workspaceId });
  // ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 fix) —
  // the real `migration_runs` read side `reconcileInterruptedMigrationOnBoot` needs. The actual
  // boot-time SCAN call lives in `bootstrap.ts` (a proper sequenced boot module), not here —
  // this composition root only constructs and exposes the port.
  const migrationRunsRepo = new SqliteMigrationRunsRepo({ db: databaseJournalDb, siteId: workspaceId });
  // Admin-UI backend-gap closure (design-spec.md §0.4/§3.8/§4.8, this dispatch): both classes were
  // already built (a prior session's disclosed-but-unwired infra work — see each class's own file
  // header) but never constructed by any composition root until now. `SqliteRestorePointsRepo`
  // shares the same sidecar journal db/siteId as `databaseLedgerRepo` above.
  const restorePointsRepo = new SqliteRestorePointsRepo({ db: databaseJournalDb, siteId: workspaceId });
  const dbOps = new SqliteDbOpsAdapter({ db, filePath: dbPath });
  // ADR-041 §3 (this dispatch) — reuses the SAME already-open `db`/`dbPath` pair `dbOps` above
  // just used, rather than opening a second connection to the same `content.db` file.
  const databaseIntrospection = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });

  // ADR-031/ADR-023 (SPEC-033) — hoisted so the Comments module's `entryLookup` reads the SAME
  // repo the rest of this composition root wires (mirrors `restorePointsRepo`'s identical
  // hoisting rationale above). The actual `commentsReady` I/O (declareDataModule against the
  // SAME shared `db.$client` connection) is chained AFTER `newsletterReady` below — this is
  // pure, synchronous, I/O-free wiring only.
  const entryRepo = new SqliteEntryRepo(db);
  // SPEC-043/ADR-047 (widgets) — hoisted alongside `entryRepo` for the same reason: both the admin
  // `widgets` routes and the public site-render path (`routes/site/pages.ts` → `resolvePageWidgets`,
  // W-004) read/write against the SAME real tables, via the same `db` connection.
  const widgetBindingRepo = new SqliteWidgetRegionBindingRepo(db);
  const entryRefsRepo = new SqliteEntryRefsRepo(db);
  const formDefinitionRepo = new SqliteFormDefinitionRepo(db);
  // SPEC-043/ADR-047 (widgets, Fable adversarial-review fix 2026-07-21) — the boot-wiring pass
  // `resolvers/index.ts`'s `wireCoreResolvers` file header always said was needed before the app
  // served traffic, but no composition root ever called it. Without this, `menu`/`recent-entries`/
  // `contact-form` widgets silently rendered as empty placeholders on every real page — only the
  // two static widget types (`text`/`social-links`) ever worked. Real deps only; `menu`'s
  // `NavMenuReadModel` is the one dependency with no prior real adapter anywhere in the codebase
  // (see `navigation/read-model.ts`'s file header).
  wireCoreResolvers({
    entryList: entryRepo,
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: navLocationBindingRepo }),
    formDefinitionRepo,
  });
  const commentsModule = createCommentsModule({
    commentRepo: new SqliteCommentRepo(db.$client),
    entryRepo,
    outbox,
    clock,
    idGen,
    settingsRepo,
  });

  // SPEC-011 (Newsletter) Stage 5 wiring — hoisted for the same reason `server/app.ts`'s identical
  // hoisting comment explains: `newsletterSubscriberDirectory` must read the SAME member rows the
  // returned `memberRepo` field exposes, and `newsletterKeyring` is the ONE process-lifetime
  // `KeyringPort` instance also used to build `webhookSigner` below (one root key,
  // purpose-namespaced — `webhooks/ports.ts`'s `KeyringPort.derive()` contract — not two).
  const memberRepo = new SqliteMemberRepo(db);
  const newsletterKeyring = new EnvOrFileKeyring();
  const newsletterSubscriberDirectory = new MembersSubscriberDirectory({ members: memberRepo });
  const newsletterHooks = createHookRegistry();

  // ADR-058: the SITE assistant credential store's OWN `KeyringPort` instance — deliberately NOT
  // `newsletterKeyring` above, even though both read the same `TOVU_INTEGRATIONS_ROOT_KEY` env var
  // and (when it is set) derive from byte-identical root-key material. `allowFileFallback: false`
  // here means a missing root key THROWS rather than silently minting
  // `~/.tovu/integrations-root-key.hex` — correct for a store that will hold a real, paid, provider
  // API key, and deliberately different from `newsletterKeyring`'s default (`true`), which is
  // correct for cheaply-rotatable, derived-never-stored signing/token secrets. See ADR-058 §2 for
  // the full reasoning — this asymmetry is intentional, not a bug to reconcile.
  const siteAssistantSecretKeyring = new EnvOrFileKeyring({ allowFileFallback: false });
  const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);
  // Held as a local rather than constructed inline, because the OAuth service below must be given
  // the SAME repo instance the routes read through — two instances would refresh a token into one
  // and read it back from the other.
  const externalMcpServerRepo = new SqliteExternalMcpServerRepo(db);

  // Composio connectors. The service is built BEFORE the deps object because both the routes and
  // the boot hydration below need the same instance — its provider holds the catalog cache and the
  // OAuth pending-state map, so a second instance would silently not share either.
  const composioConfigRepo = new SqliteComposioConfigRepo(db);
  const composioConnectors = createComposioConnectors({
    workspaceId,
    repo: composioConfigRepo,
    credentialRepo: new SqliteConnectorCredentialRepo(db),
    sealer: siteAssistantSecretSealer,
    keyring: siteAssistantSecretKeyring,
    clock,
    // Test-only seam: points the provider at a fake Composio for `development/e2e`. Unset in every
    // real deployment, where the provider's own default origin applies.
    ...(process.env.TOVU_COMPOSIO_BASE_URL ? { baseUrl: process.env.TOVU_COMPOSIO_BASE_URL } : {}),
  });
  // Loads the sealed API key into the provider's synchronous snapshot. Failure is logged, not
  // fatal: an unhydrated provider still serves its static catalog, so the Connectors tab degrades
  // to its unconfigured (gated) state rather than taking the whole admin down.
  void composioConnectors.refresh().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`composio connectors hydration failed at boot: ${(err as Error).message}`);
  });

  // Extracted (not inlined into the return object below) so `revertRegistry` can close over the
  // SAME instance `RouteDeps.postRepo` exposes, rather than a second `SqlitePostRepo(db)` — both
  // are stateless wrappers over the shared `db` handle, so a second instance would behave
  // identically, but reusing one matches this root's existing single-instance convention (see
  // `outbox`/`settingsRepo` above).
  const postRepo = new SqlitePostRepo(db);

  const routeDeps: NewsletterRouteDeps = {
    workspaceId: workspaceId,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    postRepo,
    postSearch: new SqlitePostSearchIndex(db),
    // SPEC-047/ADR-056 — the db handle and clock are closed over here so no route ever holds one;
    // a route supplies only the `(workspaceId, postId)` scope. See `RouteDeps.pagesHtmlStore`.
    // `entryRefsRepo` (SPEC-047 Slice 3) is the same instance `RouteDeps.entryRefsRepo` below
    // exposes — one shared index, not a second writer.
    pagesHtmlStore: (scope) => new PagesHtmlDocumentStore(scope, { db, clock, entryRefsRepo }),
    // `$client` is the raw better-sqlite3 handle under Drizzle. Passed through because
    // `@jini-ai/sqlite`'s chat-history adapter takes a handle and never opens a database — the
    // property that keeps it writing into `content.db` rather than its own `app.sqlite`. The
    // tables come from migration `0023`, applied by Tovu's own migrator.
    chatHistory: createChatStoreFactory(db.$client),
    presentationRepo,
    settingsRepo,
    getEffective,
    set,
    instructionsNamespace: INSTRUCTIONS_NAMESPACE,
    seoReady,
    settingsReady,
    assistantSettingsReady,
    siteAssistantCredentialRepo: new SqliteSiteAssistantCredentialRepo(db),
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    // The ADMIN's own BYOK credential store — reuses the SAME sealer/keyring instances just above
    // (see `routes/types.ts`'s `adminExecutionCredentialRepo` doc for why one shared sealing
    // capability is correct here rather than a third `EnvOrFileKeyring` instance).
    adminExecutionCredentialRepo: new SqliteAdminExecutionCredentialRepo(db),
    // Same shared sealer/keyring again — one sealing capability across all three credential tables.
    mediaProviderCredentialRepo: new SqliteMediaProviderCredentialRepo(db),
    externalMcpServerRepo,
    /**
     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`
     * external MCP connections. Built HERE rather than inside `modules/external-mcp.ts` because its
     * pending-authorization and device-authorization stores are in-memory and must be shared by the
     * connect route and the public callback route — two routes in the same module, one instance,
     * and a composition root is where "one instance" is expressible. See
     * `routes/types.ts`'s `externalMcpOAuth` doc for why the field is optional at all.
     */
    externalMcpOAuth: createExternalMcpOAuthService({
      workspaceId,
      repo: externalMcpServerRepo,
      sealer: siteAssistantSecretSealer,
      keyring: siteAssistantSecretKeyring,
      clock,
      pending: createPendingAuthorizationStore({ clock }),
      devices: createDeviceAuthorizationStore(),
    }),
    // Same shared sealer/keyring once more — see the note above the BYOK repo.
    composioConfigRepo,
    composioConnectors,
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    // ADR-046 Phase 1 slice 1 (SPEC-023, 2026-07-16): change-set mutation history now survives a
    // restart — the first durable-adapter slice off Phase 1's capability table, per the ADR's own
    // "pull-based per capability, not a uniform sweep" fold-in guidance.
    changeSets: new SqliteChangeSetRepo(db),
    // Pre-loaded with the post-domain reverters, closed over the SAME postRepo/clock/outbox
    // instances this root threads through everything else (ADR-018 C-005/C-006; 2026-08-13
    // features-post-deep-import-trace.md Job 2 — see `features/post/reverters.ts`'s header).
    revertRegistry: createPostRevertRegistry({ postRepo, clock, outbox }),
    themes: discoverAllBuiltInThemes({ dir: resolvedThemesDir, source: "built-in" }),
    themesDir: resolvedThemesDir,
    outbox,
    bus,
    clock,
    idGen,
    // ADR-046 Phase 1 (final capability slice): analytics ingest buffer is durable — survives a
    // restart, closing the `LocalBufferSink.capabilities().durable` misreport the capability
    // inventory flagged.
    analyticsSink: new SqliteBufferSink({ db, workspaceId: workspaceId }),
    analyticsConfig: createSettingsAnalyticsConfig({ settingsRepo }),
    ...identity,
    redirectRepo,
    redirectHitSink,
    originRegistry,
    redirectsWriteDeps,
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters — already fully built and
    // contract-tested, wired into a real composition root for the first time.
    memberRepo,
    memberTierRepo: new SqliteMemberTierRepo(db),
    memberSubscriptionRepo: new SqliteMemberSubscriptionRepo(db),
    memberSessionRepo: new SqliteMemberSessionRepo(db),
    magicLinkRepo: new SqliteMagicLinkTokenRepo(db),
    // SPEC-022 REQ-09/REQ-10: every send routes through the purpose-scoped seam. No capability
    // has a durable outbox path yet (Phase 1 territory — see capability-inventory.ts's "outbox"
    // entry), so `durableOutboxReady` is unconditionally false today; in `local` mode (the
    // default) the gate never refuses regardless (INV-06).
    mailer: wrapMailerWithPurposeGate({
      inner: new ConsoleMailerAdapter(),
      mode: resolveRuntimeMode(),
      durableOutboxReady: () => false,
    }),
    menuRepo,
    navLocationBindingRepo,
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters, wired into a real composition root
    // for the first time. Delivery-worker activation itself stays gated (REQ-07/SPEC-022's
    // capabilityRouteGuard unconditionally contains "webhooks" in production mode regardless of
    // durability) until a Phase-1-follow-on spec supplies the rest of the production gate ADR-046
    // names for this row (guarded HttpClientPort, egress policy, worker lifecycle).
    webhookSubscriptionRepo: new SqliteWebhookSubscriptionRepo(db),
    webhookDeliveryRepo: new SqliteWebhookDeliveryRepo(db),
    // ADR-PIPE-015 Phase 1: the real KeyringPort-backed signer (GAP-02/GAP-03). Inert until
    // Phase 4 registers the fan-out subscriber + delivery worker — no route calls this directly
    // yet, so wiring it now carries no live-traffic risk ahead of that gated activation.
    webhookSigner: createKeyringBackedSigner(newsletterKeyring),
    // ADR-046 Phase 1 (2026-07-16): durable SQLite adapters for all four route-consumed media
    // repos — previously in-memory (ADR-027 walking skeleton, rows lost on every restart). Bytes
    // already used the real `LocalFsBlobStore` (unlike `server/app.ts`'s hermetic-test
    // composition) since durable byte database was always the one piece of Media pointless to fake
    // in the actual running server.
    mediaRepo: new SqliteMediaRepo(db),
    assetBlobRepo: new SqliteAssetBlobRepo(db),
    assetRenditionRepo: new SqliteAssetRenditionRepo(db),
    mediaContentTypeStore: new SqliteMediaContentTypeStore(db),
    // 2026-08-12: wiring products into template render data. Plain Drizzle repos over the SAME
    // `db` every other adapter above already shares — no plugin/`declareDataModule()` bootstrap
    // needed (unlike `store`/`lipay`), so this is as cheap as `mediaRepo` above, not a `store`-
    // style special case.
    commerceProductRepo: new SqliteCommerceProductRepo(db),
    commercePriceRepo: new SqliteCommercePriceRepo(db),
    blobStore: new LocalFsBlobStore({ rootDir: overrides?.uploadsDir ?? mediaUploadsDir() }),
    // ADR-027 §4 transform registry + rendition generation: registry rows are now durable too
    // (ADR-046 Phase 1). The real running server gets `SharpImageTransformer` (unlike
    // `server/app.ts`'s hermetic-test composition, which uses the deterministic in-memory
    // double). `sharp` is a pinned, installed dependency (`package.json`) — this stale "not
    // installed" note was flagged by the 2026-07-15 `/audit-work` batch (ADR-046 finding B-01)
    // and corrected here and in ADR-046 itself. See `src/media/image-transformer.sharp.ts`'s file
    // header for the still-real lazy-require rationale.
    transformDefinitionRepo,
    imageTransformer: new SharpImageTransformer(),
    // SPEC-011 (Newsletter): real SQLite adapters for all 6 repo ports (the campaign pair is
    // Drizzle-backed; the 5 `p_newsletter__*` tables are raw-SQL, `declareDataModule()`-created —
    // see `newsletterReady` above). `membersConsentCapability` stays `null` (unbound) — Members has
    // not shipped a real capability this pass (ADR-PIPE-011 Risks item 3); Newsletter must not
    // substitute a local stand-in that returns success by default.
    newsletterReady,
    newsletterCampaignRepo: new SqliteNewsletterCampaignRepo(db),
    newsletterListRepo,
    newsletterSubscriptionRepo: new SqliteNewsletterSubscriptionRepo(db),
    newsletterAudienceSnapshotRepo: new SqliteNewsletterAudienceSnapshotRepo(db),
    newsletterSendRepo: new SqliteNewsletterSendRepo(db),
    newsletterConfirmationTokenRepo: new SqliteNewsletterConfirmationTokenRepo(db),
    membersConsentCapability: null,
    // Stage 5 (routes) wiring — see the hoisted-vars comment above `commentsModule`/return.
    newsletterSubscriberDirectory,
    newsletterKeyring,
    newsletterHooks,
    // SPEC-010 (Forms, Tier-1 sample plugin, ADR-PIPE-010): the real SQLite rule-of-two adapters
    // (unlike the several "no SQLite adapter yet" libraries noted above — Forms' C-012 ports both
    // ship one). `formsRateLimiter` is one process-lifetime counter store, matching
    // `server/app.ts`'s hermetic-test composition's identical construction.
    formDefinitionRepo,
    formSubmissionRepo: new SqliteFormSubmissionRepo(db),
    formsRateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
    // SPEC-046 REQ-7 — same one-process-lifetime-counter-store shape as `formsRateLimiter` above,
    // just above it so the two process-lifetime rate limiters stay visually paired.
    siteAssistantRateLimiter: createRateLimiter({ profile: SITE_ASSISTANT_PER_IP, clock }),
    databaseLedgerRepo,
    // Real SQLite adapters (this dispatch, closing Session 5's disclosed "no SQLite adapter yet
    // for content-types/entries/taxonomy" gap — see `features/{content-types,entries,taxonomy}/
    // repo.sqlite.ts` file headers). `contentTypeIndexProvisioner` stays a no-op: building the real
    // ADR-022 §3 expression-index DDL executor is a separate, larger work item this dispatch's
    // scope (persistence for the registry/entries/taxonomy rows themselves) does not cover —
    // disclosed explicitly rather than silently left implying it's done.
    contentTypeRepo: new SqliteContentTypeRepo(db),
    contentTypeIndexProvisioner: new NoopContentTypeIndexProvisioner(),
    entryRepo,
    taxonomyRepo: new SqliteTaxonomyRepo({ db, workspaceId: workspaceId }),
    termRepo: new SqliteTermRepo({ db, workspaceId: workspaceId }),
    entryTermRepo: new SqliteEntryTermRepo({ db, workspaceId: workspaceId }),
    taxonomyRevisionRepo: new SqliteTaxonomyRevisionRepo({ db, workspaceId: workspaceId }),
    stampWatermark: sqliteStampWatermark(db),
    restorePointsRepo,
    dbOps,
    databaseIntrospection,
    siteStatusRepo: new InMemorySiteStatusRepo(),
    migrationRunsRepo,
    disclosureWatermarkSource: new AlwaysUnavailableWatermarkSource(),
    deepLinkRestorePointLookup: new RestorePointDeepLinkLookup(restorePointsRepo),
    // SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — composed into a real composition
    // root for the first time this dispatch (Session 5's own disclosure: "a token-store-backed
    // primitive composed into ZERO composition roots in this codebase as of this session"). One
    // process-lifetime `GatewayDeps` (in-process `InMemoryTokenStore` — see
    // `core/gated-mutations/composition.ts`'s file header for the disclosed TokenStorePort
    // decision). `authorizeInstance` closes the instance-scope authorization gap
    // (`GatewayDeps.authorizeInstance`'s doc comment): bound to `buildOwnerOnlyInstanceAuthorize`
    // over `identity.ownerPrincipalId`, the seeded owner already treated as this instance's sole
    // never-disable-able principal (SPEC-006 0.6.0).
    gatedMutations: {
      gatewayDeps: buildGatewayDeps({
        clock,
        idGen,
        authorize: identity.authorize,
        authorizeInstance: buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: identity.ownerPrincipalId }),
      }),
    },
    commentRepo: commentsModule.commentRepo,
    commentIngressPolicy: commentsModule.ingressPolicy,
    commentWriteService: commentsModule.writeService,
    commentsReady,
    commentsSettingsReady,
    widgetBindingRepo,
    entryRefsRepo,
    // SPEC-005 BR-01/BR-05 — one process-lifetime runtime instance shared by activation and every
    // content save. The root owns concrete adapters; `plugin-runtime.ts` owns capability-handle
    // composition and the load/setup/attach sequence.
    pluginActivationRepo,
    discoverPlugins: pluginRuntime.discoverPlugins,
    onPluginEnabled: pluginRuntime.onPluginEnabled,
    onPluginDisabled: pluginRuntime.onPluginDisabled,
    onPluginUninstalled: pluginRuntime.onPluginUninstalled,
    pluginBeforeSaveHook: pluginRuntime.beforeSaveHook,
    // 2026-08-15 — read-only wiring onto migration 0037's tables, previously applied with zero
    // callers on either end. See `routes/types.ts`'s `deploymentsReadRepo` doc.
    deploymentsReadRepo: new SqliteDeploymentsReadRepo(db),
    // 2026-08-15 — the real export engine, bound here rather than imported inside
    // `features/deployments/export-run.ts`/`export-site.ts` — see `routes/types.ts`'s
    // `runExportSite` doc for why that indirection is required, not stylistic (a real circular-load
    // crash, not a style preference).
    runExportSite: runExportSiteLazily,
    // Read ONCE here rather than deep in `export-run.ts`/`cli/commands/export.ts` — see
    // `resolveExportOutputRootDir`'s own doc immediately above and `routes/types.ts`'s
    // `exportOutputRootDir` doc.
    exportOutputRootDir: resolveExportOutputRootDir(),
    // 2026-08-20 (RouteDeps-narrowing pass 2) — nullary, closed over the `const routeDeps` binding
    // below rather than taking it per call; same self-referencing-closure shape `exportSiteBound`
    // below already uses, same TEST GOTCHA (`routes/types.ts`'s `exportSiteBound` doc, generalized:
    // spread-override is silently inert; mutate the object in place instead). `createSiteAppLazily`
    // itself is unchanged — still a reusable `(routeDeps) => Express` helper; wrapped here rather
    // than converted in place, since nothing else calls it.
    createSiteApp: () => createSiteAppLazily(routeDeps),
    // 2026-08-20 (RouteDeps-narrowing pass 2) — same nullary-closure conversion, same reasoning, same
    // TEST GOTCHA.
    resolveStorefrontProducts: () => resolveStorefrontProducts(routeDeps),
    // 2026-08-15 (Contract v2) — see `routes/types.ts`'s `publishCredentialSetRepo`/
    // `publishExecutionMode` docs. Sealed via the same shared sealer/keyring the two credential
    // repos above already reuse (no third `EnvOrFileKeyring` instance).
    publishCredentialSetRepo: new SqlitePublishCredentialSetRepo(db),
    // 2026-08-16 rework — see `routes/types.ts`'s `publishHistoryStore` doc. Real, DB-backed;
    // `server/app.ts`'s hermetic composition uses `InMemoryPublishHistoryStore` instead.
    publishHistoryStore: new SqlitePublishHistoryStore(db),
    publishExecutionMode: executionModeFromEnv(),
    // Read ONCE here rather than deep in `static-publish/adapter.ts` — see
    // `resolvePublishOutputRootDir`'s own doc above and `routes/types.ts`'s `publishOutputRootDir`
    // doc.
    publishOutputRootDir: resolvePublishOutputRootDir(),
    // 2026-08-16 — see `routes/types.ts`'s `publishCredentialVerificationCache` doc. Deliberately
    // in-memory, not DB-backed — one instance per process (this function runs once per boot, per
    // `index.ts`/`agent-daemon-server.ts`'s own call sites), same singleton lifetime
    // `siteAssistantSecretSealer` above already has.
    publishCredentialVerificationCache: new InMemoryPublishCredentialVerificationCache(),
    // 2026-08-15 — see `routes/types.ts`'s `sourceControlCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance).
    sourceControlCredentialSetRepo: new SqliteSourceControlCredentialSetRepo(db),
    // Read ONCE here rather than deep in `source-control/commit-site.ts` — see
    // `resolveSourceControlExportRootDir`'s own doc above and `routes/types.ts`'s
    // `sourceControlExportRootDir` doc.
    sourceControlExportRootDir: resolveSourceControlExportRootDir(),
    // 2026-08-16 (Phase 3) — see `routes/types.ts`'s `vendorCredentialSetRepo` doc. Sealed via the
    // same shared sealer/keyring the two legacy credential repos above already reuse (no third
    // `EnvOrFileKeyring` instance).
    vendorCredentialSetRepo: new SqliteVendorCredentialSetRepo(db),
    // 2026-08-17 — see `routes/types.ts`'s `customCredentialSetRepo` doc. Sealed via the same
    // shared sealer/keyring the credential repos above already reuse (no third `EnvOrFileKeyring`
    // instance).
    customCredentialSetRepo: new SqliteCustomCredentialSetRepo(db),
    // 2026-08-20 (RouteDeps-narrowing fix) — see `routes/types.ts`'s `exportSiteBound` doc and
    // `server/app.ts`'s matching field for the identical closure-ordering reasoning (`routeDeps`
    // spread LAST, so it always wins over anything a caller's `opts` might also carry).
    exportSiteBound: (opts) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see runExportSiteLazily's doc above.
      (require("../export/index.js") as typeof import("../export/index.js")).exportSite({ ...opts, routeDeps }),
  };
  return routeDeps;
}

/**
 * D10 fix — lets a second process (the agent daemon, `assistant/agent-daemon-server.ts`) bind to
 * the SAME workspace the main server process already resolved, instead of independently
 * re-resolving `resolveWorkspace`'s default (oldest-row) answer on its own connection. Without
 * this, the two processes agree only because the default resolution happens to be
 * time-invariant today (a newly created workspace can never become "the oldest") — correct by a
 * coincidence of `resolveWorkspace`'s current semantics, not by construction, and the two
 * processes have no way to agree at all once an explicit workspace choice enters the picture.
 *
 * `workspaceIdOverride` undefined reproduces `createSqliteRouteDeps()`'s existing no-override
 * behavior exactly (byte-identical for every current single-workspace caller). When supplied, it
 * is validated against a real workspace row via {@link resolveWorkspace} BEFORE
 * `createSqliteRouteDeps` is called — CIC U-001's `overrides.db`/`overrides.workspaceId`
 * "together or not at all" rule (`createSqliteRouteDeps` above) means the caller cannot supply a
 * bare workspaceId override without also supplying the db handle it was validated against, so
 * this function opens that db handle itself rather than asking `createSqliteRouteDeps` to do so
 * twice.
 *
 * @throws {ValidationError} `workspaceIdOverride` was supplied but names no real workspace row —
 *   propagates uncaught (`resolveWorkspace`'s own error), which is deliberate: a caller (the
 *   daemon) that silently fell back to the default workspace on a bad override would be a worse
 *   failure mode than a loud boot-time crash naming the bad id.
 * @complexity O(1) beyond `resolveWorkspace`'s own cost (see that function's own complexity note).
 * @overallScore 100
 */
export function createSqliteRouteDepsForWorkspace(
  workspaceIdOverride: string | undefined,
  dbPath: string = defaultContentDbPath()
): NewsletterRouteDeps {
  if (workspaceIdOverride === undefined) return createSqliteRouteDeps(dbPath);

  const db = openContentDb(
    dbPath,
    { workspace: seededWorkspace, posts: seededPosts, presentation: seededPresentation },
    recoverIncompleteDataModuleMigrations
  );
  const workspace = resolveWorkspace({ db }, { workspaceId: workspaceIdOverride });
  return createSqliteRouteDeps(dbPath, { db, workspaceId: workspace.id });
}

// FEAT-049 (ESM migration) moved this file off CommonJS, so the bare `require` the two doc
// comments below still describe no longer exists as a global; both `require` calls now resolve
// through `createRequire(import.meta.url)`, which preserves the exact same synchronous-resolution
// behavior their cycle-breaks depend on. See `server/app.ts`'s matching `runExportSiteLazily`
// doc for the same substitution.
const require = createRequire(import.meta.url);

/**
 * `exportSite`, resolved at CALL time rather than at import time — the same fix, for the same
 * cycle, as `server/app.ts`'s `runExportSiteLazily`. See that function's doc comment for the full
 * trace: `server/app.ts -> export/index.ts -> export/site-exporter.ts -> server/app.ts`, which
 * killed the agent daemon on every boot once its entry point started reaching this graph.
 *
 * Both composition roots need the same treatment; leaving either one static leaves the cycle live
 * on whichever boot path uses it.
 */
const runExportSiteLazily: ExportEngine<RouteDeps> = (options) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see doc above.
  (require("../export/index.js") as typeof import("../export/index.js")).exportSite(options);

/**
 * `createApp`, resolved at CALL time rather than at import time — see `routes/types.ts`'s
 * `createSiteApp` doc for why this field exists at all (closing the `export -> server` cycle).
 *
 * Lazy, not a static `import { createApp } from "./app.js"`, even though nothing about `createApp`
 * itself is slow to resolve: `server/app.ts` already imports `builtInThemesDir` FROM this file, so a
 * static import here would make that existing one-directional edge mutual, and `server/app.ts`'s own
 * module body ends with an eager `export const app = createApp();` that runs the whole app-boot
 * graph (transitively reaching `assistant/tool-registrations.ts` via the BYOK execution mode) as a
 * side effect of merely loading that file — the exact hazard `runExportSiteLazily` above already
 * documents for the same file pair. `require`, not `await import`: a synchronous resolution avoids
 * making this call site (and its `ExportEngine`/`createSiteApp` signatures) async, and by the time
 * any caller invokes this (only ever from inside `createSiteApp`'s function body below, never at
 * this module's own top level), `server/app.ts` is fully loaded.
 */
const createSiteAppLazily = (routeDeps: RouteDeps): Express =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate; see doc above.
  (require("./app.js") as typeof import("./app.js")).createApp(routeDeps);
