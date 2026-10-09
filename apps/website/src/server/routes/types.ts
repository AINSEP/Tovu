import type { Express } from "express";
import type { RememberedApprovalPort } from "@jini-ai/core";
import type { SettingsToolDeps } from "#src/features/settings/tool-registrations";
import type { createSitemapService } from "@jini-ai/cms/seo";
import type { SeoHostBindings } from "#src/features/seo/index";
import type { PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";
import type { SiteProduct } from "../inbound/public-http/http/site/render.js";

import type { ExportReport } from "#src/features/site-export/index";
import type { ObservabilityPort } from "#src/platform/observability/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { SiteBinding } from "#src/platform/site-dir/index";
import type { SiteBackupSources } from "#src/features/site-backup/sources";
import type { ToolAttemptAuditSink } from "#src/features/tool-audit/types";
import type { RemoveEntity, TrashDb, TrashRegistry } from "#src/features/trash/index";
import type { ForgetRemovedEntity, TrashPort, TrashSweepOnce } from "@jini-ai/cms/trash";
import type { UUID } from "@jini-ai/core/primitives";
import type { EventBusPort, OutboxPort } from "@jini-ai/cms/core";
import type { AuthorizeFn, ChangeSetRepoPort, RevertRegistry } from "../../contracts/core/commands/index.js";
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
} from "@jini-ai/user-management";
import type { ApiKeyRepoPort, ApiKeySecretHasherPort } from "../../features/identity/api-key-types.js";
import type { PostRepoPort, PostSearchPort, BeforeSaveHookPort, PostRecord, RemovePostFn, SlugChangeCaptureLookup } from "../../features/post/index.js";
import type { PagesHtmlDocumentStoreFactory } from "../../features/pages/index.js";
import type { ChatStoreFactory } from "../../assistant/persistence/tenant-scope.js";
import type { ChatRunLedger } from "#src/assistant/index";
import type { AgentSessionStore } from "../../assistant/persistence/agent-session-store.js";
import type { PresentationSettingsRepoPort } from "../../features/presentation/index.js";
import type { SettingsRepoPort, getEffective, set } from "../../features/settings/index.js";
import type { SiteDisplayNameSource, SiteTitlePreservationStorePort } from "../../features/settings/site-title.js";
import type { DiscoveredTheme } from "../../features/theme/index.js";
import type { WorkspaceRepoPort } from "../../features/workspace/index.js";
import type { AnalyticsConfigPort, AnalyticsSinkPort } from "../../features/analytics/index.js";
import type {
  MagicLinkTokenRepoPort,
  MemberRepoPort,
  MemberSessionRepoPort,
  MemberSubscriptionRepoPort,
  MemberTierRepoPort,
} from "../../features/members/index.js";
import type { MailerPort } from "../../platform/mail/index.js";
import type { MenuRepoPort, NavLocationBindingRepoPort } from "../../features/navigation/index.js";
import type { RemoveMenuFn } from "../../features/navigation/trash-menu.js";
import type { KeyringPort, SecretSealerPort, WebhookDeliveryRepoPort, WebhookSubscriptionRepoPort } from "../../features/webhooks/index.js";
import type { WebhookSigner } from "../../features/webhooks/signing.js";
import type { SiteAssistantCredentialRepoPort } from "../../assistant/site-credential-store.js";
import type { DatabaseDestinationStorePort } from "../../features/database-transfer/destination-store.js";
import type { AdminExecutionCredentialRepoPort } from "../../assistant/execution-credential-store.js";
import type { PublishExecutionMode } from "../../features/deployments/publish-credentials/index.js";
import type { PublishCredentialVerificationCache, PublishHistoryStore } from "../../features/deployments/static-publish/index.js";
import type { DeployTargetRegistry } from "../../features/deployments/deploy-targets/types.js";
import type { LoadSourceControlProviders } from "../../features/source-control/provider-registry.js";
import type { CredentialSchemeRule } from "../../features/custom-credentials/auth-schemes.js";
import type { CustomCredentialSetRepoPort } from "../../features/custom-credentials/index.js";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { SourceControlCredentialSetRepoPort } from "../../features/source-control/index.js";
import type { VendorCredentialSetRepoPort } from "../../features/vendor-credentials/index.js";
import type { MediaProviderCredentialRepoPort } from "../../features/media/index.js";
import type { ExternalMcpServerRepoPort } from "../../assistant/external-mcp-store.js";
import type { ConversationToolApprovalStore, ExternalMcpToolApprovalRepoPort } from "../../assistant/external-mcp-tool-approval-ports.js";
import type { DeviceAuthorizationStore, ExternalMcpOAuthService } from "#src/assistant/external-mcp-oauth";
import type { PendingAuthorizationStore } from "@jini-ai/oauth";
import type {
  AssetBlobRepoPort,
  AssetRenditionRepoPort,
  BlobStorePort,
  ImageTransformerPort,
  MediaContentTypeStorePort,
  TransformDefinitionRepoPort,
  VersionedMediaRepoPort,
} from "../../features/media/index.js";
// Composition-root-only boot effect, deliberately imported straight from its own file rather than
// through the `features/media` barrel — same precedent `deps.ts` already follows for
// `ensureCoreMediaTransform` (not barrel-exported either): this type has no reason to be part of
// this host's wider public media surface.
import type { HydrateBlobStoreFromSeedResult } from "../../features/media/hydrate-blob-store-from-seed.js";
import type { RemoveMediaFn } from "../../features/media/tool-registrations.js";
import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import type { RedirectHitSink, RedirectRepoPort, RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import type { FormDefinitionRepoPort, FormSubmissionRepoPort, RemoveFormSubmissionFn } from "@jini-ai/cms/forms";
import type { CommentIngressPolicy, CommentRepoPort, CommentWriteService } from "@jini-ai/cms/comments";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { LedgerReadPort } from "../../features/database/timeline.js";
import type {
  RestorePointListPort,
  RestorePointSavePort,
  RestorePointIdempotencyLookupPort,
} from "../../features/database/restore-points.js";
import type { DatabaseIntrospectionPort } from "../../features/database/adapter.sqlite.js";
import type {
  BootLedgerPort,
  MigrationRunsRepoPort,
  SiteStatusPort,
} from "../../features/database/boot/reconcile-interrupted-migration.js";
import type { DbOpsPort } from "../../contracts/core/gated-mutations/ports.js";
import type { ContentTypeRepoPort, IndexProvisionerPort } from "../../features/content-types/index.js";
import type { TeardownIndexProvisionerPort } from "../../features/content-types/index.js";
import type { ContentTypeListPort } from "../../features/content-types/index.js";
import type { EntryRepoPort } from "../../features/entries/index.js";
import type { EntryListPort } from "../../features/entries/index.js";
import type { EntryDisplayListPort, EntryListExcludingTypesPort } from "../../features/entries/public-list.js";
import type { EntryPublishReadPort } from "../../features/entries/repo.sqlite.js";
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
  UnassignableEntryTermRepoPort,
  ImportableTaxonomyRepoPort,
  ImportableTermRepoPort,
} from "../../features/taxonomy/index.js";
import type { DisclosureWatermarkSourcePort } from "../../features/recovery/disclosure.js";
import type { DeepLinkRestorePointLookupPort } from "../../features/recovery/deep-link.js";
import type { GatewayDeps } from "../../contracts/core/gated-mutations/gateway.js";
import type { LedgerAppendPort } from "../../features/database/gated-hooks.js";
import type { MergeableEntryTermRepoPort } from "../../features/taxonomy/gated-hooks.js";
import type { EntryTermReadPort, TaxonomyPublishReadPort, TermPublishReadPort } from "../../features/taxonomy/repo.sqlite.js";
import type {
  RemoveTermFn,
  RemoveTaxonomyFn,
  TermTrashReadPort,
  TaxonomyTrashReadPort,
} from "../../features/taxonomy/trash-term.js";
import type { WidgetRegionBindingRepoPort, RemoveWidgetFn } from "@jini-ai/cms/widgets";
import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";
import type { PluginActivationRepoPort } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import type { PluginBeforeSavePreview } from "#src/features/plugin-runtime/host-binding";
import type { PluginConflict } from "@jini-ai/plugins/host";
import type { PluginPackageFiles } from "@jini-ai/plugins/host/node";
import type { RemovePluginFn } from "@jini-ai/plugins/host";
import type { ExportEngine } from "../../features/deployments/index.js";
import type { PublishTrustRevocationPort } from "#src/features/publish-trust/revocations";
import type { PublishContentBundleRepoPort } from "../../features/publish-content/bundle-staging.js";
import type { PublishContentBaselineRepoPort } from "../../features/publish-content/baseline-repo.js";
import type { PublishContentApplyPort } from "../../features/publish-content/gated-hooks.js";
import type { PublishContentRunRepoPort } from "../../features/publish-content/run-repo.js";
import type { PublishContentPeerRepoPort } from "../../features/publish-content/peers.js";
import type { FileBlobIndexPort } from "../../features/publish-content/file-blob-index.js";

/**
 * The served site's storage locations ({@link RouteDeps.siteStoragePaths}). Each `TOVU_*` override
 * is honored at the composition root that builds this, never by a reader of it.
 */
export interface SiteStoragePaths {
  /** The `content.db` path this composition opened (`TOVU_CONTENT_DB`, else `<site>/content.db`). */
  readonly contentDbPath: string;
  /** The local blob store's root (`TOVU_MEDIA_UPLOADS_DIR`, else `<site>/uploads`); still reported
   *  when media lives in object storage, same as before this field existed. */
  readonly mediaUploadsDir: string;
  /** `chat-attachment-directory.ts`'s answer for {@link contentDbPath} — the agent daemon writes
   *  staged chat uploads here and the API reads them back. */
  readonly chatAttachmentsDir: string;
}

