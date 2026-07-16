/**
 * @file SPEC-022 C-002 — the checked-in capability inventory (REQ-01, REQ-06, OQ-02 resolution).
 *
 * A typed TS module, not a Markdown/YAML doc (implementation-outline.md OQ-02): the boot-time
 * gate (`production-readiness-gate.ts`) consults this data at runtime, and TypeScript enforces
 * field completeness at compile time — a `CapabilityInventoryEntry` missing a required field
 * will not compile.
 *
 * `hasDurableAdapter` reflects `src/server/deps.ts` (`createSqliteRouteDeps`) — the real
 * production composition root — as of this spec, not `src/server/app.ts` (the hermetic
 * in-memory test/dev composition, which is in-memory everywhere by design and never
 * production-classified-relevant). Per INV-03, this field is this inventory's own
 * independently-asserted verification, not a passthrough of any adapter's self-reported
 * `capabilities().durable` flag (the exact gap ADR-046's debate found in
 * `LocalBufferSink.capabilities().durable`, which misreports `true`).
 */

export type CapabilityClassification = "production" | "local-only" | "experimental";
export type StartupCriticality = "critical" | "optional";

export interface CapabilityInventoryEntry {
  /** Stable, unique identifier. Referenced by `findCapabilityEntry`/`capabilityRouteGuard`. */
  name: string;
  ownerModule: string;
  classification: CapabilityClassification;
  /** Human-readable description of the actual persistence/adapter backing this capability today. */
  sourceOfTruth: string;
  readinessDependencies: readonly string[];
  startupCriticality: StartupCriticality;
  securityDependencies: readonly string[];
  restartTestOwner: string;
  /** Independently-asserted (INV-03), not read from any adapter's self-reported capabilities(). */
  hasDurableAdapter: boolean;
  /** EC-01/AC-02: set when no single module unambiguously owns this capability. */
  ownerAmbiguous?: boolean;
  ambiguityNote?: string;
  /**
   * Extra literal strings (class names, import-path fragments) the staleness check (REQ-12) may
   * match against `deps.ts`/`app.ts` source when `name` itself isn't a literal substring there.
   */
  sourceHints?: readonly string[];
}

