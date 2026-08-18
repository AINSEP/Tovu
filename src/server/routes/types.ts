import type { Express } from "express";
import type { SiteProduct } from "../http/site/render";

import type { EventBusPort, OutboxPort, UUID } from "@jini-ai/cms/core";
import type { AuthorizeFn, ChangeSetRepoPort, RevertRegistry } from "../../core/commands";
import type {
  PasswordHasherPort,
  PolicyPermissionRepoPort,
  PolicyRepoPort,
  PrincipalPolicyRepoPort,
  PrincipalRepoPort,
  PrincipalRoleRepoPort,
  RolePolicyRepoPort,
  RoleRepoPort,
  SessionRepoPort,
  UserRepoPort,
} from "@jini-ai/cms/identity";
import type { LipayApi } from "../../features/plugins/lipay/lipay-plugin";
import type { PostRepoPort, PostSearchPort, BeforeSaveHookPort } from "../../features/post";
import type { PagesHtmlDocumentStoreFactory } from "../../features/pages";
import type { ChatStoreFactory } from "../../assistant/persistence/tenant-scope";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
import type { SettingsRepoPort, getEffective, set } from "../../features/settings";
import type { DiscoveredTheme } from "../../features/theme";
import type { WorkspaceRepoPort } from "../../features/workspace";
import type { AnalyticsConfigPort, AnalyticsSinkPort } from "../../analytics/ports";
import type {
  MagicLinkTokenRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "../../members";
import type { CommercePriceRepoPort, CommerceProductRepoPort } from "../../features/commerce";
import type { MailerPort } from "../../mail";
import type { MenuRepoPort, NavLocationBindingRepoPort } from "../../navigation";
import type { KeyringPort, SecretSealerPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../integrations";
import type { WebhookSigner } from "../../integrations/signing";
import type { SiteAssistantCredentialRepoPort } from "../../assistant/site-credential-store";
import type { AdminExecutionCredentialRepoPort } from "../../assistant/execution-credential-store";
import type { PublishCredentialSetRepoPort, PublishExecutionMode } from "../../features/deployments/publish-credentials";
import type { PublishCredentialVerificationCache, PublishHistoryStore } from "../../features/deployments/static-publish";
import type { CustomCredentialSetRepoPort } from "../../features/custom-credentials";
import type { SourceControlCredentialSetRepoPort } from "../../features/source-control";
import type { VendorCredentialSetRepoPort } from "../../features/vendor-credentials";
import type { ComposioConfigRepoPort } from "../../connectors/composio-config-store";
import type { ComposioConnectors } from "../../connectors/composio-service";
import type { MediaProviderCredentialRepoPort } from "../../media/provider-credential-store";
import type { ExternalMcpServerRepoPort } from "../../assistant/external-mcp-store";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  BlobStorePort,
  ImageTransformerPort,
  MediaRepoPort,
  TransformDefinitionRepoPort,
} from "../../media";
import type { OriginRegistryPort } from "../../origin";
import type { RedirectHitSink, RedirectRepoPort, RedirectsWriteDeps } from "../../redirects";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "../../forms";
import type { CommentIngressPolicy, CommentRepoPort, CommentWriteService } from "../../comments";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import type { LedgerReadPort } from "../../features/database/timeline";
import type {
  RestorePointListPort,
  RestorePointSavePort,
} from "../../features/database/restore-points";
import type { DatabaseIntrospectionPort } from "../../features/database/adapter.sqlite";
import type {
  BootLedgerPort,
  MigrationRunsRepoPort,
  SiteStatusPort,
} from "../../features/database/boot/reconcile-interrupted-migration";
import type { DbOpsPort } from "../../core/gated-mutations/ports";
import type { ContentTypeRepoPort, IndexProvisionerPort } from "../../features/content-types";
import type { TeardownIndexProvisionerPort } from "../../features/content-types";
import type { ContentTypeListPort } from "../../features/content-types";
import type { EntryRepoPort } from "../../features/entries";
import type { EntryListPort } from "../../features/entries";
import type {
  AssignmentCountEntryTermRepoPort,
  DeletableTaxonomyRepoPort,
  DeletableTermRepoPort,
  EntryTermRepoPort,
  TaxonomyListPort,
  TaxonomyRepoPort,
  TaxonomyRevisionRepoPort,
  TermListPort,
  TermRepoPort,
  TransactionalRepoPort,
} from "../../features/taxonomy";
import type { DisclosureWatermarkSourcePort } from "../../features/recovery/disclosure";
import type { DeepLinkRestorePointLookupPort } from "../../features/recovery/deep-link";
import type { GatewayDeps } from "../../core/gated-mutations/gateway";
import type { LedgerAppendPort } from "../../features/database/gated-hooks";
import type { MergeableEntryTermRepoPort } from "../../features/taxonomy/gated-hooks";
import type { WidgetRegionBindingRepoPort } from "../../widgets/ports";
import type { EntryRefsRepoPort } from "../../core/entry-refs/ports";
import type { PluginActivationRepoPort } from "../../features/plugin-runtime/activation";
import type { PluginDiscoveryRecord } from "../../features/plugin-runtime/discovery";
import type { DeploymentsReadRepoPort } from "../../features/deployments";
import type { ExportEngine } from "../../features/deployments/export-run";

export interface RouteDeps {
  workspaceId: UUID;
  workspaceRepo: WorkspaceRepoPort;
  postRepo: PostRepoPort;
  /**
   * Ranked full-text search over posts/pages, backing the `content_post_search` agent tool.
   *
   * A sibling of `postRepo` rather than a method on it: `PostRepoPort` is a record store of exact
   * lookups whose in-memory adapter is three array scans, while this is a durable inverted index
   * with its own migration, sync obligation and backfill. See `features/post/search.ts` for the
   * full argument, and `search-index.sqlite.ts` for why the index carries only text while
   * workspace/kind/status/trash stay query-time filters on the live row.
   */
  postSearch: PostSearchPort;
  /**
   * SPEC-047/ADR-056 — builds the bespoke-HTML body store for one Page.
   *
   * A sibling of `postRepo`, never a method on it, and deliberately not reachable through the
   * ordinary Post/Page CRUD path: this is the ONLY writer of `body_format: "html"` rows anywhere
   * (CIC-3), and `createPost`/`updatePost` are structurally incapable of producing that shape. The
   * separation is the invariant, not a layering preference — see `features/pages/html-document-store.sqlite.ts`.
   *
   * A factory for the same reason `chatHistory` is one: composition closes over the `content.db`
   * handle so no route holds it, and every instance is bound to one `(workspaceId, postId)` pair.
   */
  pagesHtmlStore: PagesHtmlDocumentStoreFactory;
  /**
   * Durable AI chat history, obtained per-principal.
   *
   * A factory rather than a store, because there is no such thing as "the" chat store — every
   * query must be filtered by who is asking. Composition closes over the `content.db` handle so
   * no route ever holds one, which is what makes an unscoped `WHERE id = ?` unwritable rather
   * than merely against convention. See `assistant/persistence/tenant-scope.ts`.
   */
  chatHistory: ChatStoreFactory;
  presentationRepo: PresentationSettingsRepoPort;
  /**
   * SPEC-007 — the settings ledger's repo port. `core.commands.appliers`
   * (via `revert.ts`) reads through this now instead of
   * `PresentationSettingsRepoPort` (ADR-PIPE-007 Migration Safety); the
   * admin `settings.*` routes (Phase 5, not yet wired) will consume it too.
   */
  settingsRepo: SettingsRepoPort;
  /**
   * The real `features/settings`'s own `getEffective` — threaded through `RouteDeps` (rather than
   * each consumer importing it directly) so `assistant/public-assistant-settings.ts`'s
   * `GetPublicAssistantSettingsDeps` and `assistant/custom-instructions.ts`'s
   * `ResolveCustomInstructionsDeps` can receive it by injection instead of a static import — the
   * technique that keeps `settings` convertible to the standard tool-contribution registry without
   * closing an `[assistant, features/settings]` module cycle. `server/` already imports
   * `features/settings` directly and safely elsewhere in this file (`settingsRepo` above); this is
   * the same edge, just also threaded to the two `assistant/` files that need the FUNCTION.
   */
  getEffective: typeof getEffective;
  /** The real `features/settings`'s own `set` — see `getEffective`'s doc immediately above for why
   *  this is threaded through `RouteDeps` rather than imported directly by `assistant/
   *  public-assistant-settings.ts`'s `PublicAssistantSettingsWriteDeps`. */
  set: typeof set;
  /** The real `features/settings`'s own `INSTRUCTIONS_NAMESPACE` constant (`"core.instructions"`) —
   *  see `getEffective`'s doc above; threaded through so `assistant/custom-instructions.ts`'s
   *  `ResolveCustomInstructionsDeps` can receive it by injection instead of a static import. */
  instructionsNamespace: string;
  /**
   * Resolves once the one-time `migrateLegacyPresentationSettings()` boot
   * migration (SPEC-007 REQ-08) completes. Mirrors `identityReady`'s
   * fire-and-forget pattern (`identity/wiring.ts`): the composition roots
   * stay synchronous, and any settings-reading route/consumer should await
   * this before treating `settingsRepo` reads as post-migration-complete.
   */
  settingsReady: Promise<void>;
  /**
   * SPEC-008 (ADR-PIPE-008 Decision §3, T012) — resolves once the one-time
   * `ensureSeoSettingDefinitions()` boot call registers the 7 `site.seo.*`
   * setting definitions. Mirrors `settingsReady`'s exact shape/convention;
   * the admin `seo` settings routes (`get-settings.ts`/`put-settings.ts`)
   * await this first, same as `settings/get-effective.ts` awaits `settingsReady`.
   */
  seoReady: Promise<void>;
  /**
   * Resolves once the one-time `ensurePublicAssistantSettingDefinitions()` boot call registers the
   * `site.assistant.public_enabled` definition. Same shape and same convention as `seoReady` above,
   * and chained after it in both composition roots for the reason `seoReady`'s own comment in
   * `app.ts` gives: concurrent openers of the settings write chokepoint's transaction throw on the
   * SQLite root. The 2 admin assistant-settings routes await this before reading `settingsRepo`.
   */
  assistantSettingsReady: Promise<void>;
  /**
   * The SITE's encrypted provider credential store (ADR-058) — one row per workspace, backing the
   * "Visitor's AI Assistant" admin tab and `server/modules/site-assistant.ts`'s runtime key
   * resolution. Unlike `assistantSettingsReady` above, this needs no boot-time definition
   * registration (it is a plain table, not a `core.execution.*` ledger namespace), so there is no
   * matching `*Ready` promise — the repo is usable as soon as migrations have run.
   */
  siteAssistantCredentialRepo: SiteAssistantCredentialRepoPort;
  /** Seals/opens the SITE credential above. See `integrations/secret-sealer.aesgcm.ts`'s header for
   *  why this is one shared sealing capability, not one per workspace. */
  siteAssistantSecretSealer: SecretSealerPort;
  /**
   * The `KeyringPort` `siteAssistantSecretSealer` derives its AES key from — exposed separately
   * (not just baked into the sealer) because `setSiteAssistantCredential` also needs
   * `keyring.activeKey()` directly, to know which root-key generation to stamp into a freshly-sealed
   * row. Deliberately its OWN `EnvOrFileKeyring` instance in the real composition root
   * (`server/deps.ts`), constructed `{allowFileFallback:false}`, independent of the shared instance
   * webhook signing/newsletter tokens use — see ADR-058 §2 for why that asymmetry is intentional.
   */
  siteAssistantSecretKeyring: KeyringPort;
  /**
   * The ADMIN's own encrypted BYOK credential store — one row per `(workspaceId, principalId)`,
   * backing `modules/assistant-byok.ts`'s `createStoredExecutionCredentialPort` and the
   * GET/PUT/DELETE `.../assistant/execution-credential` routes. NOT `siteAssistantCredentialRepo`
   * above (that one is per-workspace and backs the public visitor assistant). Sealed via the SAME
   * `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above — see
   * `db/schema.ts`'s `adminExecutionCredentials` header for why one shared sealing capability is
   * correct here rather than a third `KeyringPort` instance. No matching `*Ready` promise, for the
   * same reason `siteAssistantCredentialRepo` has none: a plain table, usable as soon as migrations
   * have run.
   */
  adminExecutionCredentialRepo: AdminExecutionCredentialRepoPort;
  /**
   * Per-workspace media-generation vendor credentials, backing the GET/PUT
   * `.../media/providers` routes the admin's Media → "Media providers" tab talks to. Sealed via
   * the same two capabilities above, for the same reason the BYOK store reuses them.
   *
   * Multi-row per workspace (one per vendor), unlike both credential repos above — see
   * `media/provider-credential-store.ts` for why this one is workspace-scoped rather than
   * per-principal. No matching `*Ready` promise: a plain table, usable as soon as migrations run.
   */
  mediaProviderCredentialRepo: MediaProviderCredentialRepoPort;
  /**
   * The workspace's roster of external MCP servers, backing the admin's Settings → External MCP tab
   * and read by the agent daemon at boot to decide what to federate
   * (`assistant/external-mcp-store.ts`).
   *
   * Multi-row per workspace like `mediaProviderCredentialRepo` above. Its sealed column holds a
   * whole `KEY=VALUE` environment block rather than one key, sealed with the same shared ADR-058
   * sealer/keyring as every other credential table here. No matching `*Ready` promise: a plain
   * table, usable as soon as migrations run.
   */
  externalMcpServerRepo: ExternalMcpServerRepoPort;
  /**
   * The workspace's sealed Composio project key + provisioned auth-config ids, backing the admin's
   * Settings → Connectors tab (`connectors/composio-config-store.ts`).
   *
   * Single-row per workspace, unlike `mediaProviderCredentialRepo` above — a workspace has one
   * Composio project, not a roster. Sealed with the same shared ADR-058 sealer/keyring as every
   * other credential table here. No matching `*Ready` promise: a plain table, usable as soon as
   * migrations run.
   */
  composioConfigRepo: ComposioConfigRepoPort;
  /**
   * The long-lived Composio provider + service the connectors routes read through.
   *
   * A live service rather than a repo because `ComposioConnectorProvider` owns in-process caches
   * and (for OAuth) pending-authorization state that must survive across requests — see
   * `connectors/composio-service.ts` for why it cannot be rebuilt per request.
   */
  composioConnectors: ComposioConnectors;
  /**
   * Resolves once the one-time `ensureExecutionSettingDefinitions()` boot call registers the 8
   * `core.execution.*` setting definitions backing the admin "Execution mode" tab (`@jini-ai/ui`'s
   * `ExecutionTab`). Same shape/convention as `assistantSettingsReady`, chained after it in both
   * composition roots for the identical transaction-hazard reason. Unlike the other three
   * `*Ready` bindings there is no dedicated execution-settings route today — the tab reads/writes
   * `core.execution.*` through the fully generic `settings/get-effective.ts`/`settings/set.ts`
   * routes (which only await the base `settingsReady`), so this promise currently has no route
   * consumer; it is still threaded through `RouteDeps` for the same discoverability/consistency
   * reason every other boot registration is, and so a future dedicated route has it available.
   */
  executionSettingsReady: Promise<void>;
  /**
   * Resolves once `ensureSettingsUiTabDefinitions()` registers the 9 definitions across
   * `core.instructions.*`, `core.notifications.*`, and `core.privacy.*` — the settings-dialog
   * tabs whose entire Tovu-side cost is ledger storage (no routes, no port). Chained after
   * `executionSettingsReady` in both composition roots for the same transaction-hazard reason
   * every other registration is, and likewise has no dedicated route consumer: all three tabs
   * read/write through the generic settings routes.
   */
  settingsUiTabsReady: Promise<void>;
  /** Change-set store for the command gateway (in-memory in v1, ADR-008/018). */
  changeSets: ChangeSetRepoPort;
  /**
   * Inverse-applier registry for `changeset.revert` (ADR-018 C-005/C-006), pre-loaded with the
   * post-domain reverters (`features/post/reverters.ts`'s `createPostRevertRegistry`) by both
   * composition roots. `change-sets/revert.ts` reads this directly instead of calling
   * `defaultRevertRegistry()` itself — building the registry, closed over the SAME `postRepo`/
   * `clock`/`outbox` instances the rest of this bag already carries, is composition-root work, same
   * as every other concrete adapter selected here (2026-08-13 features-post-deep-import-trace.md
   * Job 2).
   */
  revertRegistry: RevertRegistry;
  /** Themes discovered at boot (built-in + site themes/ dir), SPEC-004 spike. */
  themes: DiscoveredTheme[];
  /**
   * The themes root those themes were discovered under (`server/deps.ts`'s `builtInThemesDir()`).
   *
   * Threaded through as a dependency rather than re-derived where it is needed, because it is the
   * outer half of the `themes` agent-tool domain's containment check: `DiscoveredTheme.dir` says
   * where one theme lives, and this says which folders are allowed to contain a theme at all
   * (`features/theme/theme-files.ts`'s `isRecognizedThemeRoot`). Re-deriving it inside a feature
   * module would both invert the dependency and let a test/composition root that overrides
   * `TOVU_THEMES_DIR` disagree with the check enforcing it.
   */
  themesDir: string;
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  /** Analytics ingest buffer (ADR-035 ingest-only stage; no rollup yet). ADR-046 Phase 1: durable
   * in real composition (`SqliteBufferSink`), in-memory in hermetic composition (`LocalBufferSink`). */
  analyticsSink: AnalyticsSinkPort;
  /**
   * The public analytics beacon's config seam (`analytics/config.settings.ts`'s
   * `createSettingsAnalyticsConfig`), backed by the `core.analytics.*` ledger definitions in both
   * composition roots. Replaces the former hardcoded stub `server/app.ts`'s `registerAnalyticsIngestRoute`
   * call used to build inline.
   */
  analyticsConfig: AnalyticsConfigPort;
  /**
   * Resolves once the one-time `ensureAnalyticsSettingDefinitions()` boot call registers the 6
   * `core.analytics.*` setting definitions backing `analyticsConfig`. Same shape/convention as
   * `settingsUiTabsReady`, chained after it in both composition roots for the identical
   * single-SQLite-connection-transaction reason every registration above documents.
   */
  analyticsSettingsReady: Promise<void>;
  /** `members` library ports (ADR-030) — Members admin screen. */
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
  /** Local, navigation-owned menu repo (ADR-029; not a frozen ADR port). */
  menuRepo: MenuRepoPort;
  /** The one real ADR-029 port: the derived nav_location_bindings index. */
  navLocationBindingRepo: NavLocationBindingRepoPort;
  /** ADR-036 `webhook_subscriptions` persistence. */
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  /** ADR-036 `webhook_deliveries` persistence. */
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
  /**
   * ADR-036 §5 outbound HMAC signer. ADR-PIPE-015 Phase 1: built via `createKeyringBackedSigner`
   * over a real `KeyringPort` (`server/deps.ts`'s composition uses `EnvOrFileKeyring`;
   * `server/app.ts`'s hermetic test/dev composition uses the in-memory `InMemoryKeyring` test
   * double instead, to avoid touching real files/env in tests). Not consumed by any route yet —
   * the delivery worker is the first real consumer, and its activation stays gated behind
   * ADR-PIPE-015's Phase 4 "point of no return" until the real signer, guarded transport, and
   * SQLite adapters are all merged and code-reviewed.
   */
  webhookSigner: WebhookSigner;
  /**
   * `media` library ports (ADR-027 walking skeleton — see `src/media/INFO.md`
   * for the disclosed scope: bespoke `MediaRecord` table instead of the
   * not-yet-implemented generic entries model, no journaled GC, no transform
   * pipeline, no origin-isolated serving). `mediaRepo` is the bespoke table's
   * repo (not a frozen ADR port, same status as `menuRepo`); `assetBlobRepo`/
   * `assetRenditionRepo` are the two core-owned sidecars ADR-027 §2 specifies;
   * `blobStore` is the one real ADR-027 §1 `BlobStorePort`.
   */
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  blobStore: BlobStorePort;
  /**
   * ADR-027 §4 named transform registry + rendition generation — new in this
   * task (see `src/media/rendition-service.ts` file header for the disclosed
   * scope: core-declared transforms only, in-process lazy single-flight
   * generation only). `transformDefinitionRepo` is the append-only
   * `transform_registry` sidecar; `imageTransformer` is the seam that
   * actually runs the pixel operation (`InMemoryImageTransformer` in the
   * hermetic test/dev composition, `SharpImageTransformer` in the real
   * running server — see `server/app.ts` / `server/deps.ts`).
   */
  transformDefinitionRepo: TransformDefinitionRepoPort;
  imageTransformer: ImageTransformerPort;
  /**
   * `identity` library repo ports (ADR-021 / SPEC-006) — principal-centric
   * auth. In-memory only this pass (see `identity/INFO.md`); real login,
   * sessions, and the RBAC seed run against these.
   */
  principalRepo: PrincipalRepoPort;
  userRepo: UserRepoPort;
  sessionRepo: SessionRepoPort;
  roleRepo: RoleRepoPort;
  policyRepo: PolicyRepoPort;
  policyPermissionRepo: PolicyPermissionRepoPort;
  rolePolicyRepo: RolePolicyRepoPort;
  principalRoleRepo: PrincipalRoleRepoPort;
  principalPolicyRepo: PrincipalPolicyRepoPort;
  /** argon2id hashing seam (INV-05) — see `identity/hasher.ts`. */
  passwordHasher: PasswordHasherPort;
  /**
   * Resolves once first-boot identity seeding (`identity/seed.ts`) completes.
   * Seeding hashes the owner's password (async, argon2id), so
   * `createRouteDeps()`/`createSqliteRouteDeps()` stay synchronous by kicking
   * the seed off immediately and handing back this promise; auth-adjacent
   * middleware/routes `await` it before touching identity repos, so
   * correctness never depends on request timing (no race).
   */
  identityReady: Promise<void>;
  /** SPEC-006 0.6.0 (REQ-11/REQ-15) — resolves to the seeded owner's principal id; see
   * `identity/wiring.ts`'s `IdentityRouteDepsSlice.ownerPrincipalId` doc for the full rationale. */
  ownerPrincipalId: Promise<UUID>;
  /**
   * Bound closure over `identity.authorize()` + its repos (ADR-006/ADR-021 §2:
   * `authorize()` itself is ordinary core code, not a port — this field exists
   * so `core/commands` can call it without importing the `identity` library;
   * see `AuthorizeFn`'s doc in `core/commands/command.ts`).
   */
  authorize: AuthorizeFn;
  /**
   * `forms` library ports (SPEC-010, ADR-PIPE-010 — mirrors the existing
   * `webhookSubscriptionRepo`/`webhookDeliveryRepo` field-addition precedent). `formsRateLimiter`
   * is a single, process-lifetime `createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock })`
   * instance (not constructed per-request) so its fixed-window counters persist across requests.
   */
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  formsRateLimiter: RateLimiter;
  /**
   * SPEC-046 REQ-7 — the public site assistant's own rate limiter, mirroring `formsRateLimiter`'s
   * shape exactly: a single, process-lifetime `createRateLimiter({ profile: SITE_ASSISTANT_PER_IP,
   * clock })` instance (not constructed per-request), keyed by `resolveClientIp(req)` in
   * `modules/site-assistant.ts`.
   */
  siteAssistantRateLimiter: RateLimiter;
  /**
   * ADR-041 §1/§2 — the Database Timeline's read port, backed by the sidecar
   * `ops/database-journal.db` (`db/sqlite/database-journal-repo.ts`'s `SqliteDatabaseLedgerRepo`
   * in `server/deps.ts`'s real composition; `features/database/repo.memory.ts`'s
   * `InMemoryDatabaseLedgerRepo` in `server/app.ts`'s hermetic composition). Only the read side is
   * wired into `RouteDeps` this pass — see `routes/admin/database/timeline.ts`'s file header for
   * what remains unwired.
   */
  /** Widened this dispatch with `LedgerAppendPort` — both `SqliteDatabaseLedgerRepo` and
   * `InMemoryDatabaseLedgerRepo` already implement `.append()`; only the type declaration here was
   * narrower than the concrete instances (see `features/database/gated-hooks.ts`'s
   * `buildMigrateForwardHooks` and `features/recovery/gated-hooks.ts`'s `buildRestoreHooks`, which
   * need to append real ledger rows).
   * Widened again (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 fix) with
   * `BootLedgerPort` — both concrete adapters already implement `appendInterruptedRow` too; only
   * this declaration was narrower. */
  databaseLedgerRepo: LedgerReadPort & LedgerAppendPort & BootLedgerPort;
  /** ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, Finding 2 fix) —
   * the `migration_runs` read side `reconcileInterruptedMigrationOnBoot` needs; previously
   * constructed nowhere (real SQLite adapter existed, unused; no in-memory double existed). */
  migrationRunsRepo: MigrationRunsRepoPort;
  /**
   * Admin-UI backend-gap closure (design-spec.md §0.4/§1.9/§2.8/§3.8/§4.8, this dispatch) — the
   * read-side + route-layer wiring the Web Design pass found missing across `content-types`,
   * `entries`, `taxonomy`, and (partially) `database`/`recovery`. Every field below is backed by an
   * in-memory adapter in BOTH `server/app.ts` and `server/deps.ts` (no SQLite adapter exists yet
   * for `content-types`/`entries`/`taxonomy` — the same disclosed "no adapter yet" precedent
   * `mediaRepo`/`transformDefinitionRepo`/`memberRepo` already establish above), EXCEPT
   * `restorePointsRepo`/`dbOps`, which get real `db/sqlite/database-journal-repo.ts`/`db-ops.ts`
   * adapters in `server/deps.ts` — see this dispatch's handoff for the full disclosure and the
   * follow-up SQLite-adapter work item it leaves open.
   */
  /** ADR-022/ADR-043 — the `content_types` registry's write chokepoint repo, widened with this
   * dispatch's new `ContentTypeListPort` (`features/content-types/list.ts`). */
  contentTypeRepo: ContentTypeRepoPort & ContentTypeListPort;
  /** No-op this pass (`features/content-types/repo.memory.ts`'s `NoopContentTypeIndexProvisioner`)
   * — real DDL index provisioning targets `content.db` tables this domain has no SQLite adapter
   * for yet, same disclosed gap as `contentTypeRepo`. */
  contentTypeIndexProvisioner: IndexProvisionerPort & TeardownIndexProvisionerPort;
  /** ADR-022/ADR-043 — the `entries` write chokepoint repo, widened with this dispatch's new
   * `EntryListPort` (`features/entries/list.ts`). Also satisfies entries' `ContentTypeLookupPort`
   * structurally when `contentTypeRepo` is passed as its `contentTypeRepo` dep (a `ContentTypeRecord`
   * is a structural superset of `OwningContentType`). */
  entryRepo: EntryRepoPort & EntryListPort;
  /** ADR-044 — the `taxonomies`/`terms`/`entry_terms`/`taxonomy_revisions` write chokepoint repos,
   * `taxonomyRepo`/`termRepo` widened with this dispatch's new `TaxonomyListPort`/`TermListPort`
   * (`features/taxonomy/list.ts`). `mergeTerm`'s plan/confirm/execute ceremony is NOT wired this
   * pass (needs `core/gated-mutations`'s gateway, not composed into any composition root yet). */
  /** Widened again for the `deleteTaxonomy`/`deleteTerm` guarded-delete routes with
   * `DeletableTaxonomyRepoPort`/`DeletableTermRepoPort` (`@jini-ai/cms/taxonomy`'s additive
   * delete capability — see that package's `write-service.ts` for why these are additive
   * interfaces rather than folded into the certified `TaxonomyRepoPort`/`TermRepoPort`).
   * `taxonomyRepo` widened once more with `TransactionalRepoPort` (coordinator review, hazards
   * #1/#2): the same guard-and-cascade atomicity `deleteTerm`/`deleteTaxonomy` need, sourced from
   * whichever one repo instance the route wires up as `deps.transaction` — `taxonomyRepo` is the
   * one both delete flows always have, so it is the canonical source. */
  taxonomyRepo: TaxonomyRepoPort & TaxonomyListPort & DeletableTaxonomyRepoPort & TransactionalRepoPort;
  termRepo: TermRepoPort & TermListPort & DeletableTermRepoPort;
  /** Widened this dispatch with `MergeableEntryTermRepoPort` (the `mergeTerm` gated-mutation
   * ceremony's by-term enumeration need — see `features/taxonomy/gated-hooks.ts`). Widened again
   * with `AssignmentCountEntryTermRepoPort` for the `deleteTaxonomy`/`deleteTerm` guard. */
  entryTermRepo: EntryTermRepoPort & MergeableEntryTermRepoPort & AssignmentCountEntryTermRepoPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
  /** Bumps `database_write_watermark` for taxonomy writes (create/rename/assign/delete). Real
   * `sqliteStampWatermark(db)` in `server/deps.ts` (the certified `stampWatermarkTx`, see
   * `core/gated-mutations/watermark.ts`); `noopStampWatermark` in `server/app.ts`'s in-memory
   * composition, which has no watermark table to advance. */
  stampWatermark: () => void;
  /** ADR-041 §2/§4 — the `restore_points` table's list + save side (`database/restore-points.ts`'s
   * new `RestorePointListPort`/`RestorePointSavePort`). Real `SqliteRestorePointsRepo` in
   * `server/deps.ts` (already built, previously unwired); in-memory in `server/app.ts`. */
  restorePointsRepo: RestorePointListPort & RestorePointSavePort;
  /** SPEC-016 C-007 — the dialect-neutral restore-point capability/capture surface. Real
   * `SqliteDbOpsAdapter` in `server/deps.ts` (already built, previously unwired); a deterministic
   * in-memory double in `server/app.ts` (`features/database/repo.memory.ts`'s
   * `InMemoryDbOpsAdapter`). */
  dbOps: DbOpsPort;
  /** ADR-041 §3 — the `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`
   * agent tools' backing read port (`features/database/adapter.sqlite.ts`, closing the gap that
   * file's own catalog header previously disclosed as "no backing adapter composed into RouteDeps
   * yet"). Real `SqliteDatabaseIntrospectionAdapter` in `server/deps.ts` (reuses the same open
   * `ContentDb` handle `restorePointsRepo`/`dbOps` already share); `InMemoryDatabaseIntrospectionAdapter`
   * in `server/app.ts`'s hermetic composition. */
  databaseIntrospection: DatabaseIntrospectionPort;
  /** ADR-041 §3/§10 — this site's `SERVING`/`PENDING_MIGRATION`/`BLOCKED_PENDING_RECOVERY` status.
   * In-memory in both compositions, defaulted to `SERVING` — no composition root invokes
   * `features/database/boot/*`'s reconciliation functions at actual boot yet (disclosed gap, see
   * handoff), so this only ever changes if a future caller calls `.set()`. */
  siteStatusRepo: SiteStatusPort;
  /** ADR-045 §2 — Recovery's discarded-write-window baseline source. Always reports the baseline
   * as unavailable (`features/recovery/repo.memory.ts`'s `AlwaysUnavailableWatermarkSource`) — the
   * safe default per `disclosure.ts`'s own "never fabricate a zero count" rule, not a corner cut;
   * see that class's doc comment. */
  disclosureWatermarkSource: DisclosureWatermarkSourcePort;
  /** ADR-041 §7/ADR-045 §5 — re-resolves a `DatabaseContextEnvelope`'s carried `restorePointId`
   * server-side (`features/recovery/repo.memory.ts`'s `RestorePointDeepLinkLookup`, backed by the
   * same real `restorePointsRepo` list above). */
  deepLinkRestorePointLookup: DeepLinkRestorePointLookupPort;
  /**
   * SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — composed into a real composition
   * root for the first time this dispatch. One process-lifetime `GatewayDeps` (in-process
   * `InMemoryTokenStore`, see `core/gated-mutations/composition.ts`'s file header for the disclosed
   * `TokenStorePort` decision) shared by every gated-mutation route this dispatch wires
   * (`taxonomy/terms/:id/merge`, `database/migrate-forward`, `recovery/restore`).
   */
  gatedMutations: { gatewayDeps: GatewayDeps };
  /**
   * SPEC-009 / ADR-PIPE-009 — `redirects` + first-time `origin` composition-
   * root wiring. `redirectRepo`/`redirectHitSink` back the admin HTTP surface
   * (Phase 2) and the `phase-handler.ts` read path; `originRegistry` is the
   * single open-redirect/canonical-origin oracle (ADR-040), wired into the
   * composition root for the first time by this feature — no other library
   * had a real consumer for it before now. `redirectsWriteDeps` bundles the
   * write chokepoint's full dependency set (repo/db/transaction/matcher/
   * originRegistry/clock/idGen/outbox) — a single pre-built object rather
   * than exposing the package-private `RedirectDbHandle`/transaction-wrapper
   * types on this shared file (INV-07's chokepoint boundary stays {
   * `redirects.ts`, `capture.ts`, `ports.internal.ts` } — routes only ever
   * see the already-composed `RedirectsWriteDeps`, never the raw db handle).
   */
  redirectRepo: RedirectRepoPort;
  redirectHitSink: RedirectHitSink;
  originRegistry: OriginRegistryPort;
  redirectsWriteDeps: RedirectsWriteDeps;
  /** SPIKE: seam for the sample Tier-3 store plugin (data lives in plugin-owned `p_store__*`
   * tables). Optional — only the SQLite runtime wires it (see `index.ts`). */
  store?: {
    listProducts(): { id: string; title: string; price: number; stock: number; version: number }[];
    checkout(
      productId: string,
      qty: number
    ):
      | { ok: true; orderId: string; remainingStock: number; retries: number }
      | { ok: false; reason: "not-found" | "out-of-stock" | "conflict"; retries: number };
  };
  /**
   * Commerce catalog read ports (2026-08-12: wiring products into template render data).
   * Optional, matching `store?:` above's precedent — the real running server's composition root
   * (`server/deps.ts`) wires both against the SAME `content.db` every other repo already uses (no
   * `declareDataModule()`/plugin bootstrap needed, unlike `store`/`lipay`); the hermetic
   * `server/app.ts` test composition leaves them unset, and `routes/site/products.ts` falls back
   * to `store?.listProducts()` when absent — never a hard dependency a test has to fake.
   */
  commerceProductRepo?: CommerceProductRepoPort;
  commercePriceRepo?: CommercePriceRepoPort;
  /**
   * The lipay payments framework plugin's composed API (`features/plugins/lipay`). Optional and
   * wired only by a composition root that has a real SQLite handle, exactly like `store` above —
   * lipay's tables come from `declareDataModule()`, which the in-memory composition has no
   * counterpart for. `routes/site/payments-webhook.ts` reads this lazily per request, so its route
   * can be registered ahead of the blanket body parser while activation still happens later.
   */
  lipay?: LipayApi;
  /** ADR-031/ADR-023 (SPEC-033) — the Comments bundled plugin's composed backend
   * (`comments/index.ts#createCommentsModule`). */
  commentRepo: CommentRepoPort;
  commentIngressPolicy: CommentIngressPolicy;
  commentWriteService: CommentWriteService;
  /** Fire-and-forget at boot (mirrors `newsletterReady`) — await (or, for the real server, go
   * through the ADR-046 Phase 2 boot lifecycle) before relying on the `p_comments__*` tables
   * existing. `server/app.ts`'s hermetic composition resolves this immediately (no dataModule
   * declare needed against an in-memory repo). */
  commentsReady: Promise<void>;
  /** SPEC-035 (ADR-028 Settings Layered Ledger wiring) — resolves once the 6 `comments.*` setting
   * definitions are registered (mirrors `seoReady`'s identical shape/convention). Chained AFTER
   * `seoReady` in both composition roots — the settings write chokepoint's `BEGIN IMMEDIATE`
   * transaction cannot tolerate two independent boot-time definition-registration chains racing
   * on the SAME SQLite connection (the same hazard `seoReady`'s own doc comment documents for
   * `settingsReady`). The comments admin settings routes (`routes/admin/comments/*-settings.ts`)
   * await this before reading/writing through the ledger. */
  commentsSettingsReady: Promise<void>;
  /**
   * SPEC-043/ADR-047 (widgets) — the `widget_region_bindings` derived-projection repo
   * (`widgets/ports.ts`'s `WidgetRegionBindingRepoPort`, mirroring `NavLocationBindingRepoPort`
   * exactly). Consumed by both the admin `widgets` routes (region CRUD) and the public site-render
   * path (`routes/site/pages.ts` → `resolvePageWidgets`, W-004).
   */
  widgetBindingRepo: WidgetRegionBindingRepoPort;
  /**
   * SPEC-043/ADR-022 §5 (`entry_refs`) — the reference-integrity index's persistence seam
   * (`core/entry-refs/ports.ts`'s `EntryRefsRepoPort`). Schema-owned by `core`, first populated by
   * `widgets` (the region-area/write-service chokepoint hooks) — consumed here by the admin
   * `widgets` routes for the REQ-34 where-used disclosure and the REQ-42 safe-delete check.
   */
  entryRefsRepo: EntryRefsRepoPort;
  /**
   * SPEC-005 (ADR-005-ARCH) — the `plugin_activations` persistence port (mirrors
   * `PresentationSettingsRepoPort` exactly, rule-of-two). Consumed by the `plugins` admin routes
   * (`PLUGINS_LIST`/`PLUGIN_SET_ENABLED`, REQ-10).
   */
  pluginActivationRepo: PluginActivationRepoPort;
  /**
   * SPEC-005 (ADR-005-ARCH) — pre-bound `discoverPlugins()` closure (install dir / built-in
   * registry already captured by the composition root). Phase 1 of this feature ships zero
   * built-in plugins (the `word-count` dogfood plugin is a later, gated phase per this feature's
   * own tasks.md), so this closure legitimately reports an empty built-in set today; the route
   * surface itself does not know or care how many plugins exist.
   */
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  /** BR-01/BR-05 lifecycle callbacks built once by the composition root and shared by the HTTP
   * and agent-tool enable paths. Failures reject the enable operation. */
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** The same process-lifetime hook registry's content-facing port. */
  pluginBeforeSaveHook: BeforeSaveHookPort;
  /**
   * 2026-08-15 — the deployments feature's READ side (`features/deployments/read-repo.ts`),
   * backing the admin Full Site tab's `GET .../deployments` route
   * (`routes/admin/deployments/list.ts`). Real `SqliteDeploymentsReadRepo` in `server/deps.ts`
   * (migration `0037` already applied — see that repo's own doc); `InMemoryDeploymentsReadRepo`
   * in `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows.
   * No write methods on the port yet — see `features/deployments/index.ts`'s header for why.
   */
  deploymentsReadRepo: DeploymentsReadRepoPort;
  /**
   * The static-site export engine (`src/export/site-exporter.ts`'s `exportSite`), injected here
   * rather than imported directly by `export-site.ts` or `features/deployments/export-run.ts`
   * (shared by that route AND the `deployment_trigger_export` agent tool). This indirection is
   * REQUIRED, not stylistic: `site-exporter.ts` imports `createApp` from THIS file's own
   * `server/app.ts`, and `server/app.ts`'s eager `export const app = createApp();` runs the whole
   * app-boot graph (including `buildAssistantToolRegistrations`, via the BYOK execution mode) as a
   * side effect of loading `server/app.ts` — an eager import of `exportSite` inside
   * `features/deployments/export-run.ts` closed a real cycle back into the still-loading
   * `assistant/tool-registrations.ts` and crashed with `ReferenceError: Cannot access
   * 'DOMAIN_SLICES' before initialization` (see `export-run.ts`'s file header for the full trace).
   * Always the real `exportSite` in both `server/app.ts`'s `createRouteDeps()` and
   * `server/deps.ts`'s `createSqliteRouteDeps()` — the two places safe to import
   * `#src/export/index` directly, since neither is reachable from `assistant/tool-registrations.ts`.
   * Typed structurally via `ExportEngine`, imported `type`-only (erased, zero runtime edge) so this
   * field costs this file nothing even though `export-run.ts` sits under `features/`.
   */
  runExportSite: ExportEngine<RouteDeps>;
  /**
   * `TOVU_EXPORT_DIR` env, then `<cwd>/infra/export` — the export engine's default output directory
   * root, read ONCE at boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolveExportOutputRootDir()` (via `createSqliteRouteDeps()`) rather than re-read deep inside
   * `features/deployments/export-run.ts`'s `startExportRun` or `cli/commands/export.ts`'s
   * `runExportCommand` — same "read once at the root, thread the value down" discipline `themesDir`
   * above already establishes for `TOVU_THEMES_DIR`. `cli/commands/export.ts`'s own `--out` flag
   * still takes precedence over this field where a caller supplies one; this field IS the
   * env-then-default fallback both callers share.
   */
  exportOutputRootDir: string;
  /**
   * Boots a real `Express` app bound to the given `RouteDeps` — the SAME factory `server/app.ts`
   * exports as `createApp`, injected here rather than imported directly by
   * `src/export/site-exporter.ts` (`exportSite` needs to boot an in-process copy of the app to crawl
   * it over real HTTP — see that file's own header). A direct `require("../server/app")` there was
   * the one runtime edge closing `export -> server` (2026-08-16 architecture audit: dependency-cruiser
   * flagged module cycle, propagation cost measured at 29.05% with the edge present vs 9.43% with
   * only this one edge removed). Mirrors `runExportSite`'s injection precedent immediately above —
   * always the real `createApp` in both `server/app.ts`'s `createRouteDeps()` (direct same-file
   * reference) and `server/deps.ts`'s `createSqliteRouteDeps()` (lazily `require`d, for the identical
   * reason `runExportSiteLazily` in both files is — see that field's doc for the full trace).
   */
  createSiteApp: (routeDeps: RouteDeps) => Express;
  /**
   * The SAME `resolveStorefrontProducts` (`server/routes/site/products.ts`) `/products` and
   * `/products/:id` render with, injected here for `export/route-manifest.ts` to reuse (2026-08-16,
   * export<->server decoupling edge 2 — see `ADS-memory/reports/2026-08-16-export-edge-decoupling.md`).
   * NOT moved down into `features/commerce` the way `resolveActiveTheme`/`resolveActiveThemeId` were:
   * its return type, `SiteProduct` (`server/http/site/render.ts`), is DELIBERATELY off-limits to
   * `features/commerce` — see `features/commerce/storefront.ts`'s own file header ("`features/commerce`
   * does not import `SiteProduct` or anything from `server/http/site`... `server/routes/site/
   * products.ts` is what bridges the two"). Moving this function would violate that existing,
   * documented boundary, so injection (mirroring `createSiteApp` immediately above) is the correct
   * shape here, not a fallback taken for lack of trying — measured, not assumed.
   */
  resolveStorefrontProducts: (routeDeps: RouteDeps) => Promise<SiteProduct[]>;
  /**
   * 2026-08-15 (Contract v2) — the `publish_credential_sets` repo backing the admin's Static Site tab
   * "add a connection" form and the DB-backed half of `static-publish/credentials.ts`'s
   * `composePublishCredentialSource`. Real `SqlitePublishCredentialSetRepo` in `server/deps.ts`
   * (migration `0041` already applied — see that repo's own doc); `InMemoryPublishCredentialSetRepo`
   * in `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
   * via the SAME shared `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above —
   * one sealing capability app-wide, same reasoning `adminExecutionCredentialRepo`/
   * `mediaProviderCredentialRepo` already establish.
   */
  publishCredentialSetRepo: PublishCredentialSetRepoPort;
  /**
   * 2026-08-16 rework of the original flat-JSON-file design (see `static-publish/publish-history.ts`'s
   * own header) — the append-only `publish_history` table backing `deployment_get_static_publish_capabilities`'s
   * `lastPublish` field. Real `SqlitePublishHistoryStore` (`db/sqlite/publish-history-repo.sqlite.ts`)
   * in `server/deps.ts`; `InMemoryPublishHistoryStore` in `server/app.ts`'s hermetic composition, same
   * rule-of-two every other repo/port here follows. `static-publish/publish-run.ts`'s
   * `startPublishRun`/`runPublishAndAwait` both take a `PublishHistoryStore` as a required
   * (non-defaulted) parameter — `publish-site.ts` and `publish-agent-tools.ts` pass this field
   * straight through rather than either one constructing its own instance.
   */
  publishHistoryStore: PublishHistoryStore;
  /**
   * 2026-08-15 (Contract v2) — this install's `PublishExecutionMode`, read once at boot from
   * `TOVU_EXECUTION_MODE` (`publish-credentials/execution-mode.ts`'s `executionModeFromEnv`) in BOTH
   * composition roots. Governs `composePublishCredentialSource`'s env-var-fallback behavior
   * (`"self-hosted-cli"` only — see that function's own doc) and is echoed verbatim in the
   * `GET .../publish/credentials` response so the admin UI can show self-hosted-vs-hosted-appropriate
   * guidance without re-deriving it client-side.
   */
  publishExecutionMode: PublishExecutionMode;
  /**
   * `TOVU_PUBLISH_DIR` env, then `<cwd>/infra/publish` — the static-publish flow's parent output
   * directory, read ONCE at boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolvePublishOutputRootDir()` (via `createSqliteRouteDeps()`), same "read once at the root"
   * discipline `exportOutputRootDir` above establishes. `static-publish/adapter.ts`'s
   * `publishOutputDir` joins this with the target id to get the per-target directory it actually
   * exports into — never re-reads `process.env` itself.
   */
  publishOutputRootDir: string;
  /**
   * 2026-08-16 — cached, non-secret provider-verification results for `publishCredentialSetRepo`'s
   * (or the env-var fallback's) credentials, keyed by `(workspaceId, target)`. Fixes "ready means a
   * row exists, not a working credential" (`deployments/static-publish/verify.ts`'s own header has
   * the full incident/design trail): `deployment_get_static_publish_capabilities`
   * (`publish-agent-tools.ts`) only ever calls `.get()` on this — a plain in-memory lookup, never a
   * decrypt, never a network call, so a read tool stays fast and cannot leak a credential. Only
   * `verifyPublishCredential` (called from `publish-credentials.ts`'s admin route, a human-gated
   * write surface, never an agent tool) ever calls `.set()`/`.delete()`. ONE shared
   * `InMemoryPublishCredentialVerificationCache` instance in both composition roots — same
   * app-wide-singleton reasoning `siteAssistantSecretSealer` above already establishes, so a result
   * cached from one request is visible to the next.
   */
  publishCredentialVerificationCache: PublishCredentialVerificationCache;
  /**
   * 2026-08-15 — the `source_control_credential_sets` repo backing the admin Source Control page's
   * connect/replace form (`routes/admin/system/source-control-credentials.ts`). Real
   * `SqliteSourceControlCredentialSetRepo` in `server/deps.ts`; `InMemorySourceControlCredentialSetRepo`
   * in `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
   * via the SAME shared `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above — one
   * sealing capability app-wide, same reasoning `publishCredentialSetRepo` already establishes. A
   * deliberately SEPARATE table from `publishCredentialSetRepo` above, not a widened
   * `PublishProviderId` union — see `src/db/schema.ts`'s `sourceControlCredentialSets` doc comment for
   * why.
   */
  sourceControlCredentialSetRepo: SourceControlCredentialSetRepoPort;
  /**
   * `TOVU_SOURCE_CONTROL_EXPORT_DIR` env, then `<cwd>/infra/source-control-export` — the
   * `source-control` domain's own export scratch directory (deliberately separate from
   * `exportOutputRootDir`/`publishOutputRootDir` above so no two of these features ever race over
   * the same on-disk output — see `features/source-control/commit-site.ts`'s header), read ONCE at
   * boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolveSourceControlExportRootDir()` (via `createSqliteRouteDeps()`). `commit-site.ts`'s
   * `commitExportDir` joins this with the provider subdirectory (`"github"`) — never re-reads
   * `process.env` itself.
   */
  sourceControlExportRootDir: string;
  /**
   * 2026-08-16 (Phase 3) — the `vendor_credential_sets` repo backing the unified vendor-scoped
   * credential redesign (`features/vendor-credentials/`; `db/schema.ts`'s `vendorCredentialSets`
   * doc has the full "destination vs. vendor" reasoning). Real `SqliteVendorCredentialSetRepo`
   * (`db/sqlite/vendor-credential-repo.sqlite.ts`) in `server/deps.ts`;
   * `InMemoryVendorCredentialSetRepo` in `server/app.ts`'s hermetic composition, same rule-of-two
   * every other repo here follows. Sealed via the SAME shared `siteAssistantSecretSealer`/
   * `siteAssistantSecretKeyring` instances above — one sealing capability app-wide, same reasoning
   * `publishCredentialSetRepo`/`sourceControlCredentialSetRepo` already establish.
   *
   * This table does NOT yet replace `publishCredentialSetRepo`/`sourceControlCredentialSetRepo`
   * above — both stay wired and fully live. `features/vendor-credentials/dual-read.ts`'s
   * `resolveDefaultForVendorDualRead` is the seam that lets a future caller read this table first
   * and fall back to one of the two legacy repos above when a vendor's group here is still empty
   * (an install whose data has not been backfilled by `development/scripts/backfill-vendor-
   * credentials.ts` yet) — see that module's own header for the full design and why a straight
   * cutover was rejected.
   */
  vendorCredentialSetRepo: VendorCredentialSetRepoPort;
  /**
   * 2026-08-17 — the `custom_credential_sets` repo backing the admin Access Tokens page's
   * "Add custom provider" form (`routes/admin/system/custom-credentials.ts`). Real
   * `SqliteCustomCredentialSetRepo` in `server/deps.ts`; `InMemoryCustomCredentialSetRepo` in
   * `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
   * via the SAME shared `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above —
   * one sealing capability app-wide, same reasoning `publishCredentialSetRepo`/
   * `sourceControlCredentialSetRepo` already establish. A deliberately separate table from both of
   * those and from `vendorCredentialSetRepo` — see `src/db/schema.ts`'s `customCredentialSets` doc
   * comment for why (no fixed provider-id catalog to join either union, or the vendor table's own
   * vendor-keyed model).
   */
  customCredentialSetRepo: CustomCredentialSetRepoPort;
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
