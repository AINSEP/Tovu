import type { RememberedApprovalPort } from "@jini-ai/core";
import type { SourceControlWritePort } from "@jini-ai/core/contracts/credentials";
import type { PublishCompatibilityPort } from "../../../features/custom-credentials/index.js";
import type { SettingsToolDeps } from "#src/features/settings/tool-registrations";
import type { SiteAssistantCredentialRepoPort, AdminExecutionCredentialRepoPort } from "#src/assistant/host-ports";
import type { KeyringPort, SecretSealerPort } from "../../../features/webhooks/index.js";
import type { DatabaseDestinationStorePort } from "../../../features/database-transfer/destination-store.js";
import type { CustomCredentialSetRepoPort } from "../../../features/custom-credentials/index.js";
import type { HttpClientPort } from "../../../platform/http/index.js";
import type { SourceControlCredentialSetRepoPort } from "../../../features/source-control/index.js";
import type { VendorCredentialSetRepoPort } from "../../../features/vendor-credentials/index.js";
import type { MediaProviderCredentialRepoPort } from "../../../features/media/index.js";
import type { ExternalMcpServerRepoPort, DeviceAuthorizationStore, ExternalMcpOAuthService } from "../../../features/external-mcp/contracts.js";
import type { ConversationToolApprovalStore, ExternalMcpToolApprovalRepoPort } from "../../../assistant/mcp-services.js";

/**
 * ADR-058 credential repositories and shared sealing capabilities. Credential-CRUD
 * routes receive their own repo plus the shared sealer/keyring, never the other credential
 * repositories; inheriting the whole group would widen their secret-adjacent surface.
 */