export const CAPABILITY_INVENTORY: readonly CapabilityInventoryEntry[] = [
  {
    name: "workspace",
    ownerModule: "features/workspace",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteWorkspaceRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/workspace test suite",
    hasDurableAdapter: true,
    sourceHints: ["WorkspaceRepo"],
  },
  {
    name: "posts",
    ownerModule: "features/post",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqlitePostRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/post test suite",
    hasDurableAdapter: true,
    sourceHints: ["PostRepo"],
  },
  {
    name: "presentation",
    ownerModule: "features/presentation",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqlitePresentationSettingsRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/presentation test suite",
    hasDurableAdapter: true,
    sourceHints: ["PresentationSettingsRepo"],
  },
  {
    name: "settings",
    ownerModule: "features/settings",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteSettingsRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/settings test suite",
    hasDurableAdapter: true,
    sourceHints: ["SettingsRepo"],
  },
  {
    name: "identity",
    ownerModule: "identity",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, createSqliteIdentityRouteDeps)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["argon2id password hashing", "session token store"],
    restartTestOwner: "identity test suite",
    hasDurableAdapter: true,
    sourceHints: ["createSqliteIdentityRouteDeps"],
  },
  {
    name: "navigation",
    ownerModule: "navigation",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteMenuRepo/SqliteNavLocationBindingRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "navigation test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteMenuRepo", "menuRepo"],
  },
  {
    name: "newsletter",
    ownerModule: "newsletter",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, declareDataModule() 5-table manifest + Drizzle campaign repo)",
    readinessDependencies: ["content.db connection", "installNewsletterDataModule() boot step"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "newsletter test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteNewsletterCampaignRepo", "newsletter"],
  },
  {
    name: "redirects",
    ownerModule: "redirects",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteRedirectRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "redirects test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteRedirectRepo", "redirects"],
  },
  {
    name: "forms",
    ownerModule: "forms",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteFormDefinitionRepo/SqliteFormSubmissionRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate", "FORMS_SUBMIT_PROFILE rate limiter"],
    restartTestOwner: "forms test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteFormDefinitionRepo", "forms"],
  },
  {
    name: "storage",
    ownerModule: "features/storage",
    classification: "production",
    sourceOfTruth: "sqlite (sidecar ops/storage-journal.db, SqliteStorageLedgerRepo/SqliteRestorePointsRepo)",
    readinessDependencies: ["ops/storage-journal.db sidecar connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/storage test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteStorageLedgerRepo", "storageLedgerRepo"],
  },
  {
    name: "content-types",
    ownerModule: "features/content-types",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteContentTypeRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate", "gated-mutations plan/confirm/execute ceremony"],
    restartTestOwner: "features/content-types test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteContentTypeRepo", "contentTypeRepo"],
  },
  {
    name: "entries",
    ownerModule: "features/entries",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteEntryRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "features/entries test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteEntryRepo", "entryRepo"],
  },
  {
    name: "taxonomy",
    ownerModule: "features/taxonomy",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteTaxonomyRepo/SqliteTermRepo/SqliteEntryTermRepo)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate", "gated-mutations plan/confirm/execute ceremony"],
    restartTestOwner: "features/taxonomy test suite",
    hasDurableAdapter: true,
    sourceHints: ["SqliteTaxonomyRepo", "taxonomyRepo"],
  },
  {
    name: "seo",
    ownerModule: "seo",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, piggybacks on SqliteSettingsRepo via ensureSeoSettingDefinitions)",
    readinessDependencies: ["content.db connection", "settings capability ready"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "seo test suite",
    hasDurableAdapter: true,
    sourceHints: ["ensureSeoSettingDefinitions", "seo"],
  },
  {
    name: "recovery",
    ownerModule: "features/recovery",
    // Deliberately NOT "production": the restore ceremony runs its full plan/confirm/execute/
    // lock/ledger sequence but does not physically overwrite content.db (no live-swap mechanism
    // for an already-open shared connection — disclosed, unfixed, several sessions running) and
    // its disclosure watermark source is a literal `AlwaysUnavailableWatermarkSource`. Containing
    // it in production mode until that gap closes is the honest classification, not a guess.
    classification: "experimental",
    sourceOfTruth: "sqlite (restore-points ledger only; the restore-execute step itself has no durable live-swap path)",
    readinessDependencies: ["live content.db swap mechanism (not yet built)", "a real disclosure watermark source"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate", "gated-mutations plan/confirm/execute ceremony"],
    restartTestOwner: "features/recovery test suite",
    hasDurableAdapter: false,
    sourceHints: ["features/recovery", "AlwaysUnavailableWatermarkSource"],
  },
  {
    name: "gated-mutations",
    ownerModule: "core/gated-mutations",
    classification: "production",
    sourceOfTruth: "in-memory (InMemoryTokenStore, one process-lifetime instance)",
    readinessDependencies: ["durable TokenStorePort adapter (Phase 1)"],
    startupCriticality: "critical",
    securityDependencies: ["identity authorize() gate", "actor-identity binding"],
    restartTestOwner: "core/gated-mutations test suite",
    hasDurableAdapter: false,
    ownerAmbiguous: true,
    ambiguityNote:
      "Owned by core/gated-mutations as the port/gateway definition, but configured and instantiated per composition root (server/deps.ts and server/app.ts each call buildGatewayDeps independently) — no single feature module is the sole owner of its runtime configuration.",
    sourceHints: ["gatedMutations", "buildGatewayDeps"],
  },
  {
    name: "outbox",
    ownerModule: "core/events",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteOutboxAdapter — ADR-046 Phase 1, BR-04 resolution, 2026-07-16)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: [],
    restartTestOwner: "core/events/__tests__/outbox-restart.integration.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["SqliteOutboxAdapter", "outbox_events"],
  },
  {
    name: "change-sets",
    ownerModule: "core/commands",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteChangeSetRepo — ADR-046 Phase 1 slice 1, SPEC-023, 2026-07-16)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate"],
    restartTestOwner: "core/commands/__tests__/change-sets-restart.integration.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["changeSets", "SqliteChangeSetRepo"],
  },
  {
    name: "members",
    ownerModule: "members",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteMemberRepo/SqliteMemberSessionRepo/SqliteMagicLinkTokenRepo/SqliteMemberTierRepo/SqliteMemberSubscriptionRepo — ADR-046 Phase 1, 2026-07-16)",
    readinessDependencies: ["content.db connection"],
    startupCriticality: "critical",
    securityDependencies: ["magic-link rate limiters", "session token store"],
    restartTestOwner: "members/__tests__/restart.integration.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["SqliteMemberRepo", "members"],
  },
  {
    name: "webhooks",
    ownerModule: "integrations",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteWebhookSubscriptionRepo/SqliteWebhookDeliveryRepo — ADR-046 Phase 1, 2026-07-16); processDueDeliveries worker still not started anywhere",
    readinessDependencies: ["delivery worker activation (Phase 4, still gated per REQ-07 regardless of durability)"],
    startupCriticality: "optional",
    securityDependencies: ["KeyringPort-backed webhook signer"],
    restartTestOwner: "integrations/__tests__/repo.subscription.contract.test.ts, repo.delivery.contract.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["webhookSubscriptionRepo", "webhookDeliveryRepo", "processDueDeliveries"],
  },
  {
    name: "origin",
    ownerModule: "origin",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteOriginSettingRepo — ADR-046 Phase 1, 2026-07-16; still seeded with a hardcoded dev-capability localhost origin via seedDevCapabilityOrigin)",
    readinessDependencies: ["a real (non-hardcoded) verified production origin — no admin route/verification flow exists yet, disclosed gap this slice does not close"],
    startupCriticality: "critical",
    securityDependencies: ["egress allowlist enforcement"],
    restartTestOwner: "origin/__tests__/repo.contract.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["SqliteOriginSettingRepo", "originRegistry"],
  },
  {
    name: "media",
    ownerModule: "media",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteMediaRepo/SqliteAssetBlobRepo/SqliteAssetRenditionRepo/SqliteTransformDefinitionRepo — ADR-046 Phase 1, 2026-07-16); blob bytes durable via LocalFsBlobStore",
    readinessDependencies: ["sharp native binary readiness (REQ-08, checked separately by the boot gate's sharpReadiness param)"],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate (ADR-027 §7 permission set)"],
    restartTestOwner: "media/__tests__/repo.contract.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["SqliteMediaRepo", "mediaRepo"],
  },
  {
    name: "analytics",
    ownerModule: "analytics",
    classification: "production",
    sourceOfTruth: "sqlite (content.db, SqliteBufferSink — ADR-046 Phase 1, final capability slice, 2026-07-16); LocalBufferSink's capabilities().durable misreport is fixed too (now reports false)",
    readinessDependencies: [],
    startupCriticality: "optional",
    securityDependencies: ["identity authorize() gate (analytics.read)"],
    restartTestOwner: "analytics/__tests__/repo.contract.test.ts",
    hasDurableAdapter: true,
    sourceHints: ["SqliteBufferSink", "analyticsSink"],
  },
  {
    name: "store",
    ownerModule: "features/plugins/store",
    // SPIKE sample Tier-3 plugin (app.ts: "SPIKE: sample Tier-3 store page") — never intended as
    // a production capability; contained in production mode until (if ever) promoted.
    classification: "experimental",
    sourceOfTruth: "sqlite (content.db, via its own never-brick dataModule seam) — durable, but the capability itself is a spike, not a supported production surface",
    readinessDependencies: ["product decision to promote this spike to a supported feature"],
    startupCriticality: "optional",
    securityDependencies: [],
    restartTestOwner: "features/plugins/store test suite",
    hasDurableAdapter: false,
    sourceHints: ["routes/site/store", "registerStoreRoutes", "bootstrapStore"],
  },
] as const;

const INVENTORY_BY_NAME = new Map(CAPABILITY_INVENTORY.map((entry) => [entry.name, entry]));

export function findCapabilityEntry(name: string): CapabilityInventoryEntry | undefined {
  return INVENTORY_BY_NAME.get(name);
}
