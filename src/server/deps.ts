import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { InMemoryEventBus } from "../core/events";
import { backfillPostSearchIndex, SqlitePostRepo, SqlitePostSearchIndex } from "../features/post";
import { createChatStoreFactory } from "../assistant/persistence/store-factory";
import { SqlitePresentationSettingsRepo } from "../features/presentation";
import { SqliteSettingsRepo } from "../features/settings/repo.sqlite";
import { discoverAllBuiltInThemes } from "../features/theme";
import { SqliteWorkspaceRepo } from "../features/workspace";
import { openContentDb, type ContentDb } from "../infra/sqlite/content-db";
import { resolveWorkspace } from "../site-dir/resolve-workspace";
import { recoverIncompleteDataModuleMigrations } from "../features/plugins/migration-recovery";
import { SqliteChangeSetRepo } from "../infra/sqlite/change-set-repo.sqlite";
import { SqliteOutboxAdapter } from "../infra/sqlite/outbox-repo.sqlite";
import { openDatabaseJournalDb } from "../infra/sqlite/database-journal-db";
import { SqliteMigrationRunsRepo, SqliteDatabaseLedgerRepo } from "../infra/sqlite/database-journal-repo";
import { ensureSeoSettingDefinitions } from "../seo";
import { installNewsletterDataModule } from "../newsletter/data-module-manifest";
import { ensureDefaultList } from "../newsletter/lists";
import { createHookRegistry } from "../newsletter/hooks";
import {
  SqliteNewsletterAudienceSnapshotRepo,
  SqliteNewsletterCampaignRepo,
  SqliteNewsletterConfirmationTokenRepo,
  SqliteNewsletterListRepo,
  SqliteNewsletterSendRepo,
  SqliteNewsletterSubscriptionRepo,
} from "../newsletter/repo.sqlite";
import { MembersSubscriberDirectory } from "../members";
import {
  seededPosts,
  seededPresentation,
  seededWorkspace,
  seedSettingsFromPresentation,
  SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID,
} from "./seed";
import { SqliteBufferSink } from "../infra/sqlite/analytics-sink.sqlite";
import {
  ConsoleMailerAdapter,
  SqliteMagicLinkTokenRepo,
  SqliteMemberRepo,
  SqliteMemberSessionRepo,
  SqliteMemberSubscriptionRepo,
  SqliteMemberTierRepo,
} from "../members";
import { rebuildNavLocationBindings } from "../navigation/reconcile";
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from "../navigation/repo.sqlite";
import { SqliteWebhookDeliveryRepo, SqliteWebhookSubscriptionRepo } from "../integrations";
import { EnvOrFileKeyring } from "../integrations/keyring.env";
import { createKeyringBackedSigner } from "../integrations/signing.keyring";
import {
  LocalFsBlobStore,
  SharpImageTransformer,
} from "../media";
import { createSqliteIdentityRouteDeps } from "../identity";
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from "../forms/repo.sqlite";
import { FORMS_SUBMIT_PROFILE } from "../forms/rate-limit-profile";
import { createRateLimiter } from "./middleware/rate-limit";
import type { RouteDeps } from "./routes/types";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";
import { createVerifiedOrigin, OriginRegistry } from "../origin";
import { seedDevCapabilityOrigin, SqliteOriginSettingRepo } from "../infra/sqlite/origin-repo.sqlite";
import {
  SqliteAssetBlobRepo,
  SqliteAssetRenditionRepo,
  SqliteMediaRepo,
  SqliteTransformDefinitionRepo,
} from "../infra/sqlite/media-repo.sqlite";
import {
  RedirectHitSinkImpl,
  RedirectPhaseHandlerResolver,
  redirectMatcher,
  RedirectSlugChangeCapture,
  registerRedirectHitOutboxHandler,
  registerRedirectsPhaseHandlers,
  SqliteRedirectRepo,
  type RedirectsWriteDeps,
} from "../redirects";
import { registerSlugChangeCapture } from "../routing";
import { SqliteDbOpsAdapter } from "../infra/sqlite/db-ops";
import { SqliteRestorePointsRepo } from "../infra/sqlite/database-journal-repo";
import { SqliteDatabaseIntrospectionAdapter } from "../features/database/adapter.sqlite";
import { InMemorySiteStatusRepo } from "../features/database/repo.memory";
import { NoopContentTypeIndexProvisioner } from "../features/content-types/repo.memory";
import { SqliteContentTypeRepo } from "../features/content-types/repo.sqlite";
import { SqliteEntryRepo } from "../features/entries/repo.sqlite";
import { SqliteWidgetRegionBindingRepo } from "../widgets/repo.sqlite";
import { SqliteEntryRefsRepo } from "../core/entry-refs/repo.sqlite";
import { discoverPlugins as discoverPluginRuntimePlugins } from "../features/plugin-runtime/discovery";
import { SqlitePluginActivationRepo } from "../features/plugin-runtime/repo.sqlite";
import { WORD_COUNT_BUILT_IN } from "../features/plugin-runtime/built-ins/word-count";
import { wireCoreResolvers } from "../widgets/resolvers/index";
import { createNavMenuReadModel } from "../navigation/read-model";
import { createCommentsModule, ensureCommentsSettingDefinitions } from "../comments";
import { ensurePublicAssistantSettingDefinitions } from "../assistant/public-assistant-settings";
import { SqliteCommentRepo } from "../comments/repo.sqlite";
import { installCommentsDataModule } from "../comments/data-module-install";
import { SqliteEntryTermRepo, SqliteTaxonomyRepo, SqliteTaxonomyRevisionRepo, SqliteTermRepo } from "../features/taxonomy/repo.sqlite";
import { AlwaysUnavailableWatermarkSource, RestorePointDeepLinkLookup } from "../features/recovery/repo.memory";
import { buildGatewayDeps } from "./gated-mutations-composition";
import { resolveRuntimeMode } from "./runtime-mode";
import { wrapMailerWithPurposeGate } from "../mail/purpose-scoped-mailer";

