import type { Express } from "express";

import type { EventBusPort, OutboxPort, UUID } from "../../core/ports";
import type { AuthorizeFn, ChangeSetRepoPort } from "../../core/commands";
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
} from "../../identity";
import type { PostRepoPort } from "../../features/post";
import type { PresentationSettingsRepoPort } from "../../features/presentation";
import type { SettingsRepoPort } from "../../features/settings/ports";
import type { DiscoveredTheme } from "../../features/theme";
import type { WorkspaceRepoPort } from "../../features/workspace";
import type { AnalyticsSinkPort } from "../../analytics/ports";
import type {
  MagicLinkTokenRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "../../members";
import type { MailerPort } from "../../mail";
import type { MenuRepoPort } from "../../navigation/repo.memory";
import type { NavLocationBindingRepoPort } from "../../navigation";
import type { WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../integrations";
import type { WebhookSigner } from "../../integrations/signing";
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
import type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "../../forms/ports";
import type { CommentIngressPolicy, CommentRepoPort } from "../../comments/ports";
import type { CommentWriteService } from "../../comments/write-service";
import type { RateLimiter } from "../middleware/rate-limit";
import type { LedgerReadPort } from "../../features/storage/timeline";
import type { RestorePointListPort, RestorePointSavePort } from "../../features/storage/restore-points";
import type { SiteStatusPort } from "../../features/storage/boot/reconcile-interrupted-migration";
import type { DbOpsPort } from "../../core/gated-mutations/ports";
import type { ContentTypeRepoPort, IndexProvisionerPort } from "../../features/content-types/write-service";
import type { TeardownIndexProvisionerPort } from "../../features/content-types/lifecycle";
import type { ContentTypeListPort } from "../../features/content-types/list";
import type { EntryRepoPort } from "../../features/entries/write-service";
import type { EntryListPort } from "../../features/entries/list";
import type { EntryTermRepoPort, TaxonomyRepoPort, TaxonomyRevisionRepoPort, TermRepoPort } from "../../features/taxonomy/write-service";
import type { TaxonomyListPort, TermListPort } from "../../features/taxonomy/list";
import type { DisclosureWatermarkSourcePort } from "../../features/recovery/disclosure";
import type { DeepLinkRestorePointLookupPort } from "../../features/recovery/deep-link";
import type { GatewayDeps } from "../../core/gated-mutations/gateway";
import type { LedgerAppendPort, MergeableEntryTermRepoPort } from "../gated-mutations-composition";

export interface RouteDeps {
  workspaceId: UUID;
  workspaceRepo: WorkspaceRepoPort;
  postRepo: PostRepoPort;
  presentationRepo: PresentationSettingsRepoPort;
  /**
   * SPEC-007 — the settings ledger's repo port. `core.commands.appliers`
   * (via `revert.ts`) reads through this now instead of
   * `PresentationSettingsRepoPort` (ADR-PIPE-007 Migration Safety); the
   * admin `settings.*` routes (Phase 5, not yet wired) will consume it too.
   */
  settingsRepo: SettingsRepoPort;
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
  /** Change-set store for the command gateway (in-memory in v1, ADR-008/018). */
  changeSets: ChangeSetRepoPort;
  /** Themes discovered at boot (built-in + site themes/ dir), SPEC-004 spike. */
  themes: DiscoveredTheme[];
  outbox: OutboxPort;
  bus: EventBusPort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  /** Analytics ingest buffer (ADR-035 ingest-only stage; no rollup yet). ADR-046 Phase 1: durable
   * in real composition (`SqliteBufferSink`), in-memory in hermetic composition (`LocalBufferSink`). */
  analyticsSink: AnalyticsSinkPort;
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
   * is a single, process-lifetime `createRateLimiter(FORMS_SUBMIT_PROFILE, clock)` instance (not
   * constructed per-request) so its fixed-window counters persist across requests.
   */
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  formsRateLimiter: RateLimiter;
  /**
   * ADR-041 §1/§2 — the Storage Timeline's read port, backed by the sidecar
   * `ops/storage-journal.db` (`infra/sqlite/storage-journal-repo.ts`'s `SqliteStorageLedgerRepo`
   * in `server/deps.ts`'s real composition; `features/storage/repo.memory.ts`'s
   * `InMemoryStorageLedgerRepo` in `server/app.ts`'s hermetic composition). Only the read side is
   * wired into `RouteDeps` this pass — see `routes/admin/storage/timeline.ts`'s file header for
   * what remains unwired.
   */
  /** Widened this dispatch with `LedgerAppendPort` — both `SqliteStorageLedgerRepo` and
   * `InMemoryStorageLedgerRepo` already implement `.append()`; only the type declaration here was
   * narrower than the concrete instances (see `gated-mutations-composition.ts`'s
   * `buildMigrateForwardHooks`/`buildRestoreHooks`, which need to append real ledger rows). */
  storageLedgerRepo: LedgerReadPort & LedgerAppendPort;
  /**
   * Admin-UI backend-gap closure (design-spec.md §0.4/§1.9/§2.8/§3.8/§4.8, this dispatch) — the
   * read-side + route-layer wiring the Web Design pass found missing across `content-types`,
   * `entries`, `taxonomy`, and (partially) `storage`/`recovery`. Every field below is backed by an
   * in-memory adapter in BOTH `server/app.ts` and `server/deps.ts` (no SQLite adapter exists yet
   * for `content-types`/`entries`/`taxonomy` — the same disclosed "no adapter yet" precedent
   * `mediaRepo`/`transformDefinitionRepo`/`memberRepo` already establish above), EXCEPT
   * `restorePointsRepo`/`dbOps`, which get real `infra/sqlite/storage-journal-repo.ts`/`db-ops.ts`
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
  taxonomyRepo: TaxonomyRepoPort & TaxonomyListPort;
  termRepo: TermRepoPort & TermListPort;
  /** Widened this dispatch with `MergeableEntryTermRepoPort` (the `mergeTerm` gated-mutation
   * ceremony's by-term enumeration need — see `gated-mutations-composition.ts`). */
  entryTermRepo: EntryTermRepoPort & MergeableEntryTermRepoPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
  /** ADR-041 §2/§4 — the `restore_points` table's list + save side (`storage/restore-points.ts`'s
   * new `RestorePointListPort`/`RestorePointSavePort`). Real `SqliteRestorePointsRepo` in
   * `server/deps.ts` (already built, previously unwired); in-memory in `server/app.ts`. */
  restorePointsRepo: RestorePointListPort & RestorePointSavePort;
  /** SPEC-016 C-007 — the dialect-neutral restore-point capability/capture surface. Real
   * `SqliteDbOpsAdapter` in `server/deps.ts` (already built, previously unwired); a deterministic
   * in-memory double in `server/app.ts` (`features/storage/repo.memory.ts`'s
   * `InMemoryDbOpsAdapter`). */
  dbOps: DbOpsPort;
  /** ADR-041 §3/§10 — this site's `SERVING`/`PENDING_MIGRATION`/`BLOCKED_PENDING_RECOVERY` status.
   * In-memory in both compositions, defaulted to `SERVING` — no composition root invokes
   * `features/storage/boot/*`'s reconciliation functions at actual boot yet (disclosed gap, see
   * handoff), so this only ever changes if a future caller calls `.set()`. */
  siteStatusRepo: SiteStatusPort;
  /** ADR-045 §2 — Recovery's discarded-write-window baseline source. Always reports the baseline
   * as unavailable (`features/recovery/repo.memory.ts`'s `AlwaysUnavailableWatermarkSource`) — the
   * safe default per `disclosure.ts`'s own "never fabricate a zero count" rule, not a corner cut;
   * see that class's doc comment. */
  disclosureWatermarkSource: DisclosureWatermarkSourcePort;
  /** ADR-041 §7/ADR-045 §5 — re-resolves a `StorageContextEnvelope`'s carried `restorePointId`
   * server-side (`features/recovery/repo.memory.ts`'s `RestorePointDeepLinkLookup`, backed by the
   * same real `restorePointsRepo` list above). */
  deepLinkRestorePointLookup: DeepLinkRestorePointLookupPort;
  /**
   * SPEC-016 (`core/gated-mutations`'s gateway, ADR-041 §5) — composed into a real composition
   * root for the first time this dispatch. One process-lifetime `GatewayDeps` (in-process
   * `InMemoryTokenStore`, see `gated-mutations-composition.ts`'s file header for the disclosed
   * `TokenStorePort` decision) shared by every gated-mutation route this dispatch wires
   * (`taxonomy/terms/:id/merge`, `storage/migrate-forward`, `recovery/restore`).
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
}

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