export interface CredentialsDeps {
  /**
   * The SITE's encrypted provider credential store (ADR-058) — one row per workspace, backing the
   * "Visitor's AI Assistant" admin tab and `apps/website/src/server/runtime/composition/modules/site-assistant.ts`'s runtime key
   * resolution. Unlike `assistantSettingsReady` above, this needs no boot-time definition
   * registration (it is a plain table, not a `core.execution.*` ledger namespace), so there is no
   * matching `*Ready` promise — the repo is usable as soon as migrations have run.
   */
  siteAssistantCredentialRepo: SiteAssistantCredentialRepoPort;
  /** Seals/opens the SITE credential above. See `Jini packages/platform/src/secrets/secret-sealer.aesgcm.ts`'s header for
   *  why this is one shared sealing capability, not one per workspace. */
  siteAssistantSecretSealer: SecretSealerPort;
  /**
   * The `KeyringPort` `siteAssistantSecretSealer` derives its AES key from — exposed separately
   * (not just baked into the sealer) because `setSiteAssistantCredential` also needs
   * `keyring.activeKey()` directly, to know which site-key generation to stamp into a freshly-sealed
   * row. Deliberately its OWN `EnvOrFileKeyring` instance in the real composition root
   * (`apps/website/src/server/runtime/composition/deps.ts`), constructed `{allowFileFallback:false}`, independent of the shared instance
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
   * (`apps/website/src/features/external-mcp/external-mcp-store.ts`).
   *
   * Multi-row per workspace like `mediaProviderCredentialRepo` above. Its sealed column holds a
   * whole `KEY=VALUE` environment block rather than one key, sealed with the same shared ADR-058
   * sealer/keyring as every other credential table here. No matching `*Ready` promise: a plain
   * table, usable as soon as migrations run.
   */
  externalMcpServerRepo: ExternalMcpServerRepoPort;
  /** Server federation's live admissions reader. Integration binds it to the SAME tool surface
   * used by /internal/tool-executions; an unwired preparation build answers unavailable. */
  externalMcpAdmissions?: import("../../../features/external-mcp/operations-tools.js").ExternalMcpOperations["admissions"];
  bundledSourceRoot: string;
  mcp: import("../../../features/agent-plugins/service-ports.js").AgentPluginMcpPort & import("../../../features/agent-plugins/service-ports.js").AgentPluginMcpContext;
  preferences: import("../../../features/agent-plugins/service-ports.js").AgentPluginPreferencesPort;
  providerFaces: import("../../../features/plugin-runtime/service-ports.js").PluginProviderFacesPort;
  notifyRosterChanged: import("../../../contracts/core/tool-access-change.js").NotifyToolAccessChanged;
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
   * (`apps/website/src/features/external-mcp/external-mcp-oauth.ts`), or absent.
   *
   * OPTIONAL: a narrow test double may have no reason to wire OAuth. The external-MCP module
   * registers no OAuth routes in that case, since a callback that can complete nothing is useless.
   */
  externalMcpOAuth?: ExternalMcpOAuthService;
  /**
   * The device-authorization store shared by the web service and the daemon's second service.
   * Built once per composition root, avoiding a second database handle and repeated migrations.
   * The SQL root persists device attempts; the hermetic root uses a process-local memory adapter.
   * A narrow builder may omit it, in which case the daemon falls back to its memory adapter.
   * Redirect callbacks use sealed state and the same site key, with no pending-store wiring.
   */
  externalMcpOAuthDevices?: DeviceAuthorizationStore;
  /**
   * This process's listener origin, pinned by the boot entrypoint in TOVU_SITE_LISTENER_ORIGIN
   * and inherited by the assistant daemon. Also reported by site_guide overview for browser use.
   * Without that pin, a best-effort origin (`"https://localhost:3000"`-shaped) — the scheme
   * from whether THIS process terminates TLS itself (`platform/dev-host/dev-tls.ts`) and the port
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
  /** Trusted configured external origin for passkeys; never derived from request headers. */
  passkeyOrigin?: string;
  /**
   * 2026-08-15 — the `source_control_credential_sets` repo backing the admin Source Control page's
   * connect/replace form (`apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts`). Real
   * `SqliteSourceControlCredentialSetRepo` in `apps/website/src/server/runtime/composition/deps.ts`; `InMemorySourceControlCredentialSetRepo`
   * in `apps/website/src/server/runtime/composition/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
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
   * (`apps/website/src/features/vendor-credentials/vendor-credential-repo.sqlite.ts`) in `apps/website/src/server/runtime/composition/deps.ts`;
   * `InMemoryVendorCredentialSetRepo` in `apps/website/src/server/runtime/composition/app.ts`'s hermetic composition, same rule-of-two
   * every other repo here follows. Sealed via the SAME shared `siteAssistantSecretSealer`/
   * `siteAssistantSecretKeyring` instances above — one sealing capability app-wide, same reasoning
   * `sourceControlCredentialSetRepo` already establishes.
   *
   * Since 2026-09-29 this is where publish credentials live (`deployments/publish-credentials/store.ts`
   * reads and writes them here, by each deploy host's declared vendor); the legacy
   * `publish_credential_sets` rows are folded by migration 0012 and no longer read. Source-control credentials still live in `sourceControlCredentialSetRepo`.
   */
  vendorCredentialSetRepo: VendorCredentialSetRepoPort;
  /**
   * 2026-08-17 — the `custom_credential_sets` repo backing the admin Access Tokens page's
   * "Add custom provider" form (`apps/website/src/server/inbound/admin-http/routes/system/custom-credentials.ts`). Real
   * `SqliteCustomCredentialSetRepo` in `apps/website/src/server/runtime/composition/deps.ts`; `InMemoryCustomCredentialSetRepo` in
   * `apps/website/src/server/runtime/composition/app.ts`'s hermetic composition, same rule-of-two every other repo here follows. Sealed
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
   * custom credential (e.g. "name.com", "my-host") to its own operator-typed `baseUrl`. A genuinely
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
  /**
   * `custom_credential_write_files`' write port: `source-control/write-port.ts`'s binding over `loadSourceControlProviders`,
   * `customCredentialsHttpClient` and `observability`. Bound by each composition root with getters over this same
   * bag, so those three are read when a write runs, not when the port is built.
   * TEST GOTCHA (the `exportSiteBound` rule above): a spread copy of a composed bag that overrides one of the three
   * leaves this port reading the original; override `sourceControlWrite` too.
   */
  sourceControlWrite: SourceControlWritePort;
  /**
   * Tells publish targets that a saved credential's compatibility changed: `deployments`' `bindPublishCompatibility`, bound
   * by each root over THIS bag (`publishCredentialVerificationCache`, `loadDeployTargets`), read when a credential is saved,
   * never when the port is bound. The cache stays the one instance the admin HTTP routes use. Same spread-copy TEST
   * GOTCHA as `sourceControlWrite`.
   */
  publishCompatibility: PublishCompatibilityPort;
  /** `site_backup_push`'s client: `SITE_BACKUP_EGRESS_POLICY` (2-minute idle ceiling for large blob
   *  uploads). Absent (the in-memory runtime), the backup uses {@link customCredentialsHttpClient}. */
  siteBackupHttpClient?: HttpClientPort;
  /** Deploy observation requests must not follow vendor redirects, even to another public host. */
  deployOpsHttpClient?: HttpClientPort;
  /** Deploy-config owner supplies this workflow; ops plugins never import each other. */
  loadDeployWorkflowFiles?: (input: { workspaceId: string }) => Promise<readonly string[]>;
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
  /** Media-generation vendors (built-in + plugin-contributed), built once per composition root. */
  mediaProviderRegistry: import("@jini-ai/integrations/media-providers").MediaProviderRegistry;
}