/**
 * Root directory `LocalFsBlobStore` writes blob bytes under (ADR-012 `uploads/`
 * convention, mirroring `builtInThemesDir()`/`defaultContentDbPath()` above).
 */
export function mediaUploadsDir(): string {
  return process.env.TOVU_MEDIA_UPLOADS_DIR ?? join(process.cwd(), "uploads");
}

/**
 * Built-in themes ship in the repo-root `themes/` dir (SPEC-004 spike), copied to `dist/themes/`
 * at build time (mirrors `templates/` -> `dist/templates/`) and resolved package-relative to this
 * file — never `process.cwd()` (CR-R04 fix: `tovu serve` used to read `process.cwd()/themes`,
 * which is wrong whenever the CLI is invoked from outside the repo checkout).
 */
export function builtInThemesDir(): string {
  return process.env.TOVU_THEMES_DIR ?? resolve(__dirname, "../../themes");
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
  return process.env.TOVU_CONTENT_DB ?? "content.db";
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
  /**
   * Install-dir-relative uploads path — `cli/commands/serve.ts` supplies `<dir>/uploads` (CR-R01
   * fix: uploads used to always default to `mediaUploadsDir()`, which is `process.cwd()`-relative
   * and therefore wrong whenever `tovu serve <dir>` is invoked from outside that dir). Omitted, it
   * falls back to `mediaUploadsDir()` — the legacy same-directory dev boot's existing behavior.
   */
  uploadsDir: string;
}