/**
 * Process-wide clock and id generation, independent of every domain group.
 */
export interface ClockDeps {
  clock: { nowMs(): number; nowIso(): string };
  idGen: { newId(): string };
}

/**
 * Principal-centric auth ports (ADR-021 / SPEC-006) used by admin authentication.
 */
export interface IdentityDeps {
  /** The same transaction/session token ports the identity root binds; callers cannot omit them. */
  transactions: import("@jini-ai/user-management").IdentityRepos["transactions"];
  tokens: import("@jini-ai/user-management").SessionTokenPort;
  principalRepo: PrincipalRepoPort & import("@jini-ai/core/settings").SettingsPrincipalLookupPort;
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
  /** SPEC-006 REQ-08 — the `api_keys` repo port (`identity/api-key-types.ts`). Declared in this
   *  repo rather than in `@jini-ai/cms/identity`, which scopes API keys out of its own surface. */
  apiKeyRepo: ApiKeyRepoPort;
  /** SPEC-006 REQ-08 — the api-key secret hashing seam, deliberately separate from
   *  `passwordHasher`; see `identity/api-key-secret.ts`'s header for why the two are tuned apart. */
  apiKeySecretHasher: ApiKeySecretHasherPort;
  /** Delete-user plan v2 Slice 2 — `trashUser`'s Trash-bound remove callback and trash-membership
   *  check; see `identity/wiring.ts`'s `IdentityRouteDepsSlice.removeUser` doc for the
   *  default-then-override story between the two composition roots. */
  removeUser?: RemoveEntity;
  isInTrash: (principalId: UUID) => Promise<boolean>;
  /**
   * Resolves once first-boot identity seeding (`identity/seed.ts`) completes.
   * Seeding hashes the owner's password (async, argon2id), so
   * `createRouteDeps()`/`createSiteRouteDeps()` return without waiting on it by kicking
   * the seed off immediately and handing back this promise; auth-adjacent
   * middleware/routes `await` it before touching identity repos, so
   * correctness never depends on request timing (no race).
   */
  identityReady: Promise<void>;
  /** SPEC-006 0.6.0 (REQ-11/REQ-15) — resolves to the seeded owner's principal id; see
   * `identity/wiring.ts`'s `IdentityRouteDepsSlice.ownerPrincipalId` doc for the full rationale. */
  ownerPrincipalId: Promise<UUID>;
  /**
   * Resolves once the opt-in boot password reset (`TOVU_ADMIN_RESET_PASSWORD`) has finished — or
   * at once when it is not configured. Never rejects: a failed reset logs `[admin-password-reset]
   * FAILED` and leaves the old password in place. Fire-and-forget like `identityReady`; no route
   * gates on it. Optional: only the real SQLite composition (`server/runtime/composition/deps.ts`)
   * wires it, so a boot test can await the reset before logging in with the new password.
   */
  adminPasswordResetReady?: Promise<void>;
  /**
   * Bound closure over `identity.authorize()` + its repos (ADR-006/ADR-021 §2:
   * `authorize()` itself is ordinary core code, not a port — this field exists
   * so `core/commands` can call it without importing the `identity` library;
   * see `AuthorizeFn`'s doc in `core/commands/command.ts`).
   */
  authorize: AuthorizeFn;
  workspaceId: UUID;
}

/**
 * Media asset/blob/transform ports (ADR-027). Mixed-domain consumers pick only the
 * fields they need rather than inheriting the entire group.
 */
export interface MediaDeps {
  /**
   * Media persistence (ADR-027): the bespoke `MediaRecord` repo is not a frozen ADR
   * port. `assetBlobRepo`/`assetRenditionRepo` are core-owned sidecars (ADR-027 §2);
   * `blobStore` implements the ADR-027 §1 blob-store contract. The media module's
   * INFO.md owns scope disclosures for GC and origin isolation.
   */
  mediaRepo: VersionedMediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  blobStore: BlobStorePort;
  /**
   * The blob content-type side port (`media/content-type-store.ts`) — what the admin Media
   * screen's "Images"/"Videos" tabs filter on. Separate from `assetBlobRepo` above even though
   * both address the same `asset_blobs` table, because `AssetBlobRecord` is `@jini-ai/cms`'s
   * frozen port type with no content-type field; see that module's header for the full rationale.
   */
  mediaContentTypeStore: MediaContentTypeStorePort;
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
   * Fire-and-forget, same shape as `IdentityDeps.identityReady`: resolves once
   * `hydrateBlobStoreFromSeed()` (`features/media/hydrate-blob-store-from-seed.ts`) has finished
   * topping up `blobStore` with any stock seed blob it was missing — the fix for the production
   * incident where `content.seed.db` shipped real `media`/`asset_blobs` rows but no deploy path
   * ever shipped the bytes those rows' `storage_key`s point at. Optional (unlike `identityReady`):
   * only `server/deps.ts`'s real SQLite composition wires this — the in-memory hermetic composition
   * (`server/app.ts`'s `createRouteDeps()`) has no seed payload to hydrate from and leaves it unset,
   * exactly as `mediaTransformReady` is left un-exposed there for the same reason. No route gates on
   * this; it exists so a boot-integration test can await deterministic completion instead of racing
   * a fire-and-forget background copy.
   */
  blobHydrationReady?: Promise<HydrateBlobStoreFromSeedResult | undefined>;
  /**
   * Resolves once the composition root's detached boot tail has finished: the legacy trashed-widget
   * adoption and, on the owner process, `copyLegacyPublishCredentialsAtBoot` (legacy
   * `publish_credential_sets` rows moved into `vendor_credential_sets`). Never rejects; both steps log
   * their own failures. Optional like `blobHydrationReady`: only the real SQLite composition
   * (`server/runtime/composition/deps.ts`) wires it. No route gates on it; it lets a boot test (or
   * anything closing the store) await that tail instead of deleting the site directory under it (F1833).
   */
  legacyPublishCredentialsReady?: Promise<void>;
  /**
   * The boot passes {@link RouteDeps.createSiteApp} started that have not settled yet (`createApp`'s
   * BYOK tool-registration pass, `CreateAppOptions.onBootWork`); each leaves the set once it
   * settles. A caller that closes the store after calling `createSiteApp()` (the `tovu export`
   * command) awaits these, bounded, first, or a short export closes the store beneath its own pass.
   * Optional like `legacyPublishCredentialsReady`: only the real composition wires it.
   */
  siteAppBootWork?: ReadonlySet<Promise<void>>;
}

/**
 * ADR-058 credential repositories and shared sealing capabilities. Credential-CRUD
 * routes receive their own repo plus the shared sealer/keyring, never the other credential
 * repositories; inheriting the whole group would widen their secret-adjacent surface.
 */
export interface CredentialsDeps {
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
   * `keyring.activeKey()` directly, to know which site-key generation to stamp into a freshly-sealed
   * row. Deliberately its OWN `EnvOrFileKeyring` instance in the real composition root
   * (`server/deps.ts`), constructed `{allowFileFallback:false}`, independent of the shared instance
   * webhook signing/newsletter tokens use — see ADR-058 §2 for why that asymmetry is intentional.
   */
  siteAssistantSecretKeyring: KeyringPort;
  /**
   * Where this site's database copies go (`features/database-transfer`): the address sealed under the
   * SAME `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` above, in
   * `database_transfer_destinations`, so it survives a restart. Optional: a composition without a
   * database (route tests) leaves it out and the tools fall back to an in-memory store.
   */
  databaseTransferDestinationStore?: DatabaseDestinationStorePort;
  /** Online capture from the same chat kernel the running root owns; hermetic roots omit it. */
  databaseTransferChatSnapshot?: () => Promise<Buffer>;
  /**
   * The ADMIN's own encrypted BYOK credential store — one row per `(workspaceId, principalId)`,
   * backing `modules/assistant-byok.ts`'s `createStoredExecutionCredentialPort` and the
   * GET/PUT/DELETE `.../assistant/execution-credential` routes. NOT `siteAssistantCredentialRepo`
   * above (that one is per-workspace and backs the public visitor assistant). Sealed via the SAME
   * `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above — see
   * `db/schema.sqlite.ts`'s `adminExecutionCredentials` header for why one shared sealing capability is
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
  /** Runtime-owned connections declared by the desktop host, independent of labels. */
  builtInExternalMcpServerIds?: readonly string[];
  /**
   * G3 "Always allow" approvals for external tools (`external_mcp_tool_approvals`, migration 0077):
   * one row per site + connection + remote tool, beside the connection's row and deleted with it.
   * Listed and revoked on the Integrations page. Optional: a composition without it never offers
   * "Always allow".
   */
  externalMcpToolApprovalRepo?: ExternalMcpToolApprovalRepoPort;
  /**
   * G3 "Allow for this chat" approvals, kept with the conversation in `chat.db` so they survive a
   * restart. Optional: a composition without it never offers "Allow for this chat".
   */
  conversationToolApprovals?: ConversationToolApprovalStore;
  /** Native escalation grants use the same conversation-owned store and trusted plugin identity. */
  nativeApprovalMemory?: RememberedApprovalPort;
  approvalIdentityForRun?: SettingsToolDeps["approvalIdentityForRun"];
  /**
   * The OAuth subsystem for `authMode: "oauth"` external MCP connections
   * (`assistant/external-mcp-oauth.ts`), or absent.
   *
   * OPTIONAL. Not because the state it holds is process-bound (see
   * `externalMcpOAuthPending`/`externalMcpOAuthDevices` below for why that claim used to be here and
   * was wrong) — a caller with no persistent `content.db` to attach a real store to, or a narrow test
   * double that has no reason to wire OAuth at all, may still leave this unset, and
   * `modules/external-mcp.ts` then registers no OAuth routes: an unauthenticated public callback
   * endpoint that can complete nothing should not exist.
   */
  externalMcpOAuth?: ExternalMcpOAuthService;
  /**
   * The pending-authorization / device-authorization stores `externalMcpOAuth` above is built from —
   * exposed as their OWN fields, alongside the service, rather than only living inside it.
   *
   * Why: `agent-daemon-server.ts` builds its OWN, second `ExternalMcpOAuthService` instance (its own
   * header explains why — the refresh/reportAuthFailure half of the service needs to run in that
   * process too), and that second instance needs the SAME `pending`/`devices` stores this one uses,
   * not a second pair pointed at the same table through a second, independently-opened `content.db`
   * handle (which would re-run that file's `migrate()` a second time per boot — the exact hazard
   * `toolAttemptAuditSink`'s own doc on this interface already argues against reintroducing). Built
   * ONCE per composition root and threaded through both instances instead.
   *
   * These are what actually make `beginConnect`/`completeAuthorizationCallback`/
   * `pollDeviceAuthorization` work across processes: `composition/deps.ts`'s `createSiteRouteDeps`
   * backs them with `platform/db/sqlite/oauth-pending-store.sqlite.ts`'s `content.db`-backed
   * adapters, so a handshake begun in the agent daemon (`external_mcp_oauth_connect` is an assistant
   * tool — it runs there) can be completed by the public callback route running in the main web
   * server. `composition/app.ts`'s hermetic root, which owns no `content.db` at all, backs them with
   * the in-memory adapters instead — correct whenever that root's `RouteDeps` live in ONE process
   * (which is all a narrow test double needs), but NOT a cross-process guarantee: under
   * `TOVU_DB=memory` both `src/index.ts` and `agent-daemon-server.ts` call that root in their OWN
   * process, so a chat-initiated authorization_code `external_mcp_oauth_connect` begun in the daemon
   * and redeemed by the main server's public callback fails `OAUTH_INVALID_STATE`. That is the same
   * per-process isolation `agent-daemon-server.ts`'s header already discloses for memory mode.
   * Admin-initiated connects (begin and callback both in the main server) and the `device_code`
   * grant (begin and poll both in the daemon) are unaffected.
   *
   * OPTIONAL for the same structural reason `externalMcpOAuth` is: a narrower test double that never
   * sets these gets no fallback rather than a broken build. A caller reading them without a
   * composition root's guarantee that they are set (`agent-daemon-server.ts`, notably) falls back to
   * building its own in-memory pair rather than crashing.
   */
  externalMcpOAuthPending?: PendingAuthorizationStore;
  externalMcpOAuthDevices?: DeviceAuthorizationStore;
  /**
   * This process's own best-effort public origin (`"https://localhost:3000"`-shaped) — the scheme
   * from whether THIS process terminates TLS itself (`server/runtime/boot/dev-tls.ts`) and the port
   * from `PORT`, host assumed `localhost` since a composition root has no live client request to
   * read a `Host` header from. Computed once per boot by both composition roots
   * (`server/runtime/composition/{deps,app}.ts`), mirroring the identical `devCapabilityScheme`
   * derivation already there.
   *
   * FALLBACK ONLY, and optional for the same reason `externalMcpOAuth` above is: a caller that never
   * sets it (a narrower test double, say) just gets no fallback rather than a broken build.
   * `features/external-mcp/tool-registrations.ts`'s `resolveExternalMcpOAuthRedirectUri` is the one
   * reader today — `TOVU_PUBLIC_URL`, when configured, always wins over this (a real deployment
   * behind a proxy or custom domain needs that override to keep working; this field only fills the
   * gap for the chat tool call that has no live request of its own to derive an origin from, the
   * identical gap `resolvePublicOrigin(req)` closes for the admin HTTP route). 2026-09-10: closes the
   * defect where a non-technical user's OAuth connect refused outright just because nobody had set an
   * env var.
   */
  derivedPublicOrigin?: string;
  /**
   * 2026-08-15 — the `source_control_credential_sets` repo backing the admin Source Control page's
   * connect/replace form (`routes/admin/system/source-control-credentials.ts`). Real
   * `SqliteSourceControlCredentialSetRepo` in `server/deps.ts`; `InMemorySourceControlCredentialSetRepo`
   * in `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
   * via the SAME shared `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above — one
   * sealing capability app-wide. A deliberately SEPARATE table from the publish credentials in
   * `vendorCredentialSetRepo` below, not a widened `PublishProviderId` union — see `src/platform/db/schema.sqlite.ts`'s `sourceControlCredentialSets` doc comment for
   * why.
   */
  sourceControlCredentialSetRepo: SourceControlCredentialSetRepoPort;
  /**
   * 2026-08-16 (Phase 3) — the `vendor_credential_sets` repo backing the unified vendor-scoped
   * credential redesign (`features/vendor-credentials/`; `db/schema.sqlite.ts`'s `vendorCredentialSets`
   * doc has the full "destination vs. vendor" reasoning). Real `SqliteVendorCredentialSetRepo`
   * (`db/sqlite/vendor-credential-repo.sqlite.ts`) in `server/deps.ts`;
   * `InMemoryVendorCredentialSetRepo` in `server/app.ts`'s hermetic composition, same rule-of-two
   * every other repo here follows. Sealed via the SAME shared `siteAssistantSecretSealer`/
   * `siteAssistantSecretKeyring` instances above — one sealing capability app-wide, same reasoning
   * `sourceControlCredentialSetRepo` already establishes.
   *
   * Since 2026-09-29 this is where publish credentials live (`deployments/publish-credentials/store.ts`
   * reads and writes them here, by each deploy host's declared vendor); the legacy
   * `publish_credential_sets` rows are copied in at boot (`vendor-table-backfill.ts`) and no longer
   * read. Source-control credentials still live in `sourceControlCredentialSetRepo`.
   */
  vendorCredentialSetRepo: VendorCredentialSetRepoPort;
  /**
   * 2026-08-17 — the `custom_credential_sets` repo backing the admin Access Tokens page's
   * "Add custom provider" form (`routes/admin/system/custom-credentials.ts`). Real
   * `SqliteCustomCredentialSetRepo` in `server/deps.ts`; `InMemoryCustomCredentialSetRepo` in
   * `server/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
   * via the SAME shared `siteAssistantSecretSealer`/`siteAssistantSecretKeyring` instances above —
   * one sealing capability app-wide, same reasoning `sourceControlCredentialSetRepo` already
   * establishes. A deliberately separate table from both of
   * those and from `vendorCredentialSetRepo` — see `src/platform/db/schema.sqlite.ts`'s `customCredentialSets` doc
   * comment for why (no fixed provider-id catalog to join either union, or the vendor table's own
   * vendor-keyed model).
   */
  customCredentialSetRepo: CustomCredentialSetRepoPort;
  /**
   * The guarded outbound-HTTP seam (ADR-038) backing `features/custom-credentials`'s two agent
   * tools (`custom_credential_verify`/`custom_credential_make_request`,
   * `features/custom-credentials/tool-registrations.ts`) — an authenticated call through a saved
   * custom credential (e.g. "name.com", "fly.io") to its own operator-typed `baseUrl`. A genuinely
   * separate `HttpClientPort` instance from `server/runtime/composition/deps.ts`'s own local mailer
   * client (that one is a private local, never stored on `RouteDeps`, since only
   * `createResolvedMailer` ever needed it) — this one is stored here because the new registry-style
   * tool-contribution seam (`contribute<Domain>Tools()`) receives the SAME shared `RouteDeps` object
   * for every domain, so a domain's own `ToolDeps` interface can only pick up a field that genuinely
   * lives on this bag. Built from `platform/http/egress-policies.ts`'s own
   * `CUSTOM_CREDENTIALS_EGRESS_POLICY` (2026-09-10) — until then this shared the mailer client's
   * `SINGLE_HOP_HTTPS_EGRESS_POLICY`, but a live GitHub-Actions-log-diagnosis incident showed a
   * fixed-method, zero-redirect policy does not fit this domain: GitHub's own Actions job-logs
   * endpoint answers with a 302 to a signed Azure Blob Storage URL, and a `custom_credential_make_request`
   * GET could not follow it. See that policy's own doc for the full redirect-safety argument (GET
   * only, every hop re-verified, auth stripped cross-origin, no allowlist widening needed) — see
   * `features/custom-credentials/credentialed-request.ts`'s own header for why every outbound call
   * here needs the SSRF-guarded client rather than raw `fetch` (the target host is an arbitrary,
   * operator-typed `baseUrl`, not a small set of hardcoded, reviewed provider URLs).
   */
  customCredentialsHttpClient: HttpClientPort;
  /** `site_backup_push`'s client: `SITE_BACKUP_EGRESS_POLICY` (2-minute idle ceiling for large blob
   *  uploads). Absent (the in-memory runtime), the backup uses {@link customCredentialsHttpClient}. */
  siteBackupHttpClient?: HttpClientPort;
  /** Deploy observation requests must not follow vendor redirects, even to another public host. */
  deployOpsHttpClient?: HttpClientPort;
  /**
   * The guarded `HttpClientPort` backing `features/media-import`'s `media_import_from_url` — the
   * assistant handing the server a URL and the server fetching it, which is the textbook SSRF sink
   * and the reason this must never be a raw `fetch`.
   *
   * A THIRD instance rather than a reuse of `customCredentialsHttpClient` above, because it is built
   * from a different `EgressPolicy`: `platform/http/egress-policies.ts`'s
   * `MEDIA_IMPORT_EGRESS_POLICY`, which follows (and fully re-verifies) up to three redirects, allows
   * a file-sized response, and waits a download's worth of time — none of which
   * `SINGLE_HOP_HTTPS_EGRESS_POLICY` does or should. Sharing one client would mean one of the two
   * call shapes gets the wrong policy; see that policy's own doc for the per-axis reasoning.
   *
   * Stored on this bag for the same reason `customCredentialsHttpClient` is: the registry-style
   * tool-contribution seam (`contribute<Domain>Tools()`) hands the SAME shared `RouteDeps` object to
   * every domain, so a domain's own `ToolDeps` interface can only pick up a field that genuinely
   * lives here.
   */
  mediaImportHttpClient: HttpClientPort;
  /**
   * HARNESS ONLY (`CreateSiteRouteDepsOverrides.outboundTestOrigins`): exact loopback origins the
   * assistant's URL tools may reach. Absent in every production composition.
   */
  outboundTestOrigins?: readonly string[];
  /** Canonical guard for media generation and all returned-asset downloads; private peers refused. */
  mediaGenerationHttpClient: import("@jini-ai/core/primitives").HttpClientPort;
}

/**
 * Content-model persistence ports (ADR-022/ADR-043/ADR-044). The core-owned
 * `entryRefsRepo` belongs here as a content-model persistence seam, not with widgets.
 * Mixed-domain routes pick only the fields they need. Structural widget dependencies
 * avoid a back-edge into the composition root; importing this group would reopen it.
 */
export interface ContentTaxonomyDeps {
  /**
   * ADR-022/ADR-043 content-type registry write repo plus its listing capability
   * (`features/content-types/list.ts`).
   */
  contentTypeRepo: ContentTypeRepoPort & ContentTypeListPort;
  /**
   * Both roots use `NoopContentTypeIndexProvisioner`: row persistence does not
   * implement ADR-022 §3 expression-index DDL provisioning.
   */
  contentTypeIndexProvisioner: IndexProvisionerPort & TeardownIndexProvisionerPort;
  /**
   * ADR-022/ADR-043 entries write repo with admin listing, bounded published-entry
   * display reads, excluding-types lists and trash-inclusive publish reads. Entry writes
   * accept `contentTypeRepo` structurally because `ContentTypeRecord` is a superset of
   * `OwningContentType`. Both roots implement the read capabilities directly.
   */
  entryRepo: EntryRepoPort & EntryListPort & EntryDisplayListPort & EntryListExcludingTypesPort & EntryPublishReadPort;
  /** ADR-044 taxonomy/term/assignment/revision write repos with listing capabilities.
   * Gated merge uses `gatedMutations.gatewayDeps` from `DatabaseOpsDeps`.
   */
  /** Widened again for the `deleteTaxonomy`/`deleteTerm` guarded-delete routes with
   * `DeletableTaxonomyRepoPort`/`DeletableTermRepoPort` (`@jini-ai/cms/taxonomy`'s additive
   * delete capability — see that package's `write-service.ts` for why these are additive
   * interfaces rather than folded into the certified `TaxonomyRepoPort`/`TermRepoPort`).
   * `TransactionalRepoPort` supplies the guard-and-cascade atomicity `deleteTerm`/`deleteTaxonomy` need, sourced from
   * whichever one repo instance the route wires up as `deps.transaction` — `taxonomyRepo` is the
   * one both delete flows always have, so it is the canonical source. */
  /** Widened once more with `TaxonomyTrashReadPort` (`findForTrash`, a host-only addition — see
   *  `EntryTermReadPort`'s doc above for why these are declared directly against `repo.sqlite.js`/
   *  `trash-term.js` rather than folded into a certified Jini port) for `trashTaxonomy`'s read. */
  /** Widened for publish-content (`features/taxonomy/publish-content.ts`) with the id-preserving
   *  import's `ImportableTaxonomyRepoPort` and the trash-inclusive `TaxonomyPublishReadPort`. */
  taxonomyRepo: TaxonomyRepoPort & TaxonomyListPort & DeletableTaxonomyRepoPort & TransactionalRepoPort & TaxonomyTrashReadPort & ImportableTaxonomyRepoPort & TaxonomyPublishReadPort;
  /** Widened once more with `TermTrashReadPort` (`findForTrash`) for `trashTerm`'s read — same
   *  host-only-addition reasoning as `taxonomyRepo` above. */
  /** Widened for publish-content the same way as `taxonomyRepo`. */
  termRepo: TermRepoPort & TermListPort & DeletableTermRepoPort & TermTrashReadPort & ImportableTermRepoPort & TermPublishReadPort;
  /** Bound at composition to the generic trash pipeline (T6, trash parallel plan §2, owner
   *  decision 5) — `RemoveTermFn` is WIDE (carries `"blocked"`, the `TERM_HAS_CHILDREN` blocker);
   *  `RemoveTaxonomyFn` is narrowed, same reasoning as `removeWidget`/`removeMenu` elsewhere in
   *  this file. */
  removeTerm: RemoveTermFn;
  removeTaxonomy: RemoveTaxonomyFn;
  /**
   * Assignment persistence with by-term enumeration for gated merge, counts for
   * guarded taxonomy/term deletion, unassignment, and publish-content term-id reads.
   * Both roots wire `SqliteEntryTermRepo`, which implements these capabilities.
   */
  entryTermRepo: EntryTermRepoPort & MergeableEntryTermRepoPort & AssignmentCountEntryTermRepoPort & UnassignableEntryTermRepoPort & EntryTermReadPort;
  /**
   * Optional public-render read port for terms assigned to a post/page. The real
   * root shares its `SqliteEntryTermRepo` instance with `entryTermRepo`; the hermetic
   * composition leaves this slot unset. Consumers degrade to no terms rather than
   * throwing; see `resolveAssignedTermsForRender`.
   */
  entryTermReadRepo?: EntryTermReadPort;
  taxonomyRevisionRepo: TaxonomyRevisionRepoPort;
  /**
   * SPEC-043/ADR-022 §5 (`entry_refs`) — the reference-integrity index's persistence seam
   * (`core/entry-refs/ports.ts`'s `EntryRefsRepoPort`). Schema-owned by `core`, first populated by
   * `widgets` (the region-area/write-service chokepoint hooks) — consumed here by the admin
   * `widgets` routes for the REQ-34 where-used disclosure and the REQ-42 safe-delete check.
   */
  entryRefsRepo: EntryRefsRepoPort;
}

/**
 * Comments plugin backend (ADR-031/ADR-023, SPEC-033). Admin moderation picks its
 * required fields; public submission and tool contracts remain structural to avoid
 * a back-edge into the composition root.
 */
export interface CommentsDeps {
  /** ADR-031/ADR-023 (SPEC-033) — the Comments bundled plugin's composed backend
   * (`Jini/packages/cms/src/comments/module.ts#createCommentsModule`). */
  commentRepo: CommentRepoPort;
  commentIngressPolicy: CommentIngressPolicy;
  commentWriteService: CommentWriteService;
  /** Fire-and-forget at boot (mirrors `newsletterReady`) — await (or, for the real server, go
   * through the ADR-046 Phase 2 boot lifecycle) before relying on the comments plugin tables
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

/**
 * Member ports (ADR-030). The public sign-in contract remains structural, without
 * admin authorization/session fields (ADR-030 §3), to keep it decoupled from the
 * admin composition root.
 */
export interface MembersDeps {
  /** `members` library ports (ADR-030) — Members admin screen. */
  memberRepo: MemberRepoPort;
  memberTierRepo: MemberTierRepoPort;
  memberSubscriptionRepo: MemberSubscriptionRepoPort;
  memberSessionRepo: MemberSessionRepoPort;
  magicLinkRepo: MagicLinkTokenRepoPort;
  mailer: MailerPort;
  /** Refreshes and settles lazy mail configuration without sending; keeps tool responses
   * independent of whether a member is disabled and therefore skips send(). */
  settleMailer?: () => Promise<void>;
}

/**
 * Database recovery read/capture ports (ADR-041/ADR-045). Gated-mutation gateway
 * and boot/introspection operations have separate ownership in `DatabaseOpsDeps`;
 * consumers pick any additional operation ports they need.
 */
export interface DatabaseRecoveryDeps {
  /** ADR-041 §1/§2 timeline read, gated-operation append and boot interrupted-row ports.
   * Real persistence is the `ops/database-journal.db` sidecar; the hermetic root uses
   * `InMemoryDatabaseLedgerRepo`. Migration/recovery hooks append audit rows through
   * the same instance and boot reconciliation records interrupted operations.
   */
  databaseLedgerRepo: LedgerReadPort & LedgerAppendPort & BootLedgerPort;
  /**
   * ADR-041 §2/§4 restore-point list/save and AC-11 idempotency-key lookup. The real
   * root uses the SQLite repo; the hermetic root supplies its in-memory counterpart.
   */
  restorePointsRepo: RestorePointListPort & RestorePointSavePort & RestorePointIdempotencyLookupPort;
  /**
   * SPEC-016 C-007 dialect-neutral restore-point capture capability. The real root
   * supplies the SQLite adapter; the hermetic root a deterministic in-memory adapter.
   */
  dbOps: DbOpsPort;
  /**
   * ADR-041 §3/§10 serving status (`SERVING`, `PENDING_MIGRATION`,
   * `BLOCKED_PENDING_RECOVERY`), initially `SERVING` in both compositions. Boot
   * reconciliation updates it before the serving/export gates rely on it.
   */
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
}

/**
 * Webhook subscription/delivery persistence (ADR-036). `originRegistry` belongs to
 * redirects/origin infrastructure and is picked separately by integrations routes.
 * `webhookSigner` stays separate because the admin CRUD routes do not consume it.
 */
export interface WebhooksDeps {
  /** ADR-036 `webhook_subscriptions` persistence. */
  webhookSubscriptionRepo: WebhookSubscriptionRepoPort;
  /** ADR-036 `webhook_deliveries` persistence. */
  webhookDeliveryRepo: WebhookDeliveryRepoPort;
}

/**
 * Forms write ports (SPEC-010/ADR-PIPE-010). The public submission rate limiter
 * stays separate from session-gated admin CRUD. Public submission dependencies remain
 * structural to avoid a back-edge into the composition root.
 */
export interface FormsDeps {
  executeCommand: typeof import("@jini-ai/cms/core").executeCommand;
  formDefinitionRepo: FormDefinitionRepoPort;
  formSubmissionRepo: FormSubmissionRepoPort;
  /** Moves a submission to the Trash — `bindRemoveEntity(trash, "form_submission")` at composition. */
  removeFormSubmission: RemoveFormSubmissionFn;
}

/**
 * Post write chokepoint and its HTML/search side ports. Consumers select the subset
 * they need; shared ownership follows the post domain rather than a whole-group caller.
 */
export interface PostDeps {
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
   * SPEC-009 REQ-15 — routing's slug-change slot lookup (`getSlugChangeCapture`), handed to every
   * `updatePost` call a route or agent tool makes so a published entry's rename leaves a 301 from
   * its old URL. See `UpdatePostDeps.slugChangeCapture` for why it is a lookup, not the capture.
   */
  slugChangeCapture: SlugChangeCaptureLookup;
}

/**
 * Presentation settings and the discovered theme roster/root, shared by content routes.
 */
export interface PresentationDeps {
  presentationRepo: PresentationSettingsRepoPort;
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
  /**
   * Design C (ADS-memory w4-theme-lifecycle-designs.md §5 / w6 dispatch, 2026-09-16) — the package's
   * own read-only stock themes root (`server/deps.ts`'s `builtInThemesDir()`), NOT `themesDir` above
   * (which is the SITE's own themes root in every real boot path except the hermetic one). Threaded
   * through so `features/theme/theme-files.ts`'s `resolveThemeOriginalSource` can fall back to the
   * package's own generated catalog (Design D, `sync-originals.ts`) when an already-seeded site has
   * no catalog original of its own for a theme — closing that gap for the seven shipped themes that
   * never had a hand-maintained original, without writing anything into the site.
   *
   * Optional and deliberately NOT backfilled onto every existing `RouteDeps` fixture: only the
   * SQLite composition root and the CLI install-dir boot supply it (both already call
   * `builtInThemesDir()` for `seedSiteThemes()`); every hand-built `RouteDeps`/`ContentRouteDeps`/
   * `ThemeToolDeps` test object and the hermetic in-memory composition root predate this field and
   * are unaffected — `resolveThemeOriginalSource` treats `undefined` as "no package fallback
   * configured," never as an error.
   */
  packageThemesDir?: string;
}

/**
 * Settings ledger and its boot-registration chain. Registrations share one SQLite
 * connection and run sequentially; consumers pick their own ledger/readiness subset.
 */
export interface SettingsDeps {
  /**
   * SPEC-007 settings ledger repo. Command reverters read it through `revert.ts`
   * (ADR-PIPE-007 Migration Safety), and admin settings routes use the same ledger.
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
   * Settings readiness barrier, preserving `identityReady`'s fire-and-forget shape so
   * composition roots stay synchronous and consumers can await readiness.
   * Roots resolve this immediately.
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
  /** Host policy/ports for the sole Jini SEO evaluator; shared by routes, tools and head. */
  seoDeps: SeoHostBindings;
  /** Per composed app, workspace-keyed cache/hooks/expiry; all invalidators use this instance. */
  sitemapService: ReturnType<typeof createSitemapService>;
  /**
   * Resolves once the one-time `ensurePublicAssistantSettingDefinitions()` boot call registers the
   * `site.assistant.public_enabled` definition. Same shape and same convention as `seoReady` above,
   * and chained after it in both composition roots for the reason `seoReady`'s own comment in
   * `app.ts` gives: concurrent openers of the settings write chokepoint's transaction throw on the
   * SQLite root. The 2 admin assistant-settings routes await this before reading `settingsRepo`.
   */
  assistantSettingsReady: Promise<void>;
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
}

/**
 * Command-gateway change-set store and inverse-applier registry. Reverters are
 * bound by the composition root to the same repo/clock/outbox instances as the gateway.
 */
export interface ChangeSetDeps {
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
}

/**
 * Outbox and event bus consumed together by content and workspace outbox drains.
 */
export interface EventBusDeps {
  outbox: OutboxPort;
  bus: EventBusPort;
}

/**
 * Constitution Article VIII observability seam. Routes and modules receive only
 * `ObservabilityPort`, never a concrete adapter; see `platform/observability/ports.ts`.
 * The hermetic root supplies the no-op adapter and the real root the env-driven adapter.
 */
export interface ObservabilityDeps {
  observability: ObservabilityPort;
  /**
   * `features/tool-audit`'s durable agent tool-attempt sink, BUILT BY THE COMPOSITION ROOT and
   * injected — not resolved by whichever module happens to want one. `server/deps.ts` builds
   * `new SqliteToolAttemptAuditSink(db)` over the SAME open `ContentDb` handle its other repos
   * already share; `server/app.ts`'s hermetic composition builds `createInMemoryToolAttemptAuditSink()`.
   * `modules/assistant-byok.ts` is the consumer. `agent-daemon-server.ts` is its own composition
   * root and reads this same field off the `RouteDeps` it already builds, so there is exactly one
   * construction per root rather than a hand-written copy per consumer.
   *
   * A sink port rather than a database path: opening a handle calls `migrate()`, so a
   * consumer must not open a second database merely to construct itself. The hermetic
   * root has no content database path; injection also permits a plain fake without
   * environment reads or a deferral wrapper.
   */
  toolAttemptAuditSink: ToolAttemptAuditSink;
}

/**
 * Public analytics ingest buffer, beacon configuration, and boot-registration barriers
 * (ADR-035/ADR-046), grouped by domain ownership.
 */
export interface AnalyticsDeps {
  /** Analytics ingest buffer (ADR-035 ingest-only stage; no rollup yet). ADR-046 Phase 1: durable
   * in real composition (`SqliteBufferSink`), in-memory in hermetic composition (Jini LocalBufferSink via the host adapter). */
  analyticsSink: AnalyticsSinkPort;
  /**
   * Public beacon configuration (`analytics/config.settings.ts`'s
   * `createSettingsAnalyticsConfig`), backed by the `core.analytics.*` ledger definitions
   * in both composition roots.
   */
  analyticsConfig: AnalyticsConfigPort;
  /**
   * Resolves once the one-time `ensureAnalyticsSettingDefinitions()` boot call registers the 6
   * `core.analytics.*` setting definitions backing `analyticsConfig`. Same shape/convention as
   * `settingsUiTabsReady`, chained after it in both composition roots for the identical
   * single-SQLite-connection-transaction reason every registration above documents.
   */
  analyticsSettingsReady: Promise<void>;
  /**
   * SPEC-050: resolves once `ensureSiteTitleSettingDefinition()` registers `core.site.title`, the
   * setting every public render reads through `resolveSiteTitle`, AND `preserveLegacySiteTitles()`
   * has pinned every workspace that existed before it. Chained after `analyticsSettingsReady` in both
   * composition roots for the same single-SQLite-connection transaction reason. `index.ts` and `serve`
   * await it before spawning the agent daemon, so the daemon's own boot never races the pin. A render
   * served before it settles never flips a pre-existing site: the resolver renders the legacy title
   * while that workspace's pin is pending (REQ-07).
   */
  siteTitleReady: Promise<void>;
  /** SPEC-050 (NC-3 = A): which workspaces existed before `core.site.title` and still wait for their pin. */
  siteTitlePreservationStore: SiteTitlePreservationStorePort;
  /**
   * SPEC-050 (NC-2 = B, REQ-13): `config.json` `name` of the served site directory, read at each
   * render that needs it, so a rename shows with no restart. Reads `undefined` when there is no site
   * directory (the title then falls back to `workspaces.name`).
   */
  siteDisplayName: SiteDisplayNameSource;
}

/**
 * Navigation-owned menu persistence and its ADR-029 derived binding index.
 * Consumers that only need menus pick `menuRepo` separately.
 */
export interface NavigationDeps {
  /** Local, navigation-owned menu repo (ADR-029; not a frozen ADR port). */
  menuRepo: MenuRepoPort;
  /** The one real ADR-029 port: the derived nav_location_bindings index. */
  navLocationBindingRepo: NavLocationBindingRepoPort;
  /** Bound at composition to the generic trash pipeline's `removeEntityWithoutBlocker` —
   *  `RemoveMenuFn`, not the broad `RemoveEntity`, same reasoning as `removeWidget` above. */
  removeMenu: RemoveMenuFn;
}

/**
 * Database operation ports shared by taxonomy gated mutations, migration/recovery
 * ceremonies, boot reconciliation, and introspection. Recovery read/capture ports
 * belong to `DatabaseRecoveryDeps`; consumers select their required subset.
 */
export interface DatabaseOpsDeps {
  /**
   * ADR-041/043/044/045 — the `migration_runs` read side required by
   * `reconcileInterruptedMigrationOnBoot`.
   */
  migrationRunsRepo: MigrationRunsRepoPort;
  /** R1b — the site's content kernel (the one open content database), for boot modules that
   * declare plugin tables on it (`store-plugin` in `runtime/boot/bootstrap.ts`) instead of opening
   * a second connection to the same file. Set only by `server/deps.ts`; `server/app.ts`'s hermetic
   * composition has no content database. */
  contentKernel?: ContentKernel;
  /** Bumps `database_write_watermark` for taxonomy writes (create/rename/assign/delete). Real in
   * `server/deps.ts` (`store-bound-services.ts`): the async kernel stamp on every dialect
   * (`platform/db/watermark-kernel.ts`), which Jini cms awaits; `noopStampWatermark` in `server/app.ts`'s in-memory composition,
   * which has no watermark table to advance. */
  stampWatermark: () => Promise<void> | void;
  /**
   * ADR-041 §3 read port for `database_get_health`, `database_get_schema_state`, and
   * `database_list_pending_migrations`. The real adapter reuses the same open content
   * database as recovery; the hermetic root supplies the in-memory adapter.
   */
  databaseIntrospection: DatabaseIntrospectionPort;
  /**
   * SPEC-016/ADR-041 §5 gated-mutation gateway. One process-lifetime `GatewayDeps`
   * with an in-process `InMemoryTokenStore` is shared by taxonomy merge, migrate-forward,
   * and recovery restore. See `core/gated-mutations/composition.ts` for the token-store decision.
   */
  gatedMutations: { gatewayDeps: GatewayDeps };
}

/**
 * Redirects/origin wiring (SPEC-009/ADR-PIPE-009). Integrations reuse
 * `originRegistry` through a separate pick; it remains owned by this domain.
 */
export interface RedirectsDeps {
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
}


/**
 * Widget-derived projection persistence (SPEC-043/ADR-047), separate from the
 * content-model `entryRefsRepo` in `ContentTaxonomyDeps`. Admin region CRUD and
 * public rendering share this projection.
 */
export interface WidgetsDeps {
  /**
   * SPEC-043/ADR-047 (widgets) — the `widget_region_bindings` derived-projection repo
   * (`Jini/packages/cms/src/widgets/ports.ts`'s `WidgetRegionBindingRepoPort`, mirroring `NavLocationBindingRepoPort`
   * exactly). Consumed by both the admin `widgets` routes (region CRUD) and the public site-render
   * path (`routes/site/pages.ts` → `resolvePageWidgets`, W-004).
   */
  widgetBindingRepo: WidgetRegionBindingRepoPort;
}

/**
 * Plugin activation and pre-bound lifecycle callbacks share one process-lifetime
 * hook registry. `pluginBeforeSaveHook` belongs here because it is a lifecycle hook,
 * not a content-model repo.
 */
export interface PluginRuntimeDeps {
  pluginInstaller?: import("@jini-ai/plugins/host/node").PluginInstallerPort;
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
  /** 2026-10-04 — every discovered plugin with a name conflict (see `Jini/packages/plugins/src/host/
   * plugin-claims.ts`), for `PLUGINS_LIST`/`plugins_list`. Optional so hand-built test deps need not
   * supply it; absent ⇒ every plugin is listed with `conflicts: []`. */
  listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  removePlugin: RemovePluginFn;
  /** 2026-10-08 — moves a whole theme folder to the Trash (`theme_trash`). Bound at the composition
   * root over the `theme` directory adapter (`features/theme/theme-trash.ts`), wrapped so a failed
   * Trash-row write moves the folder back — same shape as {@link removePlugin}. */
  removeTheme: RemoveEntity;
  /** 2026-09-13 — pre-bound, read-only, bounded listing of one discovered plugin's own files
   * (`PLUGIN_FILES`). Path safety lives in the binding (`plugin-runtime.ts`) and
   * `Jini/packages/plugins/src/host/node/package-files.ts`; the route only authorizes and resolves the record. */
  readPluginPackageFiles: (record: PluginDiscoveryRecord) => Promise<PluginPackageFiles>;
  /** AW-7 Tier 2 (2026-10-04) — the same process-lifetime hook registry's preview: ONE attached
   * plugin's beforeSave patch for a draft, nothing saved or counted toward quarantine; `null` ⇒ not
   * attached in this process. Read by `PLUGIN_PREVIEW` (`routes/plugins/preview.ts`) and, in the
   * agent daemon, by tier-2 capability tools for a fresh result (`capability-tool-registrations.ts`). */
  previewPluginBeforeSave: PluginBeforeSavePreview;
  /** The same process-lifetime hook registry's content-facing port. */
  pluginBeforeSaveHook: BeforeSaveHookPort;
  /** Fire-and-forget at boot (mirrors `commentsReady`) — resolves once every plugin durably marked
   * `enabled` has been re-attached to THIS process's hook registry (P0a fix: a fresh process starts
   * with an empty in-memory registry, so a plugin enabled before a restart would otherwise silently
   * stop firing until an operator re-toggled it). Await (or, for the real server, go through the
   * ADR-046 Phase 2 boot lifecycle) before relying on a previously-enabled plugin's hook running. */
  pluginRuntimeReady: Promise<void>;
}

/**
 * The destination's complete deny-store capability. Only composition code receives this writer;
 * `core.ts` narrows it to `list` before handing anything to the publishing request middleware.
 */
export interface PublishTrustRevocationDeps {
  publishTrustRevocations: PublishTrustRevocationPort;
}

/**
 * The local admin Trash (design: `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`).
 *
 * `trash` is the whole port, read by the Trash screen's own routes. The `remove*` fields are
 * the SAME service pre-bound to one entity type each, and they are what the delete paths receive —
 * a delete path takes exactly one of them and therefore cannot address another domain's entities by
 * passing the wrong string. Each performs the marker flip AND the Trash index write as one
 * transaction; there is deliberately no field here that does only half of it.
 *
 * Pre-bound per domain rather than a `removeFor(entityType)` lookup at the call site, because a
 * lookup puts a typo-able string in every route and defers a wiring mistake to runtime.
 */
export interface TrashDeps {
  trash: TrashPort;
  // `RemovePostFn`, not the broad `RemoveEntity`: `deletePost` (`features/post/post.ts`) declares its
  // own narrower structural type with no `"blocked"` branch (post has no `TrashBlockerSpec`, T1). The
  // composition root narrows `bindRemoveEntity`'s wider result to match (`features/trash`'s
  // `removeEntityWithoutBlocker`, used by `deps.ts`/`app.ts`) so this field's promise is actually kept.
  removePost: RemovePostFn;
  removeComment: RemoveEntity;
  // `RemoveMediaFn`, not the broad `RemoveEntity` — same reasoning as `removePost` above:
  // `media_trash_asset` (`features/media/tool-registrations.ts`) declares its own narrower
  // structural type with no `"blocked"` branch (media has no `TrashBlockerSpec`, T1).
  removeMedia: RemoveMediaFn;
  removeRedirect: RemoveEntity;
  // `RemoveWidgetFn`, not the broad `RemoveEntity` — same reasoning as `removePost` above:
  // `trashWidgetInstance` (`Jini/packages/cms/src/widgets/ports.ts`) declares its own narrower structural type
  // with no `"blocked"` branch (widget has no `TrashBlockerSpec`, T1).
  removeWidget: RemoveWidgetFn;
  /**
   * Media alone needs this pair: its ladder has a HUMAN hard-purge rung of its own
   * (`routes/media/delete.ts`, gated by `media.delete.force`) that removes the row outside the
   * Trash screen, so the index row has to be dropped with it. See {@link ForgetRemovedEntity}.
   */
  forgetRemovedMedia: ForgetRemovedEntity;
  /**
   * Posts need it for a different reason than media: nothing removes a post row outside the Trash
   * screen, but two paths UNDO a delete after its transaction has already committed — the command
   * gateway's `rollback` (the change-set record failed to persist) and `post/delete`'s
   * `EntityReverter` (an operator reverting the recorded change set). Either one that clears the
   * marker without this leaves a live, published post listed in the Trash and selectable for
   * permanent deletion. See {@link ForgetRemovedEntity}.
   */
  forgetRemovedPost: ForgetRemovedEntity;
  /**
   * One pass of the 60-day auto-purge backstop, pre-bound to this composition's repo and adapters.
   *
   * A function rather than the repo-plus-adapters the sweep needs, for the same reason the
   * `remove*` fields are pre-bound: `RouteDeps` is handed to every route, and a route that could
   * reach `TrashRepoPort` directly could delete an index row without touching the entity.
   * `server/runtime/composition/serving-app.ts` is the only caller — it owns the timer.
   */
  sweepTrash: TrashSweepOnce;
  /**
   * Whether this composition registered a Trash adapter for `entityType`: a read of the live adapter
   * map, on every call, never a list captured once. `trash_item` checks it before it touches
   * anything, so a model-supplied kind the Trash cannot hold is refused rather than trusted.
   *
   * A predicate rather than the map: the adapters carry `purge`, and nothing handed to every route
   * may reach a hard delete.
   */
  isTrashableEntityType: (entityType: string) => boolean;
  /**
   * `TRASHABLE`, built once at composition from the live schema module (`registry.ts`). Read by
   * `moveToTrash` (the generic `POST .../trash/items` route) and by `permissions.ts`'s
   * `trashPermissionFor`/`mayActOnEntityType`/`filterVisibleTrashItems`, which `list.ts`/`restore.ts`/
   * `purge.ts` already call with this same deps object — one field serves both concerns. Named to
   * match `TrashRouteDeps.registry` exactly, since `RouteDeps` is passed there unchanged.
   */
  registry: TrashRegistry;
  /** The dialect-neutral DB port `moveToTrash` reads the entity's live display/version through —
   *  same instance `deps.ts` used to build every registry-derived `TrashAdapter`. Named to match
   *  `TrashRouteDeps.db`. */
  db: TrashDb;
}

/**
 * App-wide composition dependency bag. Domain groups preserve cohesive ownership;
 * routes narrow their dependencies rather than taking unrelated ports. Singleton
 * capabilities stay flat. Fields whose types reference `RouteDeps` also stay flat:
 * putting them in a sub-interface creates a circular type TypeScript rejects.
 */
export type RouteDeps = ClockDeps & IdentityDeps & MediaDeps & CredentialsDeps & ContentTaxonomyDeps & CommentsDeps & MembersDeps & DatabaseRecoveryDeps & WebhooksDeps & FormsDeps & PostDeps & PresentationDeps & SettingsDeps & ChangeSetDeps & EventBusDeps & AnalyticsDeps & NavigationDeps & DatabaseOpsDeps & RedirectsDeps & WidgetsDeps & PluginRuntimeDeps & ObservabilityDeps & PublishTrustRevocationDeps & TrashDeps & {
  workspaceRepo: WorkspaceRepoPort;
  /**
   * Durable AI chat history, obtained per-principal.
   *
   * A factory rather than a store, because there is no such thing as "the" chat store — every
   * query must be filtered by who is asking. Composition closes over the `content.db` handle so
   * no route ever holds one, which is what makes an unscoped `WHERE id = ?` unwritable rather
   * than merely against convention. See `assistant/persistence/tenant-scope.ts`.
   */
  chatHistory: ChatStoreFactory;
  /**
   * How an assistant turn's run ENDS in chat history, over the same `chat.db` as `chatHistory`:
   * first terminal write wins per run, the server finalizer's settle, and the boot-time repair of
   * turns left `running` by a dead process. See `assistant/persistence/run-ledger.ts`.
   */
  chatRunLedger: ChatRunLedger;
  /**
   * Per-(conversation, agent) agent-CLI session id (`assistant_agent_sessions`, migration `0051`),
   * so `agent-daemon-server.ts`'s `onStarted` can resume the underlying CLI session across chat
   * turns instead of spawning cold every time. Unlike `chatHistory` this is not per-principal
   * scoped: the daemon process has no `ChatPrincipal` to scope by (it decodes only `principalId`
   * from `contextRef`), and a conversation's session id carries no content of its own to protect —
   * see `assistant/persistence/agent-session-store.ts`.
   */
  agentSessions: AgentSessionStore;
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
   * Public forms submission limiter (SPEC-010/ADR-PIPE-010), a single process-lifetime
   * `createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock })` instance so fixed-window
   * counters persist across requests. Admin form ports belong to `FormsDeps`.
   */
  formsRateLimiter: RateLimiter;
  /**
   * SPEC-046 REQ-7 — the public site assistant's own rate limiter, mirroring `formsRateLimiter`'s
   * shape exactly: a single, process-lifetime `createRateLimiter({ profile: SITE_ASSISTANT_PER_IP,
   * clock })` instance (not constructed per-request), keyed by `resolveClientIp(req)` in
   * `modules/site-assistant.ts`.
   */
  siteAssistantRateLimiter: RateLimiter;
  /**
   * Task 6 of the publish-content (Publish Content) feature (`ADS-memory/reports/
   * 2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 6) — staged-bundle storage for
   * `POST .../publish-content/bundles`, backing `publish_content_bundles` (migration `0066`).
   * Real `SqlitePublishContentBundleRepo` in `server/runtime/composition/deps.ts`'s
   * `createSiteRouteDeps()`; `InMemoryPublishContentBundleRepo` in `server/runtime/composition/
   * app.ts`'s hermetic `createRouteDeps()` — same rule-of-two every other repo here follows.
   */
  publishContentBundleRepo: PublishContentBundleRepoPort;
  /**
   * `publish-files-plan-2026-09-24.md` §3 — the process-wide address book a file-tree `pack()`
   * (today only `features/theme/publish-content.ts`'s theme walker) fills as it hashes files on
   * disk, so a blob that lives only on disk (never copied into the media blob store) can still be
   * served (`routes/publish-content/blob-get.ts`) and pushed (`routes/publish-content/
   * peer-transport.ts`) via `createCompositePeerBlobSource`. ONE `createFileBlobIndex()` instance
   * per composition root, held for the process lifetime like `publishContentBundleRepo` above —
   * never rebuilt per request, or a `pack()`'s fills would be invisible to the very next read.
   */
  fileBlobIndex: FileBlobIndexPort;
  /**
   * Task 7 of the publish-content (Publish Content) feature (`ADS-memory/reports/
   * 2026-09-18-publish-feature-implementation-plan.md` §2/§4 task 7) — per-peer sync memory for
   * `publish_content_baselines` (migration `0066`), read by `gated-hooks.ts`'s `planImport()`
   * wiring. Real `SqlitePublishContentBaselineRepo` in `server/runtime/composition/deps.ts`'s
   * `createSiteRouteDeps()`; `InMemoryPublishContentBaselineRepo` in `server/runtime/
   * composition/app.ts`'s hermetic `createRouteDeps()` — same rule-of-two every other repo here
   * follows.
   */
  publishContentBaselineRepo: PublishContentBaselineRepoPort;
  /**
   * Task 8 of the publish-content (Publish Content) feature — the real apply seam
   * (`gated-hooks.ts#PublishContentApplyPort`). Both composition roots bind
   * `createPublishContentApplyPort()`.
   */
  publishContentApplyPort: PublishContentApplyPort;
  /**
   * D1 (publish-types-plan §6) — this destination's seed-version lookup
   * (`features/publish-content/seed-hash.ts`): the hash an entity had in the stock
   * `content.seed.db` this instance was hydrated from. Passed to BOTH the import route's planner and
   * `publishContentApplyPort`'s apply-time re-verification, so they agree on what counts as
   * "untouched since seed". Real seed-backed lookup in `composition/deps.ts`;
   * `NO_PUBLISH_CONTENT_SEED_HASH` in the hermetic `composition/app.ts`, which ships no seed.
   */
  publishContentSeedHash: PublishContentSeedHashFn;
  /**
   * Task 8 of the publish-content (Publish Content) feature — the apply loop's audit trail
   * (`publish_content_runs`, migration `0066`). Exposed on `RouteDeps` (rather than only closed over
   * inside the `publishContentApplyPort` factory) because a test needs to read a run row back
   * directly — same rule-of-two both composition roots follow for every other repo here.
   */
  publishContentRunRepo: PublishContentRunRepoPort;
  /**
   * Task 10 of the publish-content (Publish Content) feature (`ADS-memory/reports/
   * 2026-09-18-publish-feature-implementation-plan.md` §4 task 10) — named remote Tovus this
   * workspace can push to or pull from (`publish_content_peers`), with their API keys sealed at
   * rest under the same shared ADR-058 sealer/keyring every other credential table here uses.
   * Real `SqlitePublishContentPeerRepo` in `server/runtime/composition/deps.ts`'s
   * `createSiteRouteDeps()`; `InMemoryPublishContentPeerRepo` in `server/runtime/composition/
   * app.ts`'s hermetic `createRouteDeps()` — same rule-of-two every other repo here follows.
   */
  publishContentPeerRepo: PublishContentPeerRepoPort;
  /**
   * Task 10's outbound push/pull leg — a guarded `HttpClientPort` of its own, built from
   * `createPublishContentPeerEgressPolicy()` rather than any policy an existing consumer uses. See
   * that factory's own doc for why: it is the only policy in this codebase whose `devHostAllowlist`
   * is operator-configurable (`TOVU_PUBLISH_CONTENT_DEV_HOSTS`), because a legitimate peer may sit
   * on a private network on Railway, Render, AWS or a bare VPS.
   */
  publishContentPeerHttpClient: HttpClientPort;
  /**
   * The static-site export engine, injected into the HTTP route and deployments runner
   * so `features/deployments` does not depend on the export engine's entire graph.
   * See `features/deployments/export-run.ts` for that boundary. Both composition roots
   * bind the real `exportSite` from a static import, preserving the live module registries.
   * `ExportEngine` is imported type-only, so this declaration adds no runtime edge.
   */
  runExportSite: ExportEngine<RouteDeps>;
  /**
   * `TOVU_EXPORT_DIR` env, then the served site's `<site>/out/export` — the export engine's default output directory
   * root, read ONCE at boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolveExportOutputRootDir()` (via `createSiteRouteDeps()`) rather than re-read deep inside
   * `features/deployments/export-run.ts`'s `startExportRun` or `cli/commands/export.ts`'s
   * `runExportCommand` — same "read once at the root, thread the value down" discipline `themesDir`
   * above already establishes for `TOVU_THEMES_DIR`. `cli/commands/export.ts`'s own `--out` flag
   * still takes precedence over this field where a caller supplies one; this field IS the
   * env-then-default fallback both callers share.
   */
  exportOutputRootDir: string;
  /**
   * What this process actually serves, resolved once at boot and injected into the Sites
   * routes/tools. Re-deriving it from cwd/env at request time would target the wrong site
   * for `tovu serve <dir>`, whose CLI argument does not set `TOVU_SITE_DIR`/`TOVU_SITE`.
   * The CLI supplies the binding explicitly with `switcherCompatible: false`; other boot
   * paths default to `describeSiteBinding()`. This keeps both serving status and switcher
   * writes tied to the same site tree.
   */
  siteBinding: SiteBinding;
  /**
   * The served site's on-disk storage paths, resolved ONCE at boot from the same values the
   * composition root actually opened (`createSiteRouteDeps`'s `dbPath` and its blob store's uploads
   * root), so a request handler never re-derives them from `TOVU_CONTENT_DB`/`siteDir()` — which
   * names the env/cwd site, not necessarily the one this process serves (hardwiring audit #19). See
   * {@link SiteStoragePaths}.
   */
  siteStoragePaths: SiteStoragePaths;
  /**
   * Where `features/site-backup`'s `site_backup_plan` reads this site's files from: the site folder
   * (`siteBinding.dir`), and the SAME uploads, themes, agent-plugins and skills roots this process
   * serves them from, plus the Tovu version stamped into the backup's manifest. Resolved once by
   * `server/runtime/composition/deps.ts`'s `createSiteRouteDeps()`.
   *
   * Optional because the in-memory `server/app.ts` runtime has no site folder on disk; both
   * site-backup tools then answer `UNAVAILABLE` instead of backing up nothing.
   */
  siteBackupSources?: SiteBackupSources;
  /**
   * `TOVU_ADMIN_ASSISTANT` off switch, read ONCE at boot (`admin-assistant-enabled.ts`'s
   * `isAdminAssistantEnabled()`) by both composition roots — `server/app.ts`'s `createRouteDeps()`
   * and `server/deps.ts`'s `createSiteRouteDeps()` — same "read once at the root, thread the
   * value down" discipline `exportOutputRootDir` above establishes for its own env var.
   *
   * `app.ts`'s own module-mounting code reads this SAME field (not a second `isAdminAssistantEnabled()`
   * call) to decide whether to mount the four gated admin-assistant modules, so the value a client
   * observes here can never disagree with which routes are actually live.
   *
   * The one route consumer is `routes/assistant/get-settings.ts`, which folds this into its response
   * alongside the (unrelated) public-assistant switch it already returns — see that route's own doc
   * for why: `modules/assistant-settings.ts` is one of exactly two admin-assistant modules mounted
   * UNCONDITIONALLY, so it is the one place the admin SPA can learn the flag is off without the
   * request itself 404ing.
   */
  adminAssistantEnabled: boolean;
  /**
   * Boots the real Express app for the export engine's in-process HTTP crawl. Injection
   * avoids an export-to-server runtime dependency. Both composition roots bind the same
   * `createApp` factory statically, preserving the live module registries.
   *
   * Nullary and closed over this composition's `routeDeps`: a per-call `RouteDeps`
   * argument would force the full composition type into the export engine's contract.
   * See `exportSiteBound` for the shared closure-identity rule when overriding test deps.
   *
   * `optional.themeId` (2026-10-08) builds an app that renders the site's pages through that theme
   * instead of the active one, without activating it — `web_screenshot_page` looking at a theme copy
   * (see `CreateAppOptions.themeIdOverride`). It is an option of the app being built, never request
   * input, so the serving app has no way to receive it.
   */
  createSiteApp: (optional?: { themeId?: string }) => Express;
  /**
   * The same storefront product resolver used by the live `/products` routes, injected
   * for the export route manifest. Its `SiteProduct` return type belongs to the server
   * rendering boundary and must not enter `features/commerce`; see its storefront module.
   *
   * Nullary and closed over this composition's deps to avoid propagating `RouteDeps`.
   * The manifest uses a minimal local `{id, title}` result shape, satisfied by covariance,
   * rather than importing the server's `SiteProduct` type and recreating a back-edge.
   * See `exportSiteBound` for the shared closure-identity rule when overriding test deps.
   */
  resolveStorefrontProducts: () => Promise<SiteProduct[]>;
  /**
   * The same `resolveActiveThemeId` (`features/presentation/active-theme-id.ts`) the live public
   * routes resolve the active theme with, injected here for `features/site-export/route-manifest.ts` to
   * reuse — mirroring `resolveStorefrontProducts`/`createSiteApp` immediately above, but for a
   * different reason: `resolveActiveThemeId` has no `server/**`-only type to avoid (unlike
   * `SiteProduct`), the issue is purely module direction. `route-manifest.ts` lives under
   * `platform/`, a foundation-layer module `features/presentation` itself depends on (via
   * `platform/db`); a direct import the other way would close a `platform <-> features/presentation`
   * runtime cycle (`check:architecture` module-cycle regression, 2026-09-03). NULLARY, closed over
   * the same `const routeDeps` binding `createSiteApp`/`resolveStorefrontProducts` already close
   * over — `resolveActiveThemeId`'s own `ActiveThemeIdResolutionDeps` (`presentationRepo`/
   * `workspaceId`) is a subset of `RouteDeps`, so `routeDeps` satisfies it with no cast.
   */
  resolveActiveThemeId: () => Promise<string>;
  /**
   * The same `listPublishedPosts` (`features/post/post.ts`) the live public routes render
   * posts/pages with, injected here for `features/site-export/route-manifest.ts` to reuse — same
   * module-direction reason as `resolveActiveThemeId` immediately above:  `features/post` depends on
   * `platform` (via `platform/db`, `platform/routing`), so `route-manifest.ts` importing it directly
   * would close a `platform <-> features/post` runtime cycle. NULLARY, closed over the same `const
   * routeDeps` binding; `listPublishedPosts({ deps: { repo: routeDeps.postRepo }, input: {
   * workspaceId: routeDeps.workspaceId } })` is bound once at each composition root rather than
   * re-threading `postRepo`/`workspaceId` as two more `RouteManifestDeps` reads at the call site.
   */
  listPublishedPosts: () => Promise<{ posts: PostRecord[] }>;
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
   * `TOVU_PUBLISH_DIR` env, then the served site's `<site>/out/publish` — the static-publish flow's parent output
   * directory, read ONCE at boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolvePublishOutputRootDir()` (via `createSiteRouteDeps()`), same "read once at the root"
   * discipline `exportOutputRootDir` above establishes. `static-publish/adapter.ts`'s
   * `publishOutputDir` joins this with the target id to get the per-target directory it actually
   * exports into — never re-reads `process.env` itself.
   */
  publishOutputRootDir: string;
  /**
   * This workspace's plugin-contributed deploy targets (`deploy-targets/registry.ts`): the one place
   * the publish route and the static-publish agent tools learn which targets exist and which config
   * fields each takes. `server/deps.ts` loads the installed, activated deploy Agent Plugin;
   * `server/app.ts`'s hermetic root reads the bundled plugin's source directory directly.
   */
  loadDeployTargets: (workspaceId: string) => Promise<DeployTargetRegistry>;
  /**
   * This workspace's plugin-contributed git-host providers (`source-control/provider-registry.ts`),
   * read by `source_control_*`, `site_backup_*`, `custom_credential_write_files` and the Source
   * Control credential route. Omitted by `server/deps.ts`, so those read the installed, activated
   * Agent Plugins; `server/app.ts`'s hermetic root reads the bundled `github` plugin's source directly.
   */
  loadSourceControlProviders?: LoadSourceControlProviders;
  /**
   * This workspace's self-describing token scheme rules (`custom-credentials/auth-schemes.ts`), read
   * by `custom_credential_make_request`/`_verify`. Omitted by `server/deps.ts`, so those read the
   * installed plugins; `server/app.ts`'s hermetic root reads the bundled `deploy` plugin's source.
   */
  loadAuthSchemes?: (ctx: { readonly workspaceId: string }) => Promise<readonly CredentialSchemeRule[]>;
  /**
   * 2026-08-16 — cached, non-secret provider-verification results for the saved publish credentials'
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
   * `TOVU_SOURCE_CONTROL_EXPORT_DIR` env, then the served site's `<site>/out/source-control-export` — the
   * `source-control` domain's own export scratch directory (deliberately separate from
   * `exportOutputRootDir`/`publishOutputRootDir` above so no two of these features ever race over
   * the same on-disk output — see `features/source-control/commit-site.ts`'s header), read ONCE at
   * boot by `server/app.ts`'s `createRouteDeps()`/`server/deps.ts`'s
   * `resolveSourceControlExportRootDir()` (via `createSiteRouteDeps()`). `commit-site.ts`'s
   * `commitExportDir` joins this with the provider subdirectory (`"github"`) — never re-reads
   * `process.env` itself.
   */
  sourceControlExportRootDir: string;
  /**
   * The real export engine pre-bound to this exact `RouteDeps` object, so source-control
   * and static-publish callers provide only `{outputDir; clean?; basePath?}`. Their local
   * structural function contracts keep the composition-root type out of feature modules.
   *
   * This differs from `runExportSite`, which takes `routeDeps` per call for the generic
   * HTTP export runner. Mixing the call shapes can silently ignore or omit dependencies.
   * Both roots bind `(opts) => exportSite({ ...opts, routeDeps })`, with `routeDeps` LAST
   * so a forwarded options object cannot overwrite the captured composition.
   *
   * Closure-bound functions capture one object identity, not a snapshot of its properties.
   * Tests overriding a dependency read inside `exportSiteBound`, `createSiteApp`, or
   * `resolveStorefrontProducts` must mutate the returned deps object in place. Spreading
   * `{ ...deps, createSiteApp: fake }` creates a different object while the original closure
   * still reads the original deps. Direct field reads outside the closure are unaffected.
   */
  exportSiteBound: (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;
};

export type RouteRegistrar = (app: Express, deps: RouteDeps) => void;