export function createSqliteRouteDeps(
  dbPath: string = defaultContentDbPath(),
  overrides?: Partial<CreateSqliteRouteDepsOverrides>
): NewsletterRouteDeps {
  // CIC U-001 / Contract Map C-010: `overrides.db` and `overrides.workspaceId` must be supplied
  // together or not at all — a single-field partial override is not a legal call shape.
  const hasOverrideDb = overrides?.db !== undefined;
  const hasOverrideWorkspaceId = overrides?.workspaceId !== undefined;
  if (hasOverrideDb !== hasOverrideWorkspaceId) {
    throw new Error(
      "createSqliteRouteDeps: overrides.db and overrides.workspaceId must be supplied together or not at all"
    );
  }

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
      { settingsRepo, clock, ids: idGen, principals: identity.principalRepo },
      { workspaceId: workspaceId, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID }
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
  // purpose-namespaced — `integrations/ports.ts`'s `KeyringPort.derive()` contract — not two).
  const memberRepo = new SqliteMemberRepo(db);
  const newsletterKeyring = new EnvOrFileKeyring();
  const newsletterSubscriberDirectory = new MembersSubscriberDirectory({ members: memberRepo });
  const newsletterHooks = createHookRegistry();

  return {
    workspaceId: workspaceId,
    workspaceRepo: new SqliteWorkspaceRepo(db),
    postRepo: new SqlitePostRepo(db),
    postSearch: new SqlitePostSearchIndex(db),
    // `$client` is the raw better-sqlite3 handle under Drizzle. Passed through because
    // `@jini-ai/sqlite`'s chat-history adapter takes a handle and never opens a database — the
    // property that keeps it writing into `content.db` rather than its own `app.sqlite`. The
    // tables come from migration `0023`, applied by Tovu's own migrator.
    chatHistory: createChatStoreFactory(db.$client),
    presentationRepo,
    settingsRepo,
    seoReady,
    settingsReady,
    assistantSettingsReady,
    // ADR-046 Phase 1 slice 1 (SPEC-023, 2026-07-16): change-set mutation history now survives a
    // restart — the first durable-adapter slice off Phase 1's capability table, per the ADR's own
    // "pull-based per capability, not a uniform sweep" fold-in guidance.
    changeSets: new SqliteChangeSetRepo(db),
    themes: discoverAllBuiltInThemes({ dir: builtInThemesDir(), source: "built-in" }),
    themesDir: builtInThemesDir(),
    outbox,
    bus,
    clock,
    idGen,
    // ADR-046 Phase 1 (final capability slice): analytics ingest buffer is durable — survives a
    // restart, closing the `LocalBufferSink.capabilities().durable` misreport the capability
    // inventory flagged.
    analyticsSink: new SqliteBufferSink({ db, workspaceId: workspaceId }),
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
    blobStore: new LocalFsBlobStore({ rootDir: overrides?.uploadsDir ?? mediaUploadsDir() }),
    // ADR-027 §4 transform registry + rendition generation: registry rows are now durable too
    // (ADR-046 Phase 1). The real running server gets `SharpImageTransformer` (unlike
    // `server/app.ts`'s hermetic-test composition, which uses the deterministic in-memory
    // double). `sharp` is a pinned, installed dependency (`package.json`) — this stale "not
    // installed" note was flagged by the 2026-07-15 `/audit-work` batch (ADR-046 finding B-01)
    // and corrected here and in ADR-046 itself. See `src/media/image-transformer.sharp.ts`'s file
    // header for the still-real lazy-require rationale.
    transformDefinitionRepo: new SqliteTransformDefinitionRepo(db),
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
    // `gated-mutations-composition.ts`'s file header for the disclosed TokenStorePort decision).
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock, idGen, authorize: identity.authorize }) },
    commentRepo: commentsModule.commentRepo,
    commentIngressPolicy: commentsModule.ingressPolicy,
    commentWriteService: commentsModule.writeService,
    commentsReady,
    commentsSettingsReady,
    widgetBindingRepo,
    entryRefsRepo,
    // SPEC-005 (ADR-005-ARCH) — real SQLite activation repo (mirrors `presentationRepo`'s adapter
    // choice). `word-count` is now discoverable (list/enable/disable testable end-to-end) — see
    // `server/app.ts`'s identical note: its *hook execution* (loader.ts steps 4-5) is still a
    // separate, later, gated phase that has not landed.
    pluginActivationRepo: new SqlitePluginActivationRepo(db),
    discoverPlugins: () => discoverPluginRuntimePlugins({ builtIns: [WORD_COUNT_BUILT_IN] }),
  };
}
