import { BASE, WORKSPACE_ID } from "./admin-http/config";
import { authenticatedAdminRequest, fetchOrThrowUnreachable, request, requestOnce, bodyFitsKeepalive, ApiError, type AuthenticatedAdminRequestOptions } from "./admin-http/request";
import { adminFailureChannel } from "./admin-failure-channel";
import type { CredentialTokenHint } from './credential-copy';
import type { SettingScope } from "@jini-ai/core/settings";
import type { MediaProviderCredentials } from "@jini-ai/ui/core";
import type {
  PublishContentConfirmResult,
  PublishContentExecuteResult,
  PublishContentPeerSummary,
  PublishContentPlanResult,
  PublishScope,
} from "@tovu/publish-content-ui";
import { siteUrl } from "./site-url";
import { shareSettingsEffectiveRead } from "./settings-effective-reads";
import { querySuffix } from "./query-suffix";

/** The peer-scoped prefix every publish-content push call hangs off — the peer is named in the PATH
 *  (`routes/publish-content/peer-transport.ts`), never in a body, and never as a URL or credential. */
function publishContentPeerPath({ peerId }: { peerId: string }, _optional: Record<string, never> = {}): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/peers/${encodeURIComponent(peerId)}`;
}

/** The zero-setup connect action's own path — a workspace-scoped singleton, not peer-scoped, since
 *  there is nothing to name until it exists (`routes/publish-content/destination.ts`). */
function publishContentDestinationPath(): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/destination`;
}

/** Which part of a theme a file is (`GET .../themes/:id/files`). */
export type ThemeFileGroup = "page" | "partial" | "style" | "script" | "config" | "asset" | "other";

export interface AdminUser {
  id: string;
  username: string;
}
import type { SettingResolvedValue } from "./settings-effective-reads";

export type ProviderDomainVerification =
  | { state: "verified" | "pending" | "failed" | "not_found"; domain: string; providerId: string }
  | { state: "no_sender" | "no_provider" | "unsupported" | "unknown"; domain?: string; providerId: string | null; reason?: string };

export interface SettingValueResponse {
  key: string;
  scope: SettingScope;
  value: unknown;
  revisionSeq: number;
}

export interface SettingResetResponse {
  namespace: string;
  clearedCount: number;
  revisionSeqs: number[];
}

/**
 * One media-generation vendor's stored credentials, keyed by ENGINE-CANONICAL provider id (`grok`,
 * `nanobanana`, …) — see `features/media/media-provider-catalog.ts` for why the spelling matters.
 *
 * Structurally `@jini-ai/ui`'s `MediaProviderCredentials` and mirrors
 * `apps/website/src/features/media/provider-credential-store.ts`'s `MediaProviderCredentialView` on the server. `apiKey`
 * is send-only: the operator types one and it goes up, but no response ever carries it back — a
 * stored key comes back as `apiKeyConfigured`/`apiKeyTail` instead.
 */
export interface AdminMediaProviderCredentials extends MediaProviderCredentials {
  apiKeyHint?: CredentialTokenHint | null;
}

export type AdminMediaProviderMap = Record<string, AdminMediaProviderCredentials>;

/**
 * One configured external MCP server, as the admin tab sees it. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server.
 */
/**
 * The OAuth half of {@link AdminExternalMcpServer}. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpOAuthView` — never carries an access token, a
 * refresh token, or a client secret; `hasStoredToken` is presence only, the same technique the view
 * it mirrors uses.
 */
export interface AdminExternalMcpOAuthView {
  providerId: string | null;
  grant: string | null;
  clientId: string | null;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  tokenEnvName: string | null;
  hasStoredToken: boolean;
}

/**
 * One configured external MCP server, as the admin tab sees it. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server. `url`/`authMode`/`oauth` are the same posture applied
 * to the two fields the generic streamable-HTTP + OAuth transport added on top of the original
 * stdio-only shape.
 */
/** `POST .../mcp-servers/:serverId/oauth/connect`'s `auth`. Mirrors `apps/website/src/features/external-mcp/contracts.ts`'s
 *  `ExternalMcpConnectStart`; the device code itself never leaves the server. */
export type AdminExternalMcpConnectStart =
  | { kind: "redirect_required"; authorizationUrl: string; expiresAt: string }
  | { kind: "device_code"; userCode: string; verificationUri: string; verificationUriComplete: string | null; expiresAt: string; intervalSeconds: number };

/** One saved "Always allow" from `GET .../mcp-servers/tool-approvals` — a remote tool the approval
 *  card no longer asks about. Revoking it makes the card ask again. */
export interface AdminExternalMcpToolApproval {
  serverId: string;
  toolName: string;
  grantedByPrincipalId: string;
  grantedAt: string;
}

export interface AdminExternalMcpServer {
  /** Source-derived runtime ownership, absent on older servers. */
  builtIn?: boolean;
  serverId: string;
  label: string;
  transport: string;
  /** One of `apps/website/src/features/external-mcp/agent-tools.ts`'s `EXTERNAL_MCP_AUTH_MODES` — `none` | `static_env` | `oauth`. */
  authMode: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a `streamable_http` server. `null` for `stdio`, where `command` is used instead. */
  url: string | null;
  args: string[];
  allowedToolNames: string[];
  /**
   * The operator's SECOND, write-authorization list — mirrors
   * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView.writeAllowedToolNames`. A remote
   * tool declaring `readOnlyHint: false` is admitted only when it appears in BOTH this list and
   * {@link allowedToolNames} (`mcp-federation/trust.ts` R3's override). Independent of
   * `allowedToolNames`, never derived from it.
   */
  writeAllowedToolNames: string[];
  /**
   * Who last CHANGED {@link writeAllowedToolNames}, and when — mirrors the store's own view fields
   * of the identical name. Both `null` until that list is ever touched, or for a row written before
   * these columns existed. Read-only: there is no input counterpart, since a save attributes itself
   * from the authenticated principal server-side rather than accepting a caller-supplied identity.
   */
  writeGrantsUpdatedByPrincipalId: string | null;
  writeGrantsUpdatedAt: string | null;
  envNames: string[];
  /** Whether a static access token (auth mode `static_env`) is stored. Presence only — the token is
   *  sealed and never returned. Optional so an API that predates the field reads as "none stored". */
  hasAccessToken?: boolean;
  accessTokenHint?: CredentialTokenHint | null;
  envTokenHints?: Readonly<Record<string, CredentialTokenHint>>;
  /** For a `stdio` + `static_env` server: which environment variable receives that token. */
  accessTokenEnvName?: string | null;
  oauth: AdminExternalMcpOAuthView;
}

/**
 * The OAuth half of {@link AdminExternalMcpServerInput}. Every member is tri-state exactly as the
 * store's own `SaveExternalMcpOAuthInput` is: an absent key keeps whatever is stored, a string
 * replaces it. `clientSecret` is the one member that is ALSO write-only — no read model in this
 * subsystem ever returns it, so the form can only ever send a new one or say nothing.
 */
export interface AdminExternalMcpOAuthInput {
  providerId?: string;
  grant?: string;
  clientId?: string;
  clientSecret?: string;
  /** Raw operator input, comma- or space-separated. */
  scopes?: string;
  tokenEnvName?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
}

/**
 * Write shape for one external MCP server. `args`/`allowedToolNames`/`env` are the operator's raw
 * strings — the server owns parsing them, so the admin never has a second, subtly different parser
 * that could accept something the store rejects.
 */
export interface AdminExternalMcpServerInput {
  label?: string;
  transport: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a `streamable_http` server. Ignored for `stdio`. */
  url?: string;
  args: string;
  allowedToolNames: string;
  /**
   * Raw operator input, comma-separated remote tool names separately authorized to write. Same
   * "resent in full on every save" convention as {@link allowedToolNames} — NOT tri-state like
   * {@link env}, since the tab always has the current list in the clear and can always resend it.
   * The server rejects a save (`ExternalMcpValidationError(field: "writeAllowedToolNames")`) if this
   * names a tool absent from {@link allowedToolNames} — mirrors
   * `src/assistant/external-mcp-store.ts`'s C-006 subset check.
   */
  writeAllowedToolNames: string;
  /** Omit to keep stored credentials; `""` to clear them. The distinction is load-bearing. */
  env?: string;
  /** Absent keeps an existing row's auth mode; otherwise one of `none` | `static_env` | `oauth`. */
  authMode?: string;
  /** SECRET, write-only, `static_env` only. Tri-state like {@link env}: omit to keep the stored token,
   *  a string replaces it, `""` clears it. Delivered as `Authorization: Bearer` to a hosted server, or
   *  as {@link accessTokenEnvName} to a local command. */
  accessToken?: string;
  /** For `stdio` + `static_env`: the environment variable that receives {@link accessToken}. */
  accessTokenEnvName?: string;
  oauth?: AdminExternalMcpOAuthInput;
}

/**
 * MCP's per-tool behaviour hints, exactly as a remote server declares them — mirrors
 * `Jini packages/mcp/src/federation/ports.ts`'s `RemoteToolAnnotations` verbatim. Self-declared by the
 * thing being classified, so `mcp-federation/trust.ts` only ever lets these make a tool LESS
 * available, never more; see {@link AdminRemoteToolSurfaceEntry.hintsAbsent} for the gap that leaves.
 */
export interface AdminRemoteToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** One of `Jini packages/mcp/src/federation/trust.ts`'s `ToolRefusalReason` members — why the admission
 *  gate would not admit a given tool today. */
export type AdminToolRefusalReason =
  | "not-in-operator-allowlist"
  | "remote-declares-destructive"
  | "remote-declares-not-read-only"
  | "missing-or-invalid-input-schema"
  | "invalid-remote-tool-name"
  | "duplicate-remote-tool-name"
  | "connection-tool-cap-reached";

/**
 * One ADVERTISED remote tool, described as an operator-facing record for the (not-yet-built)
 * write-tool picker — mirrors `Jini packages/mcp/src/federation/trust.ts`'s `RemoteToolSurfaceEntry` verbatim, field
 * names included, per `probeExternalMcpServer`'s response (C-007).
 *
 * Covers every tool the remote listed, admitted or not, so a future picker can show the operator
 * what they are choosing between rather than only what already cleared the gate.
 *
 * `hintsAbsent` MUST NOT be rendered as "read-only" by any consumer — it means the remote said
 * nothing about this tool, which is exactly the case a write can slip through unmarked today (see
 * `external-mcp-i18n.ts`'s header for the copy discipline this drives).
 */
export interface AdminRemoteToolSurfaceEntry {
  remoteName: string;
  description: string;
  declaredAnnotations?: AdminRemoteToolAnnotations;
  writeDeclared: boolean;
  destructiveDeclared: boolean;
  hintsAbsent: boolean;
  allowlisted: boolean;
  writeAllowed: boolean;
  admitted: boolean;
  refusalReason: AdminToolRefusalReason | null;
}

/** `POST .../mcp-servers/:serverId/probe`'s response shape (C-007) — a live, on-demand read of what
 *  the remote currently advertises. Never persisted server-side (a cache of third-party data does
 *  not belong on the security row — see `schema-decision.md` Part 1), so `probedAt` is this call's
 *  own timestamp, not a stored one. */
export interface AdminExternalMcpProbeResult {
  tools: AdminRemoteToolSurfaceEntry[];
  probedAt: string;
}

/**
 * One connection's live admission accounting from the RUNNING agent daemon — a subset of
 * `Jini packages/mcp/src/federation/trust.ts`'s `FederatedAdmissionReport`, FLATTENED per connection by
 * {@link api.getExternalMcpAdmissions} (see {@link RawAdmissionConnection} for why that flattening
 * step exists and is not optional).
 *
 * `admitted` intentionally carries only what a drift banner needs (a name and whether it is
 * write-authorized), not the full `AdmittedFederatedTool` the daemon holds (which also carries a
 * `toolId` and the remote's raw input schema) — same "richer server shape, unread extra fields"
 * precedent {@link AdminMediaProviderCredentials} follows.
 */
export interface AdminFederatedAdmissionEntry {
  connectionId: string;
  admitted: { remoteName: string; writeAuthorized: boolean }[];
  refused: { remoteName: string; reason: AdminToolRefusalReason }[];
  /** Allowlisted names the remote never advertised — an operator's config drifting from the
   *  server's real surface. */
  allowlistedButAbsent: string[];
  /** Names write-authorized but not also allowlisted — a write grant that can never take effect. */
  writeAllowedButNotAllowlisted: string[];
  /**
   * Whether this connection came from a first-party plugin preset (`mcp-federation/presets.ts`)
   * rather than this workspace's editable roster — `AttachFederatedToolsResult.reports`'s own field,
   * relayed verbatim through two passthrough hops. `external-mcp-admissions-rules.ts` reads this to
   * tell "no roster card because this is a preset, by design" apart from "no roster card because the
   * operator deleted it" — both used to look identical (no roster card either way), which is why a
   * genuinely-deleted-but-still-live connection was silently reported as agreeing instead of as
   * drift (2026-09-07). Optional, not defaulted at this type's boundary: an older daemon build that
   * predates this field omits it, and `!entry.isPreset` already reads `undefined` the same as
   * `false` — the safe direction, since it means "warn about a live connection" rather than "stay
   * silent about one that might not be a preset".
   */
  isPreset?: boolean;
}

/**
 * One SAVED, enabled external-MCP row the daemon could not even attempt to connect — it never
 * reached `attachFederatedMcpTools` at all, so it has no matching {@link AdminFederatedAdmissionEntry}
 * either. Most commonly a sealed env block that failed to decrypt because the site key is not
 * available (`assistant/external-mcp-store.ts`'s `openExternalMcpEnv`).
 *
 * `reason` is the daemon's own operator-facing failure string
 * (`readEnabledExternalMcpConfigs`/`external-mcp-store.ts`) — already guaranteed secret-free by that
 * module's own contract (`admin-http/routes/external-mcp/probe.ts`'s INV-006 doc relays the
 * identical string to an operator today), never a raw stack trace or provider error. Even so,
 * `external-mcp-admissions-rules.ts` does not interpolate this string into the banner verbatim — it
 * classifies known reasons (today: a decrypt failure) into fixed, translated-or-English copy, and
 * falls back to the pre-existing generic message for anything it does not recognize, rather than
 * rendering server-authored text straight into UI copy.
 */
export interface AdminExternalMcpConfigFailure {
  connectionId: string;
  reason: string;
}

/** `GET .../mcp-servers/admissions`'s response shape (C-008), AFTER {@link api.getExternalMcpAdmissions}
 *  has flattened it — see {@link RawAdmissionConnection}. A down daemon is a 503 — see
 *  {@link api.getExternalMcpAdmissions}'s own doc — never an empty `connections` array, so "the
 *  assistant is not running" and "it is running with nothing admitted" stay distinguishable. */
export interface AdminExternalMcpAdmissionsSnapshot {
  connections: AdminFederatedAdmissionEntry[];
  /**
   * Optional and NOT defaulted to `[]` at this type's boundary — absent for an older daemon build
   * that predates this field (`federation-admissions-route.ts`'s own doc), the same "absent means
   * unknown, not zero" reasoning {@link AdminFederatedAdmissionEntry.isPreset} already uses one field
   * over. `external-mcp-admissions-rules.ts`'s `describeAdmissionDrift` treats a missing array the
   * same as an empty one (no known failures to report), so callers that never populate this — every
   * pre-existing test fixture included — keep behaving exactly as before.
   */
  configFailures?: AdminExternalMcpConfigFailure[];
}

/**
 * The wire shape `GET .../mcp-servers/admissions` (C-008) actually sends, BEFORE
 * {@link api.getExternalMcpAdmissions} normalizes it into {@link AdminFederatedAdmissionEntry} — one
 * entry per connection, exactly `federation-admissions-route.ts`'s own
 * `FederationAdmissionsRouteDeps.reports` shape, serialized untouched: that daemon route "is a pure
 * serializer, never a reshape point" by its own header, and `admin-http/routes/external-mcp/
 * admissions.ts` (C-008's own proxy) deliberately treats the body as `unknown` and relays it
 * VERBATIM too — proven by `admin-external-mcp-admissions-routes.test.ts`'s "a live daemon's real
 * report is relayed verbatim" test, which this type must keep matching rather than the other way
 * around.
 *
 * So every admission field arrives nested one level deeper than {@link AdminFederatedAdmissionEntry}
 * declares — under `report`, not on the entry itself. Before `getExternalMcpAdmissions` normalized
 * this (ADM-003, 2026-09-08), `entry.admitted` (and every sibling field) was `undefined` for EVERY
 * connection the daemon ever reported, which is what crashed `<ExternalMcpSettingsPanel>`:
 * `external-mcp-admissions-rules.ts`'s several reads of it (`connectionLevelEntry`,
 * `liveOnlyEntries`, `describeConnectionDrift`, `removedButStillRunningEntry`) all assumed the flat
 * shape and none of them were guarded, because that file's contract — matching what
 * `AdminFederatedAdmissionEntry` has always declared — was never wrong; only this one wire hop
 * silently violated it. This type documents the wire's REAL shape so that hop can close the gap
 * itself, instead of every downstream reader growing a defensive `?.` that would collapse a real
 * empty admitted set and a missing one into the same silent zero (see that function's own doc on
 * why `savedAllowedToolNames === undefined` is load-bearing, not a default).
 */
interface RawAdmissionConnection {
  readonly connectionId: string;
  /** Absent for an older daemon build that predates this field — see
   *  {@link AdminFederatedAdmissionEntry.isPreset}'s own doc on why that must NOT default to `false`. */
  readonly isPreset?: boolean;
  /**
   * NOT optional here, and {@link flattenAdmissionConnection} reads into it unguarded — deliberately,
   * unlike `isPreset` above. Proven from `bootstrap.ts`'s OWN construction code, not from a type
   * declaration (a type declaration is exactly what lied about this shape last time): `attachFederatedMcpTools`
   * only ever pushes a `reports` entry from inside `if (attached.report) reports.push({ connectionId,
   * report: attached.report, isPreset })` — there is no code path that pushes an entry with no
   * `report`. That gate has existed, unchanged, since the very first commit that introduced this
   * `reports` shape (`e3843594`) — every daemon build in this repo's entire history that can produce a
   * `reports` entry at all produces one with a real `report`. `isPreset` is optional because it was
   * added LATER (`333eb70e`, 2026-09-07) and an already-running older daemon process predates it;
   * `report` has no such history — it is not a "recently added field" case.
   *
   * A future entry that somehow arrives without one anyway (corrupt payload, a hand-rolled test double
   * that skips this constraint) should throw here, not be silently read as "admitted nothing" — the
   * same "every refusal is reportable, never silent" reasoning `external-mcp-admissions-rules.ts`'s own
   * header states, and the reason `getExternalMcpAdmissions` does NOT also do `raw.report ?? {...}`
   * next to its `raw.connections ?? []` guard: `?? []` there defends a shape a REAL test in this repo
   * already sends (`api-long-tail-endpoints.unit.test.ts`'s shared empty-body fetch stub); no
   * equivalent real producer of a report-less connection exists to defend against, so adding one would
   * be a speculative branch with no provable correct behavior, not a fix for anything ever observed.
   */
  readonly report: {
    readonly admitted: readonly { readonly remoteName: string; readonly writeAuthorized: boolean }[];
    readonly refused: readonly { readonly remoteName: string; readonly reason: AdminToolRefusalReason }[];
    readonly allowlistedButAbsent: readonly string[];
    readonly writeAllowedButNotAllowlisted: readonly string[];
  };
}

/** Un-nests one {@link RawAdmissionConnection} into the flat {@link AdminFederatedAdmissionEntry}
 *  contract every other reader in this app is written against. `isPreset` is copied only when the
 *  wire actually sent it, never defaulted, for the same reason the type doc above states.
 *  `raw.report.*` below is read unguarded on purpose: `federation-admissions-route.ts:48` types
 *  `report` non-optional and `:61` (`res.status(200).json({ connections: deps.reports })`) is a pure
 *  pass-through of that same typed value, in the same process — the producer's type IS the
 *  serializer's input, not a second, independently-authored type the wire could drift out of sync
 *  with (that drift, across a boundary, is what `admitted`/`refused`/etc. being nested under `report`
 *  in the first place actually was — see {@link RawAdmissionConnection}'s own doc). No guard needed.
 *  @complexity O(1) — copies four already-computed arrays, does not iterate them. */
function flattenAdmissionConnection(raw: RawAdmissionConnection): AdminFederatedAdmissionEntry {
  return {
    connectionId: raw.connectionId,
    admitted: raw.report.admitted as { remoteName: string; writeAuthorized: boolean }[],
    refused: raw.report.refused as { remoteName: string; reason: AdminToolRefusalReason }[],
    allowlistedButAbsent: raw.report.allowlistedButAbsent as string[],
    writeAllowedButNotAllowlisted: raw.report.writeAllowedButNotAllowlisted as string[],
    ...(raw.isPreset !== undefined ? { isPreset: raw.isPreset } : {}),
  };
}

/** One required-for-production env var's presence — never its value. Mirrors
 *  `DeploymentEnvVarStatus` in `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts`. */
export interface AdminDeploymentEnvVarStatus {
  name: string;
  set: boolean;
  /** `TOVU_SITE_KEY` only: where the site key came from. There `set` means "a usable
   *  site key resolves" — a valid generated key file counts, malformed material does not. */
  source?: "env" | "file" | "none";
  /** `TOVU_SITE_KEY` only, present iff key material was found but is malformed. */
  invalid?: true;
}

/** Mirrors `DeploymentOverviewSnapshot` in `apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts`
 *  — see that type's own doc comments for what each field does and does not prove. */
export interface AdminDeploymentOverview {
  mode: "production" | "local";
  productionReadinessGate: { applicable: boolean; passed: boolean };
  defaultOwnerPasswordUnsafe: boolean;
  daemonKnownFailed: boolean;
  dbPath: string;
  uploadsDir: string;
  envVars: AdminDeploymentEnvVarStatus[];
}

/** Mirrors provider selection and delivery evidence, flattened for the wire the same way
 *  {@link AdminDeploymentOverview} flattens its own source config.
 *  `serviceName` is `null` whenever `enabled` is `false` — there is no service name to report for
 *  a port that never loads the OTel SDK. Deliberately does NOT carry the OTLP endpoint itself: that
 *  can embed a credential. Delivery evidence exposes only a hostname, fixed error class and HTTP
 *  status so an enabled port cannot be mistaken for proof that an export succeeded. */
export interface AdminObservabilityStatus {
  enabled: boolean;
  serviceName: string | null;
  canSendTestError?: boolean;
  providers?: { providerId: string; exportEnabled?: boolean; lastExport: AdminTelemetryDeliveryStatus | null; lastShutdown: AdminTelemetryDeliveryStatus | null }[];
}
/** Sanitized delivery DTO from the server; status carries no destination path or credential. */
export interface AdminTelemetryDeliveryStatus {
  phase: "export" | "shutdown";
  outcome: "ok" | "failed";
  host: string;
  at: string;
  errorClass?: string;
  statusCode?: number;
}
export interface AdminTelemetryTestResult {
  providers: { providerId: string; signals: ("error" | "span" | "analytics" | "metric")[] }[];
}

/** One captured server log line — mirrors `ServerLogEntry` in
 *  `apps/website/src/platform/server-logs/log-buffer.ts`. `message` is already secret-redacted. */
export interface AdminServerLogEntry {
  seq: number;
  at: string;
  level: "debug" | "info" | "warn" | "error";
  source: "server" | "daemon";
  message: string;
}

/** `GET /system/server-logs` — mirrors `ServerLogsResult` in
 *  `apps/website/src/features/server-logs/read-server-logs.ts`. `capturing: false` means nothing is
 *  recording lines, so an empty list is not proof of no errors. */
export interface AdminServerLogs {
  entries: AdminServerLogEntry[];
  matched: number;
  buffered: number;
  truncated: boolean;
  capturing: boolean;
}

/** Filters for {@link AdminServerLogs}; the same ones the `system_read_server_logs` chat tool takes. */
export interface AdminServerLogsQuery {
  level?: AdminServerLogEntry["level"];
  sinceIso?: string;
  contains?: string;
  limit?: number;
}

/** `GET /system/mail-status` (`apps/website/src/server/inbound/admin-http/routes/system/mail-status.ts`)
 *  — `false` while the site only logs outbound mail (the console fallback, no mail credential). */
export interface AdminMailStatus {
  /** Provider-side sender-domain verdict, independent of whether the sending key is saved. */
  senderDomainVerification?: ProviderDomainVerification;
  mailDeliveryAvailable: boolean;
  /** Present when the server reports lanes (email provider contract v1); `unconfigured` shows the
   *  admin's blocking banner. */
  state?: "ready" | "unconfigured" | "degraded";
  lanes?: readonly { lane: "transactional" | "bulk"; providerId: string | null; state: string }[];
  warnings?: readonly ("sender_unverified" | "sender_unknown")[];
  /** Installed mail providers (`MailStatusReport.providers`); `hosted: false` never leaves the machine. */
  providers?: readonly { id: string; label: string; hosted: boolean; origin: "core" | "plugin" }[];
  /** Plugin providers that were not loaded, and why (log-safe, English). */
  refusals?: readonly string[];
}

/** One row of the admin Sites screen — mirrors `SiteListEntry` in
 *  `apps/website/src/platform/site-dir/site-registry.ts`. Only directories carrying a valid
 *  `.site-meta.json` commit marker appear; see {@link AdminSiteBinding.listed} for why that matters. */
export interface AdminSiteListEntry {
  /** Folder name under `sites/` — the id every write in this feature takes. */
  name: string;
  dir: string;
  /** `config.json.name`; may differ from the folder name. */
  displayName: string;
  createdAt: string;
  /** True when this row is the site the SERVER PROCESS is bound to right now — never a pending
   *  choice. A newly-activated site stays `false` here until the operator restarts. */
  active: boolean;
  running?: { pid: number; port: number; app: string; scheme: "http" | "https" };
}

/** What the running server is actually serving — mirrors `SiteBinding` in `site-registry.ts`, plus
 *  the route's own `listed`. Kept separate from the list because they can disagree, which is the
 *  whole reason this field exists. */
export interface AdminSiteBinding {
  dir: string;
  name: string;
  /** `TOVU_SITE_DIR` is set, which OUTRANKS the `TOVU_SITE` line Activate writes — so an activate
   *  would be ignored on the next boot. The screen must say so rather than offer a dead button. */
  dirOverridden: boolean;
  /** Whether `dir` appears in `sites[]` at all. `false` for a site created before the
   *  `.site-meta.json` marker existed (this repo's own dev site folder), which is how the list can
   *  come back EMPTY on a server that is plainly serving something. */
  listed: boolean;
}

/** Mirrors the `GET .../system/sites` response in
 *  `apps/website/src/server/inbound/admin-http/routes/system/sites.ts`. */
export interface AdminLocalSiteState {
  name: string; status: "starting" | "running" | "stopped" | "crashed";
  pid: number | null; port: number | null; daemonPort: number | null; adminUrl: string | null;
  app?: string; external?: boolean;
}
export interface AdminTrashedSite { id: string; name: string; displayName: string }
export type AdminLocalSiteAction = "start" | "stop" | "stop-serving" | "trash" | "restore" | "delete" | "switch";

/** Machine-local config, shared with desktop. Runtime env overrides are displayed explicitly. */
export interface SitesUserConfig {
  sitesHome: string; siteRoots: string[]; databases: "inSite" | "appData";
  configPath: string; appData: string;
  overrides: { sitesHome: boolean; siteRoots: boolean };
  warning: { provider: string; message: string; localHome: string } | null;
}
export type SitesUserConfigPatch = Partial<Pick<SitesUserConfig, "sitesHome" | "siteRoots" | "databases">>;
export interface AdminSitesSnapshot {
  sitesHome?: string;
  localManagementEnabled?: boolean;
  canSwitchNow?: boolean;
  /** Stopping the serving site hands its address to `target`, the most recently started site still
   *  running; `null` means nothing can take over. `available` is false on a host that cannot restart. */
  stopServing?: { available: boolean; target: string | null; chatRunning: boolean };
  localSites?: AdminLocalSiteState[];
  trash?: AdminTrashedSite[];
  /** The deployment capability flag (`TOVU_ENABLE_SITE_SWITCHER`) — Create/Activate 403 when off. */
  switchingEnabled: boolean;
  sites: AdminSiteListEntry[];
  /** Card preview version tokens (`{ [site name]: capture mtime }`), only for sites with a capture.
   *  Absent from an older server; see {@link adminSitePreviewUrl}. */
  previewVersions?: Record<string, number>;
  currentSite: AdminSiteBinding;
  /** The site name a previous Activate persisted to `.env`, pending a restart — `null` when none. */
  persistedSiteName: string | null;
  /** The admin password a new site gets when the create form's password is left blank. Sent only
   *  when switching is enabled; absent from an older server. Never written in this bundle. */
  starterAdminPassword?: string;
}

/** The `201` body of `POST .../system/sites`. */
export interface AdminCreatedSite {
  name: string;
  dir: string;
  siteId: string;
}

/** What happened to the create request's `agentPluginTokens`: `saved` = sealed into the new site,
 *  connected on its first start; `failed` = the site exists but the tokens were not kept. */
export interface AdminCreatedSiteAgentPluginTokens {
  status: "none" | "saved" | "failed";
  pluginIds: string[];
}

/** One installed Agent Plugin the create form can connect with a pasted access token
 *  (`GET .../system/sites/token-sign-in-plugins`). */
export interface AdminTokenSignInPlugin {
  pluginId: string;
  displayName: string;
  /** The plugin's own page for creating a token. */
  helpUrl: string;
}

/** The `200` body of `POST .../system/sites/:name/activate`. Nothing was killed, signalled, or
 *  re-exec'd — `restartInstructions` is the server's own prose for what the human must now do, and
 *  the screen renders it verbatim rather than hardcoding a second copy. */
export interface AdminSiteActivation {
  ok: boolean;
  /** Warm switch destination; navigate to this site's own origin. */
  url?: string;
  restarting?: boolean;
  activeSiteName: string;
  restartRequired: boolean;
  restartInstructions: string;
}

/** Mirrors `DockerfileSourceSnapshot` in `apps/website/src/server/inbound/admin-http/routes/system/dockerfile-source.ts`. */
export interface AdminDockerfileSource {
  exists: boolean;
  contents: string | null;
  /**
   * A content-derived optimistic-concurrency token, read from the response's own `ETag` header —
   * NOT a field the server's JSON body carries (see `dockerfile-source.ts`'s server-side header for
   * why the etag travels only via the header). `getDockerfileSource`/`setDockerfileSource` below
   * both merge it in from the raw `Response` before resolving.
   *
   * Pass this back as `ifMatch` to `setDockerfileSource` (sent as the `If-Match` request header) to
   * prove a write is based on the CURRENT contents. A stale or missing value is refused — `412`
   * (with the real current contents in the error body to reconcile against) or `400` respectively —
   * rather than silently overwriting a concurrent edit (Terra audit finding C5, 2026-08-15: a human
   * in this admin tab and the AI assistant's `deployment_set_dockerfile` tool can both write the
   * same file).
   */
  etag: string;
}

/** Mirrors `ExportRunStatus` in `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`. */
export type AdminExportRunStatus = "idle" | "running" | "completed" | "errored";

/** Mirrors `ExportRunSnapshot` in `apps/website/src/server/inbound/admin-http/routes/system/export-site.ts` — see that
 *  type's own doc comments for why it is a slim, JSON-safe summary rather than the full
 *  `ExportReport` (no route/asset bytes ever cross this boundary). */
export interface AdminExportRunSnapshot {
  status: AdminExportRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  outputDir: string | null;
  basePath?: string;
  ok?: boolean;
  counts?: { routesSucceeded: number; routesFailed: number; assetsSucceeded: number; assetsFailed: number };
  failedRoutes?: { path: string; kind: string; reason: string }[];
  failedAssets?: { url: string; reason: string }[];
  skippedManifestEntries?: { reason: string; detail: string }[];
  unreferencedThemeFiles?: string[];
  basePathRewriteWarning?: string;
  error?: string;
}

/** A deploy target's id — whatever the server's deploy registry (the `deploy` agent plugin's
 *  descriptors) lists. Never a closed union: the admin learns the set from
 *  {@link AdminPublishTargetDescriptor}, so a host the plugin adds needs no admin change. Kept as an
 *  alias of {@link AdminPublishCredentialProviderId}: a saved credential is keyed by the same id. */
export type AdminStaticPublishTargetId = AdminPublishCredentialProviderId;

/** A plugin descriptor's translations of its own text: locale, then the English string, then its
 *  translation. Mirrors the server's `DescriptorI18n`; `lib/descriptor-i18n.ts` applies it. */
export type AdminDescriptorI18n = Record<string, Record<string, string>>;

/** One named string field a person fills in — mirrors the server's `DeployTargetFieldSpec`. */
export interface AdminPublishTargetField {
  name: string;
  label: string;
  required?: boolean;
  /** The agent's hint; the form shows {@link userHelp} when present. */
  help?: string;
  /** The person-facing help under the input. */
  userHelp?: string;
  /** Never echoed back once saved (credential fields only). */
  secret?: true;
}

/** A host's saved-credential form as `GET .../system/publish-targets` returns it (field specs and
 *  help only, never a value). `tokenField` names the field that is the token. */
export interface AdminPublishTargetCredentialSpec {
  /** The agent's guidance; the form shows {@link userHelp} when present. */
  help?: string;
  /** The same guidance written for the person. */
  userHelp?: string;
  /** The company whose console issues and revokes the token, when it differs from the host's own
   *  label (a host named for a place, not a vendor). */
  vendorLabel?: string;
  tokenField: string;
  /** Where the person creates a token for this host. */
  tokenPageUrl?: string;
  fields: AdminPublishTargetField[];
}

/** One publish target from the deploy registry: its display label, the per-publish config fields
 *  (a repository, a team), its credential form, and the per-host label/help for the publish's
 *  `projectName` (absent: the host takes no project name, so the admin hides that field). */
export interface AdminPublishTargetDescriptor {
  id: AdminStaticPublishTargetId;
  label: string;
  configFields: AdminPublishTargetField[];
  credential?: AdminPublishTargetCredentialSpec;
  projectName?: { label: string; help?: string };
  i18n?: AdminDescriptorI18n;
}

/** A publish's target plus its descriptor-declared config values (blank optional values already
 *  dropped). The server derives `basePath` itself; there is no field here to set one. */
export interface AdminStaticPublishConfig {
  target: AdminStaticPublishTargetId;
  fields: Readonly<Record<string, string>>;
}

/** Mirrors `StaticPublishOutcome` (same file) — the terminal result of one publish attempt, present
 *  on an {@link AdminPublishRunSnapshot} once `status` is `"completed"` or `"errored"`. */
export type AdminStaticPublishOutcome =
  | { ok: true; targetId: AdminStaticPublishTargetId; url: string; status: string; deploymentId?: string; basePath?: string }
  | { ok: false; code: "INVALID_CONFIG" | "NO_CREDENTIALS_CONFIGURED" | "EXPORT_FAILED" | "PROVIDER_ERROR"; message: string };

/** Mirrors `PublishRunStatus` in `apps/website/src/features/deployments/static-publish/publish-run.ts`. */
export type AdminPublishRunStatus = "idle" | "running" | "completed" | "errored";

/** Mirrors `PublishRunSnapshot` (same file) — the trigger+poll run slot for a publish to a
 *  static host, independent of {@link AdminExportRunSnapshot}'s own run slot (a plain export and a
 *  publish are different server-side operations with their own process-local state). */
export interface AdminPublishRunSnapshot {
  status: AdminPublishRunStatus;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  target: AdminStaticPublishTargetId | null;
  /** Present only once `status` is `"completed"` or `"errored"`. */
  result?: AdminStaticPublishOutcome;
  /** Present only on the rare path where the route itself failed unexpectedly — never echoes the
   *  raw error object. */
  error?: string;
}

/** One place this site was published or deployed to before, as `GET .../system/publish/destinations`
 *  lists it (`static-publish/publish-history.ts`'s `PublishDestination`), newest first. Labels and
 *  target ids are the server's; no secret is ever in a row (`credentialId` names a saved connection). */
export type AdminPublishDestination =
  | {
      id: string;
      kind: "static";
      lastPublishedAt: string;
      label: string;
      url: string;
      target: AdminStaticPublishTargetId;
      projectName: string;
      credentialId?: string;
      configFields: Readonly<Record<string, string>>;
    }
  | { id: string; kind: "tovu-peer"; peerId: string; label: string; url: string; lastPublishedAt: string }
  | {
      id: string;
      kind: "deploy";
      /** `started` = the host accepted the deploy but nothing confirmed it landed. */
      status: "started" | "confirmed";
      statusMessage?: string;
      target: string;
      label: string;
      url: string;
      lastPublishedAt: string;
      /** The saved Tovu peer at this deploy's address, when there is one: content publishes there. */
      linkedPeerId?: string;
    };

/** Mirrors the JSON shape `GET .../system/publish/preview` returns — see that route's own doc
 *  comment in `publish-site.ts`. A pure read: never starts a run, never echoes a credential's value,
 *  only whether one is configured. */
export interface AdminStaticPublishPreview {
  target: AdminStaticPublishTargetId;
  valid: boolean;
  validationError: string | null;
  /** `/${repo}` for a host that serves under a repository subpath, `null` for a root-served host or an invalid config — always SERVER-derived,
   *  never something the caller supplied. */
  basePath: string | null;
  credentialsConfigured: boolean;
  credentialGuidance: string | null;
  willInjectNojekyll: boolean;
}

/** A publish credential's provider id — the deploy target id it publishes with (see
 *  {@link AdminStaticPublishTargetId}). An open string: the server's deploy registry owns the set. */
export type AdminPublishCredentialProviderId = string;

/**
 * One saved connection as the credential-management UI is allowed to see it — mirrors the server's
 * `GET/POST/PUT .../system/publish/credentials` response shape verbatim, field names included.
 *
 * `configured` is always `true`: every row this list can ever contain already has a sealed secret
 * behind it, so the field exists only to keep this type structurally distinct from a
 * not-yet-configured provider row (there is no "draft" or "pending" state client-side).
 *
 * Nothing here can reconstruct the credential itself, ON PURPOSE — no token, no ciphertext, and
 * deliberately no masked suffix either (the design doc explicitly recommends against even a last-4
 * hint: label + `updatedAt` identify a connection well enough). See `use-publish-credentials.hooks.ts`'s
 * header for what "never readable back" means for the edit flow.
 */
export interface AdminPublishCredentialSummary {
  credentialType: "vendor" | "custom";
  worksFor: string[];
  readonly tokenHint?: CredentialTokenHint | null;
  id: string;
  providerId: AdminPublishCredentialProviderId;
  label: string;
  configured: true;
  /** Whether THIS connection is the one `triggerPublish` uses for its `providerId` when a workspace
   *  has saved more than one — server-owned, never derived client-side. Exactly one credential per
   *  provider is `true` at a time (the server enforces the invariant on every write); a provider with
   *  only one saved connection still carries a real value here, it is just never worth showing UI
   *  chrome about (see `StaticSiteTab.tsx`'s credential-list header for why). */
  isDefault: boolean;
  /** ISO timestamp. Field name matches the wire contract verbatim (not this file's usual `...AtIso`
   *  suffix) — see this interface's own doc for why matching the contract exactly, rather than
   *  renaming to local convention, is what keeps this boundary correct against a concurrently-built
   *  server. */
  createdAt: string;
  /** ISO timestamp — see {@link createdAt}'s doc for the naming note. This is the one fact the UI
   *  leans on to tell two saves of the same connection apart, in place of any secret material. */
  updatedAt: string;
  /** The verified account's public login/username (the host's own account field), healed onto
   *  this row server-side (migration `0044`) whenever a verify comes back `"valid"` with one — see
   *  `src/features/deployments/publish-credentials/store.ts`'s `healAccountLabel` doc. `null` until
   *  the first successful verify, and NEVER cleared by a verify that merely fails to reach the
   *  provider (a stale account name is still more useful than none) — only replacing the connection
   *  (a new token) resets it, since the old account label may no longer apply. This is what lets
   *  `StaticSiteTab.tsx`'s connected-credential row keep showing "connected as X" across a server
   *  restart, when the in-memory-only `AdminPublishCredentialVerification` result from a given
   *  request is long gone. */
  accountLabel: string | null;
}

/**
 * One `POST .../credentials/:id/verify` (or the same-shaped best-effort check a create/update already
 * runs) result, as the admin is allowed to see it — mirrors the server's
 * `PublishCredentialVerificationResult` (`src/features/deployments/static-publish/verify.ts`)
 * verbatim. `status` is a closed three-way enum, never a boolean — `"unreachable"` (could not reach
 * the provider at all) must stay distinguishable from `"invalid"` (the provider was reached and
 * rejected the credential) at this boundary too, same reason the server type's own doc gives.
 */
export interface AdminPublishCredentialVerification {
  status: "valid" | "invalid" | "unreachable";
  message: string;
  /** ISO timestamp of this specific check — NOT persisted anywhere the row itself carries forward;
   *  only `AdminPublishCredentialSummary.accountLabel` survives past this one response. */
  checkedAt: string;
  /** Present only on a `"valid"` result for a provider whose success response carries one — see
   *  {@link AdminPublishCredentialSummary.accountLabel}'s doc for how this becomes durable. */
  accountLabel?: string;
}

/** The body a create/update sends to configure ONE provider's connection: its id plus the flat
 *  string fields that host's credential descriptor declares ({@link AdminPublishTargetCredentialSpec}).
 *  The server validates them against the descriptor and drops undeclared keys. */
export type AdminPublishConnectionInput = { providerId: AdminPublishCredentialProviderId } & Readonly<Record<string, string>>;

/**
 * The server's own execution capability for THIS instance — never derived client-side from
 * `NODE_ENV`, a PATH probe, or any other sniffing. `"self-hosted-cli"` means the operator's own
 * machine already has a working CLI/env path (no token needed here); `"hosted-api-only"` means this
 * workspace cannot reach the operator's terminal at all, so a stored credential is the only way
 * `triggerPublish` can ever succeed. Drives the credential section's disclosure in
 * `StaticSiteTab.tsx` — see that component's own header there.
 */
export type AdminPublishExecutionMode = "self-hosted-cli" | "hosted-api-only";

/** Mirrors `GET .../system/publish/credentials`'s response shape. */
export interface AdminPublishCredentialsSnapshot {
  credentials: AdminPublishCredentialSummary[];
  executionMode: AdminPublishExecutionMode;
}

/** Mirrors `resolveRuntimeMode()`'s own closed union (`contracts/core/runtime-mode.ts`) — the
 *  site key tab's own copy of "is this a production deployment" (the fact that decides whether
 *  the generate action can matter at all — see `AdminSiteKeyStatus`'s doc). */
export type AdminSiteKeyRuntimeMode = "production" | "local";

/**
 * Mirrors `SiteKeyState` (`apps/website/src/contracts/core/site-key-state.ts`) — the site-key
 * plan §A.6 5-state set `GET .../system/site-key`'s `state` field now carries. Hand-declared
 * rather than imported: that file isn't wired into this app's `@tovu/*` tsconfig/vite path-alias
 * list yet (see its own header comment — a later admin-side slice does that; this one only needs a
 * stable value to read). `ADMIN_SITE_KEY_STATES` is the runtime source of truth this type is
 * derived from — `lib/__tests__/site-key-state-parity.unit.test.ts` reads the server source
 * file's own union text off disk and checks it against this list, so the two can never silently
 * drift apart. Keep both edited together.
 */
export const ADMIN_SITE_KEY_STATES = ["active", "missing", "missing-with-data", "mismatch", "invalid"] as const;
export type AdminSiteKeyState = (typeof ADMIN_SITE_KEY_STATES)[number];

/** Mirrors `GET .../system/site-key`'s response shape (`inspectSiteKeyMaterial`, server-side).
 *  NEVER carries the key value itself — only whether one is active, which of the two possible
 *  sources it came from, and a one-way `fingerprint` a human can use to recognize "same key as
 *  before" across a reload without revealing it. Call `api.revealSiteKey()` for the actual
 *  value, behind its own explicit action. */
export interface AdminSiteKeyStatus {
  envVarName?: string;
  reason?: "empty" | "not-hex" | "odd-length" | "too-short";
  active: boolean;
  source: "env" | "file" | "none";
  fingerprint?: string;
  /** `true` when a source was found but is not valid hex — `active` is `false` in this case too. */
  invalid?: boolean;
  /** Where a generated file lives (or would live) — not secret, a fixed filesystem convention.
   *  Always present, even when `source` isn't `"file"`, so a `"none"` status can still say where
   *  Generate would write. */
  keyFilePath: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
  /** Site-key plan §A.6 — see {@link AdminSiteKeyState}'s own doc for what each value means. */
  state: AdminSiteKeyState;
}

/** `POST .../system/site-key/generate`'s success outcomes: `already-active` (200, a key matching
 *  the site's stamp was already in place, nothing written), `recovered` (200, the stamped key was
 *  found in another source and adopted), `created` (201, no sealed data, a new key minted). */
export type AdminSiteKeyGenerateOutcome = "already-active" | "recovered" | "created";

/** Mirrors `POST .../system/site-key/generate`'s `200`/`201` response shape. Deliberately has NO
 *  `hex` field (sol finding 3-2, 2026-09-16 fix): `useSiteKey`'s `generate()` only ever reads
 *  `fingerprint`/`keyFilePath`/`runtimeMode` from this response, so the server stopped sending the
 *  raw key value here — it had no consumer and was pure exposure. `api.revealSiteKey()` (below)
 *  stays the one, explicit, on-purpose call that returns the value; `AdminSiteKeyStatus` (the
 *  plain `GET`) never carries it either. */
export interface AdminGeneratedSiteKey {
  outcome: AdminSiteKeyGenerateOutcome;
  fingerprint: string;
  keyFilePath: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

/** `POST .../system/site-key/import`'s 200: the pasted token is now this site's key. `resealed`
 *  counts credentials saved under the key that was in place and moved onto the token. */
export interface AdminImportedSiteKey {
  outcome: "unlocked";
  fingerprint: string;
  keyFilePath: string;
  resealed: number;
  restorePointId?: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

/** A webhook whose signing secret changes when the site starts fresh. */
export interface AdminSiteKeyAffectedWebhook {
  label: string;
  targetUrl: string;
}

/** `GET .../system/site-key/start-fresh`: what confirming would do, in one plain sentence. */
export interface AdminSiteKeyStartFreshPreview {
  removes: number;
  affectedWebhooks: AdminSiteKeyAffectedWebhook[];
  detail: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

/** `POST .../system/site-key/start-fresh`'s 200. The new key is never in the body. */
export interface AdminStartedFreshSiteKey {
  outcome: "started-fresh";
  fingerprint: string;
  keyFilePath: string;
  discarded: number;
  kept: number;
  restorePointId: string;
  affectedWebhooks: AdminSiteKeyAffectedWebhook[];
  runtimeMode: AdminSiteKeyRuntimeMode;
}

/** Mirrors `POST .../system/site-key/reveal`'s response shape — {@link AdminSiteKeyStatus}
 *  plus the raw value when one is active. `hex` is absent when `active` is `false` (nothing to
 *  reveal). */
export interface AdminRevealedSiteKey extends AdminSiteKeyStatus {
  hex?: string;
}

/**
 * A source-control host's id. The hosts come from plugins (`GET .../system/source-control/providers`),
 * so this is any string; a saved connection may name a host whose plugin is now off. Deliberately its
 * own type, NOT {@link AdminPublishCredentialProviderId}: a source host is not a publish target.
 */
export type AdminSourceControlProviderId = string;

/** A source-control host's credential form as a plugin declares it: field specs and help only.
 *  `tokenField` names the secret field that is the token. */
export interface AdminSourceControlCredentialForm {
  help?: string;
  tokenPageUrl?: string;
  tokenField: string;
  fields: AdminPublishTargetField[];
}

/** One listed source-control host. No `credential` means a single "Access token" field. */
export interface AdminSourceControlProviderDescriptor {
  id: AdminSourceControlProviderId;
  label: string;
  credential?: AdminSourceControlCredentialForm;
  i18n?: AdminDescriptorI18n;
}

/** Mirrors `GET .../system/source-control/providers`: the hosts switched-on plugins declare, and
 *  each host an installed but switched-off plugin declares. */
export interface AdminSourceControlProvidersSnapshot {
  providers: AdminSourceControlProviderDescriptor[];
  switchedOff: { id: AdminSourceControlProviderId; pluginId: string }[];
}

/**
 * One saved connection's non-secret summary — never carries the token itself, and (like
 * {@link AdminPublishCredentialSummary}) deliberately carries no masked/last-4 hint either. A
 * stored token is never read back once saved; this is the fact a row's UI has to render its
 * connected/not-connected state from.
 */
export interface AdminSourceControlCredentialSummary {
  readonly tokenHint?: CredentialTokenHint | null;
  readonly id: string;
  readonly providerId: AdminSourceControlProviderId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What a create/update call sends: the host id, the token, and the host's other declared
 *  credential fields by name. */
export type AdminSourceControlConnectionInput = { providerId: AdminSourceControlProviderId; token: string } & Record<string, string>;

/** Mirrors `GET .../system/source-control/credentials`'s response shape. No `executionMode` field
 *  here — unlike static publish, this page has no CLI-vs-hosted distinction to disclose. */
export interface AdminSourceControlCredentialsSnapshot {
  // Mutable array, not `readonly` — `useSourceControlCredentials` seeds local `useState` from this
  // field directly, and a `readonly` array there is not assignable to that mutable state without a
  // cast (same reasoning `AdminPublishCredentialsSnapshot.credentials` follows implicitly by also
  // being mutable).
  credentials: AdminSourceControlCredentialSummary[];
}

/**
 * The Access Tokens page's own category-filter ids, minus `"all"` — mirrors
 * `apps/admin/src/features/security/rules.ts`'s `AccessTokenRowCategoryId` exactly, and
 * `src/features/custom-credentials/types.ts`'s server-side `CustomCredentialCategoryId` (server
 * code never imports from the admin app, so this is the client-side twin, not a re-export).
 */
export type AdminCustomCredentialCategoryId = "source-control" | "hosting" | "media" | "ai" | "ops" | "general";

/**
 * One saved custom-provider credential's non-secret summary (`apps/website/src/server/inbound/admin-http/routes/system/
 * custom-credentials.ts`) — never carries the token or username. Unlike
 * {@link AdminSourceControlCredentialSummary}, `baseUrl`/`category` ARE part of this summary: both
 * are stored in the clear server-side specifically so the Access Tokens list can group/filter a
 * custom row without decrypting it (see `src/platform/db/schema.sqlite.ts`'s `customCredentialSets` doc).
 */
export interface AdminCustomCredentialSummary {
  readonly scope?: "project" | "site";
  readonly usedBy?: readonly string[];
  readonly usedByThisSite?: boolean;
  readonly credentialType: "vendor" | "custom";
  readonly worksFor: string[];
  readonly tokenHint?: CredentialTokenHint | null;
  readonly id: string;
  readonly label: string;
  readonly category: AdminCustomCredentialCategoryId;
  readonly baseUrl: string;
  /** Extra allowed origins beyond `baseUrl` (e.g. a provider whose API spans two
   *  hosts for one account) — mirrors `src/features/custom-credentials/types.ts`'s server-side
   *  `CustomCredentialSummary.additionalHosts` (2026-08-31 multi-host widening). Empty, never
   *  `undefined` — the server's own read path normalizes a `null` column to `[]`. */
  readonly additionalHosts: readonly string[];
  /** The credential's saved account login, when it has one — mirrors the server's
   *  `CustomCredentialSummary.username` (2026-09-01, when the field moved out of the sealed blob
   *  onto its own plaintext column). Absent, never `""`, for a credential without one. This is what
   *  lets the Access Tokens edit form prefill a saved username instead of rendering it blank. */
  readonly username?: string;
  readonly configured: true;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What a custom-provider create/update call sends for its secret half — no provider dispatch
 *  (unlike {@link AdminSourceControlConnectionInput}): a custom row has no fixed provider identity,
 *  the operator-typed `label` already names it. `username` is always optional, never required. */
export interface AdminCustomConnectionInput {
  readonly token: string;
  readonly username?: string;
}

/** Mirrors `GET .../system/custom/credentials`'s response shape. */
export interface AdminCustomCredentialsSnapshot {
  credentials: AdminCustomCredentialSummary[];
  projectKeysAvailable?: boolean;
}


/** Mirrors `PublishDestinationView` in `src/server/inbound/admin-http/routes/publish-content/
 *  destination.ts` — the zero-setup connect action's own response shape. Defined here rather than
 *  re-exported from `@tovu/publish-content-ui` because the destination flow is admin-only: unlike
 *  the plan/confirm/execute contract, no peer-side code shares this shape. */
export interface AdminPublishDestinationView {
  /** `true` once this computer's grant has been written for a site. */
  connected: boolean;
  /** The connected site, as the publish list already models it. `null` when there is none. */
  site: PublishContentPeerSummary | null;
  /** Read out of the repo's deploy config — what to offer when nothing is connected yet. */
  candidateUrl: string | null;
  /** One sentence describing where things stand. */
  message: string;
  /** One sentence naming what the owner does next, or `null` when nothing is pending. */
  nextStep: string | null;
}

/** Mirrors `@jini-ai/ui`'s `ExecutionTab` `DetectedAgent` shape — see
 *  `apps/website/src/server/inbound/admin-http/routes/assistant/detect-agents.ts`'s `toExecutionTabAgent`.
 *
 *  Each model's `reasoning` mirrors `@jini-ai/agent-runtime`'s `RuntimeModelOption.reasoning`
 *  (`packages/agent-runtime/src/types.ts` in Jini) — a model's OWN effort levels, narrowed to
 *  `{id,label}` the same way every other field on this interface narrows its Jini counterpart.
 *  `undefined` means the runtime doesn't report per-model levels for this agent (Codex today);
 *  it is never defaulted to `[]`, which would misreport "unknown" as "this model supports zero" —
 *  see `toExecutionTabAgent`'s `projectModelReasoning` for the same rule on the wire side. No
 *  `@jini-ai/ui` picker reads this yet; it exists so a future one can narrow the "Reasoning effort"
 *  control to the SELECTED model instead of `reasoningOptions`' agent-wide union. */
export interface AdminExecutionDetectedAgent {
  discoveryPending?: boolean;
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  path?: string;
  models?: Array<{ id: string; label: string; reasoning?: Array<{ id: string; label: string }> }>;
  modelsSource?: "live" | "fallback";
  authStatus?: "ok" | "missing" | "unknown";
  authMessage?: string;
}

/**
 * Mirrors `src/assistant/public-assistant-settings.ts`'s `PublicAssistantSettings`.
 *
 * `publicEnabled: false` is a hard off — the public page ships no assistant bundle and exposes no
 * assistant endpoint. It is NOT a client-side visibility flag, and nothing in this admin app should
 * ever treat it as one; see that module's header for the contract in full.
 */
export interface PublicAssistantSettings {
  publicEnabled: boolean;
  /** Optional while older servers and cached responses still carry only the switch. */
  widget?: "react" | "vanilla";
}

/**
 * Mirrors `src/assistant/site-credential-store.ts`'s `SiteAssistantCredentialView` (ADR-058) — the
 * SITE's provider credential, the one a DEPLOYED server uses to answer anonymous visitors.
 *
 * Write-only by design: there is no field here that could carry key material back to the browser,
 * and that is the point rather than an omission. `isSet` answers "is a key stored", `masked` answers
 * "which one" (last 4 characters behind `••••`), and neither is reversible. If a future route ever
 * needs to return the key itself, it needs its own type — do not widen this one.
 */
export interface SiteAssistantCredential {
  isSet: boolean;
  masked: string | null;
  tokenHint?: CredentialTokenHint | null;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  updatedAt: string | null;
}

/** PUT body for the site credential. Every field is optional and OMITTED MEANS "leave alone" — an
 *  absent `apiKey` preserves the stored key, which is what lets a caller persist a model or base-URL
 *  change without re-sending the secret. An empty-string `apiKey` is REJECTED by the server (400);
 *  clearing the key is `deleteAssistantSiteCredential`, not an empty PUT. */
export interface SiteAssistantCredentialPatch {
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Mirrors `src/assistant/execution-credential-store.ts`'s `AdminExecutionCredentialView` — the
 * ADMIN's OWN BYOK credential, scoped to `(workspace, this admin)`. A DIFFERENT credential from
 * {@link SiteAssistantCredential} (that one is per-workspace and answers anonymous visitors; this
 * one is per-admin and only ever powers this admin's own dock/Execution-mode BYOK). See
 * `execution-credential-store.ts`'s file header for why the two must never merge.
 *
 * Write-only by design, same as `SiteAssistantCredential`: no field here can carry key material
 * back to the browser. `protocol`/`providerId`/`baseUrl`/`model`/`maxTokens` mirror `ByokConfig`
 * (minus `apiKey`/`savedByProviderId`) so the stored view maps onto the form with no translation.
 */
export interface AdminExecutionCredential {
  isSet: boolean;
  masked: string | null;
  tokenHint?: CredentialTokenHint | null;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
  updatedAt: string | null;
}

/** PUT body for the admin's own execution credential. Same "omitted means leave alone, empty
 *  `apiKey` is rejected" contract as {@link SiteAssistantCredentialPatch} — see that type's doc. */
export interface AdminExecutionCredentialPatch {
  apiKey?: string;
  protocol?: string;
  providerId?: string | null;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

/** Mirrors `src/seo/types.ts`'s `SeoSettings`/`RobotsRule` (SPEC-008). */
export interface RobotsRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
}

export interface SeoSettings {
  titleTemplate: string;
  defaultDescription?: string;
  defaultOgImage?: string;
  twitterSite?: string;
  defaultRobots: { noindex: boolean; nofollow: boolean };
  sitemapEnabled: boolean;
  robotsRules: RobotsRule[];
}

/**
 * The shape `setSeoSettings` accepts — `Partial<SeoSettings>` with the three nullable-on-write
 * scalars widened to also allow `null`.
 *
 * Same vocabulary as {@link SeoEntryOverridesPatch}: `null` CLEARS the site default (the server's
 * `SEO_DEFINITIONS` register these three as `nullable: true` and `buildScalarWrites` normalizes
 * `null` to its `""` absent-sentinel, which `getSeoSettings` reads back as `undefined`), while an
 * omitted key means "leave unchanged" — `setSeoSettings` is a merge, and `buildScalarWrites` skips
 * every `undefined` key outright. `SeoSettings` itself stays un-widened because it is also the
 * RESPONSE shape, where these three are only ever `string | undefined`.
 */
export type SeoSettingsPatch = Partial<Omit<SeoSettings, "defaultDescription" | "defaultOgImage" | "twitterSite">> & {
  defaultDescription?: string | null;
  defaultOgImage?: string | null;
  twitterSite?: string | null;
};

/**
 * Per-entry SEO (SPEC-008, mirrored from `src/seo/types.ts` per SPEC-037 REQ-06/07 — read
 * directly off `SeoMeta`/`SeoAnalysis`/`SeoIssue`, not guessed).
 */
export type SeoOpenGraphType = "website" | "article" | "profile";
export type SeoTwitterCardKind = "summary" | "summary_large_image";

export interface SeoOpenGraph {
  title: string;
  description?: string;
  type: SeoOpenGraphType;
  url: string;
  image?: string;
  siteName?: string;
}

export interface SeoTwitterCard {
  card: SeoTwitterCardKind;
  title: string;
  description?: string;
  image?: string;
  site?: string;
}

/** Mirrors `src/seo/types.ts`'s `SeoMeta` — the fully-resolved effective meta for one entry
 * (author overrides layered over site defaults layered over derived-from-entry). Both
 * `getSeoEntry` and `putSeoEntry` return this same resolved shape (not the raw override bag). */
export interface SeoEntryMeta {
  title: string;
  description?: string;
  canonical: string;
  robots: { noindex: boolean; nofollow: boolean };
  openGraph: SeoOpenGraph;
  twitter: SeoTwitterCard;
  jsonLd: Record<string, unknown>[];
}

/**
 * Mirrors `Jini packages/cms/src/seo/types.ts`'s `SeoExtFields` — the per-entry override
 * fields themselves. (The old comment here said "Mirrors `src/seo/types.ts`'s `SeoExtFields` — the
 * partial override bag `putSeoEntry` accepts", which had been wrong on both halves since
 * `eb10f5de`: the path moved, and the shape the route accepts is `SeoExtFieldsPatch`, not
 * `SeoExtFields`. See {@link SeoEntryOverridesPatch} below.)
 */
export interface SeoEntryOverrides {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  nofollow?: boolean;
  schemaType?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: SeoOpenGraphType;
  twitterCard?: SeoTwitterCardKind;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Mirrors that same file's `SeoExtFieldsPatch` — the bag `putSeoEntry` actually accepts, which
 * widens every field to also allow `null`.
 *
 * `null` means REMOVE this override, so resolution falls back through the site default to the
 * derived value; `undefined` (an omitted key) still means "leave unchanged". This distinction is
 * the whole point of the type: `setEntrySeoOverrides` (`write-service.ts`) stores `""` as a
 * genuine override, and `getEntryMeta` (`Jini packages/cms/src/seo/seo.ts`) resolves overrides with `??`, so an
 * override of `""` BEATS the site default and pins the entry to a blank. Before this widening the
 * admin could only ever send `""`, which is how a post reached `{"description":""}` with no way
 * back from the UI.
 */
export type SeoEntryOverridesPatch = { [K in keyof SeoEntryOverrides]?: SeoEntryOverrides[K] | null };

export type SeoIssueSeverity = "error" | "warning" | "info";

/** Mirrors `src/seo/types.ts`'s `SeoIssue`. */
export interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
  field?: string;
}

/** Mirrors `src/seo/types.ts`'s `SeoAnalysis` — `analyzeEntry`'s return shape. */
export interface SeoEntryAnalysis {
  entryId: string;
  score: number;
  issues: SeoIssue[];
  resolved: SeoEntryMeta;
}

/** Safe readiness for markers already on a page, without templates, paths or credentials. */
export interface AdminPagePluginEmbed {
  plugin: string;
  displayName?: string;
  component: string;
  availability: string;
}

/** First Save's complete snapshot; creation owns one atomic row/revision write. */
export type AdminPostCreateInput = Pick<AdminPost, "title"> & Partial<Pick<AdminPost,
  "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage" | "publishAt" | "featuredMediaId" | "author" | "showAuthor"
>> & { hideCoverImageInBody?: boolean };

export interface AdminPost {
  /** Derived from the revision ledger for editor URL stability after unpublishing. */
  everPublished?: boolean;
  author?: string | null;
  showAuthor?: boolean;
  id: string;
  workspaceId: string;
  // Was missing from this client-side type even though `toHeadlessPost` (apps/website/src/server/inbound/public-http/http/shared/post.ts)
  // has always sent it — added here because PostEditor's delete affordance needs to tell a post
  // apart from a page (for confirm-dialog wording and for which list to return to) and every field
  // it needs already ships on the wire.
  kind: "post" | "page";
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  /**
   * SPEC-047 — which body column this entry actually carries. `"doc"` is a Tiptap document in
   * `bodyJson`; `"html"` is a bespoke, AI-generated Page whose real content is `bodyHtml`.
   *
   * Optional here only as prototype debt. The server already returns a proper discriminated union
   * (`headless/contracts.ts`, `apps/website/src/server/inbound/public-http/http/shared/post.ts`), and REQ-3 wants this type to mirror it
   * so that constructing Tiptap's props from an html-format entry is a COMPILE error rather than a
   * runtime branch. Widening this shared interface into a union touches every existing `AdminPost`
   * consumer, so for now `features/pages` narrows on `bodyFormat` explicitly and the compile-time
   * guarantee is owed, not delivered.
   */
  bodyFormat?: "doc" | "html";
  /** The bespoke HTML body — present only when `bodyFormat === "html"`. */
  bodyHtml?: string | null;
  status: "draft" | "published";
  updatedAt: string;
  version: number;
  /**
   * Post-template-picker feature (2026-08-10) — the active static theme's `pages/*.html` filename
   * (from `theme.json`'s `postTemplate` array) this post renders through, or `null` when unset.
   * Optional (matches `bodyFormat`/`bodyHtml`'s own precedent just above) so pre-feature test
   * fixtures across this app don't all need updating — the real API always sends a definite value.
   */
  templateChoice?: string | null;
  /**
   * Slug-collision override (2026-08-10, tri-state 2026-08-15) — `null` means this post never had an
   * explicit opinion set (the server resolver's current default policy applies, post-wins as of this
   * change); `true`/`false` is a permanent explicit author choice that always wins over the default.
   * Optional, same migration-safety precedent as `templateChoice` just above.
   */
  overridesThemePage?: boolean | null;
  /**
   * SPEC-005 REQ-11 plugin extension-field bag, keyed by plugin id then field name — already on the
   * wire (`toHeadlessPost` spreads it in only when a plugin wrote something), just never declared
   * here until the Content analysis card (AW-7 Tier 2) needed `ext["content-analyzer"].report`.
   * Absent, not `{}`, when no plugin contributed. Values are whatever the plugin's declared field
   * types allow, so readers must validate before use.
   */
  ext?: Record<string, Record<string, unknown>>;
  /** Scheduled publishing (2026-10-05) — ISO UTC go-live time. A published row whose `publishAt`
   *  is still in the future is hidden from the public site until then. Sent only when set. */
  publishAt?: string | null;
  /** Featured image (2026-10-05) — a media asset id; themes and og:image use it. Sent only when set. */
  featuredMediaId?: string | null;
}

export interface PresentationSettings {
  workspaceId: string;
  activeThemeId: string;
  updatedAt: string;
}

/**
 * The reserved `activeThemeId` meaning "the operator turned the theme OFF deliberately" — the site
 * renders unstyled and handles its own CSS. Never a theme id, and deliberately never present in
 * `availableThemeIds` (that list is a catalogue of themes an operator can PICK; this is a value the
 * API accepts, which is a different set — see `routes/presentation/get.ts`'s own note on the
 * asymmetry).
 *
 * Mirrored client-side rather than imported, same decoupling precedent as {@link ThemeTier} and
 * `rules.ts`'s `THEME_TIERS` — a browser bundle cannot import server internals. Canonical
 * definition: `apps/website/src/features/theme/active-theme.ts`'s `NO_THEME_ID`. BOTH sides pin the
 * exact literal in their own test suite (`features/theme/__tests__/active-theme.test.ts` and
 * `features/themes/__tests__/rules.unit.test.ts`), so changing one without the other turns a suite
 * red instead of silently splitting the sentinel in two.
 */
export const NO_THEME_ID = "none";

/**
 * ADR-020 capability tier, mirrored client-side from `#src/contracts/headless`'s `HeadlessThemeTier` —
 * same decoupling precedent as every other client-side type in this file that mirrors a wire
 * contract rather than importing server internals.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

/** Themes admin screen (2026-08-10) — one available theme's id plus its capability tier. */
export interface AdminThemeSummary {
  previewImageUrl?: string | null;
  id: string;
  /** `theme.json`'s display name (the server falls back to the id) — what the owner sees; the id
   *  stays the key. Optional so a response or test double without it still type-checks. */
  name?: string;
  tier: ThemeTier;
  /** Manifest schema version (`2`, or `undefined` for v1) — mirrored client-side from
   *  `#src/contracts/headless`'s `HeadlessThemeSummary.apiVersion` (2026-08-19 architecture audit finding 1),
   *  same decoupling precedent as `ThemeTier`'s own doc comment. Feeds `PostTemplateModal`'s "View
   *  Template" fetch, which needs to know whether this theme's page templates live under `pages/`
   *  or `render/pages/`. */
  apiVersion?: 2;
  /** Ships with the package (mirrors `HeadlessThemeSummary.builtIn`): the Themes card menu won't
   *  offer to delete it. Absent from older servers. */
  builtIn?: boolean;
}

export interface AdminMember {
  id: string;
  workspaceId: string;
  email: string;
  name?: string;
  status: "pending" | "active" | "disabled";
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AdminAnalyticsHit {
  occurredAt: string;
  kind: "pageview" | "event";
  path: string;
  referrerHost: string | null;
  deviceClass: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  browserFamily: string | null;
  eventName: string | null;
}

export interface AdminMenuTarget {
  kind: "entryRef" | "termRef" | "url" | "route";
  entryId?: string;
  termId?: string;
  taxonomy?: string;
  href?: string;
  route?: string;
}

/** Mirrors Jini `NavItemAttrs` (`packages/cms/src/navigation/types.ts:104-115`) — presentational,
 *  kept separate from `target` so the render model can pass them through without interpreting them. */
export interface AdminMenuItemAttrs {
  openInNewTab?: boolean;
  rel?: string;
  cssClass?: string;
  description?: string;
  icon?: string;
}

export interface AdminMenuItem {
  id: string;
  label?: string;
  target: AdminMenuTarget;
  attrs?: AdminMenuItemAttrs;
  children?: AdminMenuItem[];
}

export interface AdminMenu {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "trash";
  items: AdminMenuItem[];
  locations: string[];
  updatedAt: string;
  version: number;
  /** Authoring mode (Jini `NavMenuDoc.mode`): `"html"` renders {@link AdminMenu.html} at the theme's
   *  menu marker instead of the item tree. Absent on a menu never switched, which means `"items"`. */
  mode?: AdminMenuMode;
  /** The author's own menu markup, stored parse5-balanced; kept while the menu is in items mode. */
  html?: string;
}

export type AdminMenuMode = "items" | "html";

/** The optional authoring fields a menu create/update sends — omitted fields keep the stored value. */
export interface AdminMenuAuthoring {
  mode?: AdminMenuMode;
  html?: string;
}

// ---------------------------------------------------------------------------
// Widgets (SPEC-043, ADR-047) — mirrors AdminMenu's shape, the direct structural sibling
// ---------------------------------------------------------------------------

export type AdminWidgetType = "text" | "social-links" | "recent-entries" | "menu" | "contact-form" | "gallery" | "media";

export interface AdminWidget {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  status: "active" | "trash" | "purged";
  widgetType: AdminWidgetType;
  config: Record<string, unknown>;
  updatedAt: string;
  version: number;
}

export interface AdminWidgetWhereUsedReference {
  kind: "region" | "embed";
  sourceEntryId: string;
  fieldPath: string;
}

export interface AdminWidgetWhereUsed {
  count: number;
  references: AdminWidgetWhereUsedReference[];
}

export interface AdminWidgetPlacement {
  placementId: string;
  widgetEntryId: string;
  enabled: boolean;
  widgetTitle: string | null;
  widgetType: string | null;
  broken: boolean;
}

export interface AdminWidgetArea {
  id: string;
  workspaceId: string;
  regionKey: string;
  updatedAt: string;
  version: number;
}

export interface AdminWidgetRegionBinding {
  workspaceId: string;
  regionKey: string;
  areaEntryId: string;
  updatedAt: string;
  placementCount: number;
}

export interface AdminMedia {
  id: string;
  /** `"document"` for a private Library document, `"media"` for ordinary media. Legacy servers omit it. */
  kind?: "media" | "document";
  /** A document's immutable upload filename (its extension never changes); `null` for media. */
  originalFilename?: string | null;
  /** A document's display name: the editable `title` plus the original extension. */
  displayFilename?: string;
  /** Original blob bytes; null when unavailable. Legacy servers omit the field. */
  byteSize?: number | null;
  /** Read-only acting principal at creation; absent/null on legacy servers or assets. */
  createdBy?: string | null;
  workspaceId: string;
  title: string;
  /** Human-memorable, unique-per-workspace lookup key (2026-09-07) — auto-derived from `title` at
   *  upload, then independently editable here. Renaming `title` never changes this field; see
   *  `EditMediaPanel`'s slug field for the operator-facing edit surface. */
  slug: string;
  alt: string;
  caption: string;
  credit: string;
  sha256: string;
  status: "active" | "trashed";
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Quick-and-dirty public-render sizing override (owner-directed skip-the-ADR fix). `null` means
   *  "not set" — the public renderer omits the corresponding `<img>` attribute entirely rather than
   *  rendering `0` or a computed default. */
  width: number | null;
  height: number | null;
  cssClass: string | null;
  /**
   * Free-text HTML attributes (2026-09-07, owner-directed) threaded onto this asset's public
   * `<img>`/`<video>` tag — same "one string column, `null` means not set" shape as `cssClass`.
   * Raw, ALREADY-VALIDATED source text (e.g. `data-motion="fade-in" loading="lazy"`). This is a
   * stored-XSS boundary: the server re-validates against the same allowlist
   * (`features/media/rules.ts`'s `parseMediaHtmlAttributes`) on both write and render, so a
   * client-side check here is a UX convenience, never the enforcement itself.
   */
  htmlAttributes: string | null;
  /**
   * The asset's real media type, sniffed server-side from the stored bytes — never the content
   * type the browser reported at upload time. Drives the Media screen's "Images"/"Videos" tabs.
   *
   * `null` means "the server could not read this blob's bytes", NOT "unknown format": an
   * unrecognized file reports the real answer `"application/octet-stream"`. A `null` row is
   * therefore a genuine anomaly, and `filterMediaByTab` keeps it on the All tab rather than
   * dropping it from the screen.
   */
  contentType: string | null;
  /**
   * The asset's real, public `/m/...` URL (readable-slugs S5a, 2026-09-23) — keyed by its readable
   * slug when it has a valid one, otherwise its id. `null` for a trashed asset (never a link a
   * visitor would 404 on) or when no "public" core transform is registered yet. This is the URL
   * the Media edit panel shows/copies; it is NOT the same as the admin's own `mediaOriginalUrl`
   * preview URL below, which is an authenticated admin-only route.
   */
  publicUrl: string | null;
}

export interface AdminWebhookDeliverySummary {
  id: string;
  status: "pending" | "delivering" | "delivered" | "failed" | "dead" | "canceled";
  attempts: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface AdminWebhookSubscription {
  id: string;
  label: string;
  targetUrl: string;
  topics: string[];
  status: "active" | "paused" | "disabled";
  secretVersion: number;
  previousSecretVersion: number | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  lastDelivery: AdminWebhookDeliverySummary | null;
}

export interface AdminWebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  topic: string;
  status: AdminWebhookDeliverySummary["status"];
  attempts: number;
  nextAttemptAt: string;
  lastResponseStatus: number | null;
  lastError: string | null;
  signedWithVersion: number | null;
  createdAt: string;
  deliveredAt: string | null;
  deadAt: string | null;
}

export interface AdminIdentityUser {
  /** Server capability: the seeded owner cannot be renamed. */
  canRename?: boolean;
  isOwner?: boolean;
  isProtectedAccount?: boolean;
  principalId: string;
  workspaceId: string;
  username: string;
  email?: string;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt?: string;
  roleIds: string[];
  policyIds: string[];
}

export interface AdminRole {
  id: string;
  workspaceId: string;
  name: string;
  isBuiltin: boolean;
}

export interface AdminPolicy {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isBuiltin: boolean;
  isFrozen: boolean;
}

/** One permission row written onto a policy (OQ-10). Mirrors `identity`'s `PolicyPermissionRecord`
 *  — the shape `GET policies/:policyId/permissions` returns. `id` is what
 *  {@link adminApi.removePolicyPermission} deletes by; nothing else in the admin exposed it, which
 *  is why a policy's permission set used to be append-only from this UI. */
export interface AdminPolicyPermission {
  id: string;
  workspaceId: string;
  policyId: string;
  permission: string;
  resourceType?: string | null;
  constraintJson?: string | null;
}

/** SPEC-044 (Workspace Administration) — mirrors `apps/website/src/server/inbound/admin-http/http/workspace.ts`'s DTO. */
export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/**
 * SPEC-010 Forms (Tier-1 sample plugin) — client-side types mirroring `apps/website/src/server/inbound/admin-http/http/forms.ts`
 * + api.spec.md §5. Response envelopes use `{ data: ... }` (Forms' own contract shape), unlike the
 * `{ menu: ... }`/`{ member: ... }`-style envelopes elsewhere in this file.
 */
export interface AdminFormField {
  id: string;
  label: string;
  type: "text" | "email" | "textarea" | "checkbox";
  required: boolean;
  maxLength?: number | null;
  className?: string;
  attributes?: Record<string, string>;
}

export interface AdminFormNotify {
  enabled: boolean;
  recipients: string[];
}

export interface AdminFormDefinition {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  fields: AdminFormField[];
  notify: AdminFormNotify;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  mode?: "builder" | "html";
  html?: string;
}

export interface AdminFormSubmission {
  id: string;
  formDefinitionId: string;
  workspaceId: string;
  data: Record<string, string | boolean>;
  sourceIp: string;
  submittedAt: string;
}

/** Mirrors `apps/website/src/server/inbound/admin-http/http/redirects.ts`'s `AdminRedirectDto` (SPEC-009). */
export interface AdminRedirect {
  id: string;
  workspaceId: string;
  matchType: string;
  fromPattern: string;
  toTarget: string;
  statusCode: number;
  status: string;
  override: boolean;
  priority: number;
  source: string;
  sourceEntryId: string | null;
  fromPathAtCapture: string | null;
  toPathAtCapture: string | null;
  createdByPrincipal: string;
  createdByPluginId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AdminRedirectHitStats {
  redirectId: string;
  workspaceId: string;
  hitCount: number;
  lastHitAt: string | null;
}

/** One rule item accepted by `POST .../redirects/import` — mirrors `CreateRedirectInput`'s public
 * fields (`workspaceId`/`actorId` are injected server-side from the session, not sent). */
export interface RedirectImportRule {
  matchType: string;
  fromPattern: string;
  toTarget: string;
  statusCode: number;
  override?: boolean;
  priority?: number;
}

/** Mirrors `toAdminRedirectImportResponse`'s shape (`apps/website/src/server/inbound/admin-http/http/redirects.ts`) — the route
 * always answers `207 Multi-Status`, so this is a plain success body, not an error path. */
export interface AdminRedirectImportResponse {
  created: AdminRedirect[];
  failed: Array<{ index: number; code: string; message: string }>;
}

/**
 * Collections (ADR-022/ADR-043) — mirrors `Jini packages/cms/src/content-types/types.ts` +
 * `Jini packages/cms/src/entries/types.ts`. The 18 routes these types back were wired in the
 * "Session 5" backend-gap-closure pass (`progress-ledger.md`); see this file's own
 * per-method comments for exact response envelope shapes.
 */
/**
 * Hand-copied on purpose, not imported: `@jini-ai/cms/content-types` (the source of truth below)
 * is a barrel that also pulls in `write-service`/`lifecycle`/`repo.memory` — server-only code with
 * no place in this app's browser bundle. A plain hand-copy is exactly what drifted silently once
 * already, so this one is guarded by a runtime test instead of another silent copy:
 * `lib/__tests__/content-type-field-kind.sync.test.ts` imports Jini's own
 * `CONTENT_TYPE_FIELD_KINDS` (a test file never ships in the browser bundle, so the barrel's
 * server-only weight is harmless there) and fails loudly the moment this array and Jini's stop
 * being the same set.
 *
 * Mirrors `@jini-ai/cms`'s `packages/cms/src/content-types/types.ts` `CONTENT_TYPE_FIELD_KINDS`
 * (`ContentTypeFieldKind`, re-exported from `@jini-ai/cms/content-types`). Widened 2026-09-05 to
 * add `relation`/`json` (Jini `df1be096`) after the FIRST drift: this array had silently stayed at
 * the original 5 while Jini widened its enum, and `CollectionEntryEditor.tsx`'s `FIELD_CONTROLS`
 * lookup — keyed on this same union — returned `undefined` for either new kind and crashed on
 * render. See that file's `FIELD_CONTROLS` for the fix on that side.
 */
export const CONTENT_TYPE_FIELD_KINDS = ["text", "integer", "real", "boolean", "datetime", "relation", "json"] as const;
export type ContentTypeFieldKind = (typeof CONTENT_TYPE_FIELD_KINDS)[number];

export interface ContentTypeFieldDef {
  name: string;
  kind: ContentTypeFieldKind;
  required: boolean;
  queryable: boolean;
}

export type ContentTypeStatus = "active" | "deprecated" | "tombstone";

/** A content type's lifecycle transition (`POST /content-types/:key/lifecycle`). */
export type ContentTypeLifecycleOp = "deprecate" | "reactivate" | "tombstone";

export interface AdminContentType {
  workspaceId: string;
  key: string;
  label: string;
  fields: ContentTypeFieldDef[];
  status: ContentTypeStatus;
  version: number;
  tombstonedAt?: string | null;
}

export type EntryStatus = "draft" | "published" | "unpublished";

export interface AdminEntry {
  id: string;
  workspaceId: string;
  type: string;
  slug: string;
  status: EntryStatus;
  title: string;
  bodyJson: unknown | null;
  fieldsJson: unknown;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Categories & Tags (ADR-044) — mirrors `Jini packages/cms/src/taxonomy/write-service.ts`'s `Taxonomy`/`Term`.
 */
export interface AdminTaxonomy {
  id: string;
  name: string;
  hierarchical: boolean;
  status: string;
  updatedAt: string;
  version: number;
}

export interface AdminTerm {
  id: string;
  taxonomyId: string;
  parentId: string | null;
  name: string;
  status: string;
  updatedAt: string;
  version: number;
}

export interface AdminTaxonomyWithTerms {
  taxonomy: AdminTaxonomy;
  terms: AdminTerm[];
}

/** Database — Timeline (ADR-041 §1). Mirrors `features/database/timeline.ts`'s `LedgerRow`. */
export interface AdminLedgerRow {
  id: string;
  kind: string;
  createdAt: string;
  restorePointId: string | null;
  outcome: string;
}

export type RestorePointCostClass = "cheap" | "expensive" | "unavailable";

/** One persisted `restore_points` row (Database's and Recovery's shared list source). */
export interface AdminRestorePoint {
  id: string;
  trigger: string;
  costClass: string;
  kind: string;
  watermarkAtCapture: number | null;
  createdAt: string;
}

export interface AdminRestorePointSummary {
  id: string;
  costClass: RestorePointCostClass;
  kind: string;
}

/** Database — schema drift (ADR-041 §3). Mirrors `src/platform/db/drift.ts`'s `DriftStatus`, plus the
 *  `"unknown"` the server adds whenever either side of the comparison is unavailable. Kept as the
 *  full five-value union rather than a boolean precisely so `"unknown"` cannot be silently folded
 *  into either "fine" or "broken" — see `features/database/rules.ts`'s `resolveSchemaStateWarning`. */
export type AdminSchemaDriftStatus = "in-sync" | "ahead" | "behind" | "diverged" | "unknown";

/** One side of the drift comparison. Mirrors `src/platform/db/drift.ts`'s `SchemaSnapshot`. */
export interface AdminSchemaSnapshot {
  version: number;
  tag: string;
}

/** Mirrors `features/database/adapter.sqlite.ts`'s `SchemaStateSummary`. Either snapshot may be
 *  `null` independently, which is exactly when `status` is `"unknown"`. */
export interface AdminSchemaState {
  status: AdminSchemaDriftStatus;
  siteMeta: AdminSchemaSnapshot | null;
  runtime: AdminSchemaSnapshot | null;
}

/** Recovery (ADR-045) — mirrors `@jini-ai/db/recovery/disclosure`'s `DisclosureResult`. */
export type CategoryCount = number | "unknown";

export interface AdminDisclosureResult {
  partial: true;
  watermarkBaselineAvailable: boolean;
  counts: Record<string, CategoryCount>;
}

export type DegradedBannerKind =
  | "migration-interrupted"
  | "pending-migration"
  | "operation-in-flight"
  | "cost-unavailable"
  | "watermark-baseline-unavailable";

export type DegradedBannerActionKind = "deep-link-to-database-migration" | "unblock-interrupted-migration" | "none";

export interface AdminDegradedBanner {
  kind: DegradedBannerKind;
  accessibleText: string;
  actionKind: DegradedBannerActionKind;
}

export interface AdminRecoveryStatus {
  costClass: RestorePointCostClass;
  banner: AdminDegradedBanner | null;
}

/** Carries display continuity only, never authority — `resolveDeepLinkContext` always
 * re-verifies `restorePointId` server-side (ADR-041 §7/ADR-045 §5, INV-04). */
export interface DatabaseContextEnvelope {
  v: number;
  correlationId: string;
  siteId: string;
  ledgerEventId: string | null;
  restorePointId: string | null;
  drift: string;
  intent: string;
  issuedAt: string;
}

export interface AdminRecoveryDeepLinkResult {
  found: boolean;
  restorePoint: { restorePointId: string; capturedAt: string } | null;
}

/**
 * Session 5-6 backend gap closure — the 3 gated-mutation ceremonies (`core/gated-mutations`'s
 * gateway, wired into the real composition for the first time): taxonomy merge-term, database
 * migrate-forward, recovery restore. Each mirrors `gateway.ts`'s own `plan`/`confirm`/`execute`
 * 3-endpoint shape; `GatedPlanResult`/`GatedConfirmResult` are the shared envelope, `TDetails`
 * varies per ceremony.
 */
export interface GatedPlanResult<TDetails = unknown> {
  planId: string;
  planHash: string;
  details: TDetails;
}

export interface GatedConfirmResult {
  confirmationToken: string;
}

export interface MergeTermPlanDetails {
  fromTermId: string;
  intoTermId: string;
  overlapLossDisclosed: boolean;
  overlappingContentCount: number;
}

export interface MigrateForwardExecuteResult {
  migrated: true;
}

export interface RestoreExecuteResult {
  restoreRunId: string;
  state: string;
  databaseTimelineDeepLink?: { v: 1; siteId: string; intent: "view" };
  /** 2026-07-16: `true` when content.db was physically swapped and the server process needs an
   * operator-triggered restart to pick it up — the running process keeps serving pre-restore data
   * from its already-open file handle until then. */
  restartRequired?: boolean;
}

/** Mirrors `src/comments/types.ts`'s `CommentStatus` (ADR-031, SPEC-033/035/036). */
export type CommentStatus = "pending" | "approved" | "spam" | "trash";

/** Mirrors `src/comments/types.ts`'s `CommentRecord` — the moderation-queue row shape as
 * serialized over the wire (the queue route returns `CommentRecord[]` verbatim, no DTO layer). */
export interface AdminComment {
  id: string;
  workspaceId: string;
  entryId: string;
  parentId: string | null;
  threadRootId: string;
  depth: number;
  status: CommentStatus;
  authorPrincipalId: string | null;
  authorName: string;
  authorEmail: string | null;
  authorUrl: string | null;
  authorIpHash: string | null;
  bodyText: string;
  spamScore: number | null;
  spamProvider: string | null;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency version — required as `expectedVersion` on every moderation action. */
  version: number;
}

/** A keyset-paginated moderation-queue page — mirrors `ModerationQueuePage`. */
export interface AdminCommentsQueuePage {
  items: AdminComment[];
  nextCursor: string | null;
}

/**
 * One row of the Trash. Mirrors `routes/trash/list.ts`'s `toAdminTrashResponse`.
 *
 * Every field is a SNAPSHOT captured when the thing was deleted, not a read of the thing itself —
 * which is what lets a row whose payload is corrupt still be listed and still be restored. `title`
 * can therefore be stale; that is the design, not a bug.
 */
export interface AdminTrashItem {
  /** The trash row's own id. Purge addresses rows by THIS, not by `entityId`. */
  id: string;
  entityType: string;
  /** Presentation subtype; canonical entityType still addresses restore/purge. Older rows may omit it. */
  displayKind?: "page" | "post";
  entityId: string;
  title: string;
  subtitle: string | null;
  trashedAt: string;
  purgeAfter: string;
  /** Whole days until auto-purge, floored at 0. Server-computed, so the clock is the server's. */
  daysRemaining: number;
  actorPrincipalId: string;
  actorPluginId: string | null;
  /** The server-resolved username for `actorPrincipalId`, or `null` when no user record matches
   *  it (the account was since removed, or the principal is not a user). Never the raw id — that
   *  resolution happens server-side so the admin UI never has to guess at a fallback. Optional
   *  (rather than always `string | null`) because an older server build that predates username
   *  resolution omits the field entirely — `rules.ts`'s `actorLabel` treats that absence
   *  differently from an explicit `null`, so the type must let the two states be told apart. */
  actorUsername?: string | null;
  /** True when the row's actor is a non-human system principal (e.g. the boot-time widget
   *  adoption), never a real user account. Optional because an older server predates this field;
   *  absent means "not known to be a system actor", the same safe default as `false`. */
  actorIsSystem?: boolean;
}

export interface AdminTrashPage {
  items: AdminTrashItem[];
  nextCursor: string | null;
}

/** Per-item outcomes. `forbidden` means the operator lacks THAT ROW'S kind's permission. */
export type AdminTrashRestoreOutcome =
  | "restored"
  | "not-found"
  | "version-changed"
  | "adapter-unavailable"
  | "forbidden";

export type AdminTrashPurgeOutcome =
  | "purged"
  | "already-gone"
  | "version-changed"
  | "still-referenced"
  | "not-found"
  | "adapter-unavailable"
  | "forbidden";

export interface AdminTrashRestoreReport {
  restored: number;
  results: { entityType: string; entityId: string; outcome: AdminTrashRestoreOutcome }[];
}

export interface AdminTrashPurgeReport {
  purged: number;
  results: { id: string; outcome: AdminTrashPurgeOutcome }[];
}

/** Mirrors `src/comments/types.ts`'s `CommentsSettings`. */
export interface CommentsSettings {
  enabled: boolean;
  requireModeration: boolean;
  maxDepth: number;
  /** `null` = never closes (the UI never sends the backend's own sentinel value directly). */
  closeAfterDays: number | null;
  spamAutoRejectScore: number;
  maxPerIpPerHour: number;
}

/** The 4 real per-comment moderation actions the backend exposes (`moderate.ts`'s `ACTIONS`);
 * `purge` is intentionally separate (no `expectedVersion` guard, its own route/permission). */
export type CommentModerationAction = "approve" | "spam" | "trash" | "restore";

/** Mirrors `apps/website/src/server/inbound/admin-http/http/plugins.ts`'s `AdminPluginEnvelope` (SPEC-005 REQ-10, api.spec.md
 * §5) — the `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` per-plugin wire shape. */
export interface AdminPlugin {
  id: string;
  name: string;
  version: string;
  source: "built-in" | "site";
  /** (1.1.2, REQ-10/REQ-18) Additive — mirrors `AdminPluginEnvelope.tier`; consumed by `Plugins.tsx`'s
   * per-row trust-tier badge (AC-26). */
  tier: "tier-1" | "tier-2" | "tier-3";
  status: "valid" | "invalid" | "incompatible";
  enabled: boolean;
  quarantine: null | {
    at: string;
    reason: string;
    consecutiveFailures: number;
  };
  errors: Array<{ code: string; file: string | null; message: string }>;
  /** (2026-10-04) Mirrors `AdminPluginEnvelope.conflicts`: names this plugin claims that core or an
   * earlier-enabled plugin already holds. Optional so a row from a server predating the field still
   * types; the current server always sends it (empty when clear). */
  conflicts?: AdminPluginConflict[];
  /** (2026-10-26) True when the plugin declares provider settings (its row offers a Settings card). */
  providerSettings?: true;
}

/** One field of a provider plugin's settings card (`PLUGIN_PROVIDER_SETTINGS`). A secret field never
 *  carries its value back: `saved` says whether one is stored. */
export interface AdminPluginProviderSettingField {
  name: string;
  label: string;
  hint?: string;
  /** Public fields: the plugin's declared value while none is saved (prefilled on the card). */
  default?: string;
  /** Public fields: the plugin's declared choices, shown as a select. */
  options?: { value: string; label: string }[];
  /** With `options`: a "Custom…" choice opens free text. */
  allowCustom?: true;
  secret: boolean;
  required: boolean;
  requiredUnless?: { readonly field: string; readonly equals: string; readonly orPresent?: string; readonly headerNames?: readonly string[] };
  requiredWhen?: { readonly field: string; readonly in: readonly string[] };
  saved: boolean;
  value?: string;
}

/** `GET|PUT /workspaces/:id/plugins/:pluginId/provider-settings` (2026-10-26). */
export interface AdminPluginProviderSettings {
  pluginId: string;
  /** Where this key lives; project keys are visible to attached sites only. */
  store: "project" | "site";
  appliesAt: "now" | "restart" | "failed"; message?: string;
  keyId?: string;
  usedByThisSite: boolean;
  usedBy: string[];
  projectAvailable?: boolean;
  /** A key was saved the retired way (wave 2's `plugin:<id>` API credential) and nothing yet the new way. */
  legacyCredential?: true;
  /** Settings are saved but this machine can't open them (the store's key was lost or re-minted):
   *  shown as not configured until they are entered again. */
  unreadable?: true;
  fields: AdminPluginProviderSettingField[];
}

/** One entry of {@link AdminPlugin.conflicts} — `Jini packages/plugins/src/host/plugin-claims.ts`'s
 *  `PluginConflict`. `heldBy` is `"core"` for a name Tovu itself reserves; `heldKey` is the holder's
 *  own spelling (a reserved prefix such as `/api/*` when that is what matched). */
export interface AdminPluginConflict {
  kind: string;
  key: string;
  heldBy: string;
  heldByName: string;
  heldKey: string;
}

/** Mirrors `server/inbound/admin-http/routes/plugins/files.ts`'s `PLUGIN_FILES` entry (2026-09-13) —
 *  one file in a plugin's own directory. `content` is `null` exactly when `omitted` is set. */
export interface AdminPluginPackageFile {
  relativePath: string;
  sizeBytes: number;
  content: string | null;
  omitted: null | "binary" | "too-large" | "symlink" | "unreadable";
}

/** `PLUGIN_FILES`' whole response: the files, whether the server's caps cut the listing short,
 *  and those caps. */
export interface AdminPluginFiles {
  pluginId: string;
  source: "built-in" | "site";
  files: AdminPluginPackageFile[];
  truncated: boolean;
  limits: { maxFiles: number; maxEntries: number; maxFileBytes: number; maxTotalBytes: number };
}

/** Mirrors `server/inbound/admin-http/routes/agent-plugins/list.ts`'s response shape — the
 *  `AGENT_PLUGINS_LIST` per-plugin wire shape (2026-09-09). A DIFFERENT family from {@link
 *  AdminPlugin} above: Agent Plugins (agent-plugins.org packages) versus the `.tovu-plugin`
 *  site/runtime plugins `AdminPlugin` describes — see that route's own header. `version`/
 *  `description` are nullable, not optional-absent: the wire always sends the key, `null` when the
 *  installed package's own `plugin.json` carries none (the spec itself makes both fields optional). */
export interface AdminAgentPlugin {
  /** Account state is independent of activation; absent for plugins with no sign-in. */
  connectionStatus?: "connected" | "disconnected" | "pending" | "needs_reauth";
  /** Tovu host maturity; absent means normal. */
  maturity?: "untested" | "soon";
  /** The provider plugin (Plugins screen) whose switch this plugin follows; it has no switch of its own. */
  providerPlugin?: string;
  provides?: string[];
  origin?: "bundled" | "operator-installed";
  hostOk?: boolean;
  missingRequires?: string[];
  requiredBy?: string[];
  archiveDigest?: string;
  pluginId: string;
  /** `plugin.json`'s `extensions.jini.displayName`; `null` (or absent, from a server predating the
   *  field) means title-case `pluginId` instead. */
  displayName?: string | null;
  /** `plugin.json`'s `extensions.jini.summary` — the plain-language explainer the row shows in place
   *  of `description` (which is written for the assistant); `null`/absent means show `description`. */
  summary?: string | null;
  version: string | null;
  description: string | null;
  keywords: string[];
  enabled: boolean;
  skills: Array<{ name: string; summary: string }>;
  mcpServerIds: string[];
}

/** `AGENT_PLUGIN_FILES`' response (`server/inbound/admin-http/routes/agent-plugins/files.ts`,
 *  2026-09-13): one installed Agent Plugin's own files — the same entries and caps as
 *  {@link AdminPluginFiles}, minus the `.tovu-plugin`-only `source`. */
export type AdminAgentPluginFiles = Omit<AdminPluginFiles, "source">;

/** C2's safe inventory contract. Eligibility and the minimum hint length remain server-owned. */
export interface AdminCredentialCopySource {
  siteId: string;
  name: string;
  keys: { kind: string; id: string; label: string; provider: string | null; worksFor?: string[]; publishHosts?: string[]; last4?: string;
    /** Set for a key still saved only on a site; absent for a Shared Key. */
    siteName?: string; locked?: string }[];
  reasonCode?: string;
  message?: string;
  actionHint?: { action: "start-site"; siteId: string; desktopSiteId: string };
}
export interface AdminCredentialCopyResult {
  kind: string;
  id: string;
  status: "granted" | "copied" | "skipped" | "failed";
  last4?: string;
  reasonCode?: string;
}

export const api = {
  login: ({ username, password }: { username: string; password: string }, _options: Record<string, never> = {}) =>
    request<{ user: AdminUser } | { mfaRequired: true; pendingToken: string }>({ path: "/auth/login" }, { init: {
      method: "POST",
      body: JSON.stringify({ username, password }),
      // Signing in twice is harmless, so a login sent while the dev server restarts waits and retries.
    }, onOk: undefined, options: { retryWrites: true } }),
  completeMfa: (input: { pendingToken: string; code: string }) => requestOnce<{ user: AdminUser }>({
    path: "/auth/mfa/login", init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), cache: "no-store" },
  }),
  logout: () => request<{ ok: boolean }>({ path: "/auth/logout" }, { init: { method: "POST" } }),
  /**
   * Exchanges a single-use loopback boot token (the zip launcher's `#boot=<token>` sign-in link,
   * run-from-zip plan S2) for a real admin session cookie — the SAME route the desktop shell already
   * redeems (`server/inbound/admin-http/dev-auth.ts`'s `POST /auth/boot-session`; no new server
   * route). `apps/admin/src/App.hooks.ts`'s boot effect calls this with whatever `takeBootToken` read off the URL
   * fragment, then runs its existing `api.me()` chain unchanged — a rejected redemption (invalid,
   * spent, or absent) is swallowed by that caller and falls through to the normal `<Login>` screen.
   */
  redeemBootSession: ({ token }: { token: string }, _optional: Record<string, never> = {}) =>
    request<{ user: { id: string } }>({ path: "/auth/boot-session" }, { init: {
      method: "POST",
      body: JSON.stringify({ token }),
    } }),
  /** Local dev bootstrap exchanges a server-only one-time boot token for an ordinary cookie.
   * The server refuses production, deployment, LAN listeners and cross-origin callers.
   */
  signInLocalOwner: (_required: Record<string, never>, _optional: Record<string, never> = {}) =>
    request<{ user: { id: string } }>({ path: "/auth/local-boot-session" }, { init: { method: "POST" } }),
  me: () =>
    request<{
      user: AdminUser;
      effectivePermissions?: string[];
      canManageUserTrash?: boolean;
      /** `false` on the live site (`publish-availability.store.ts`); absent on older servers. */
      canPublishToLive?: boolean;
    }>({ path: "/auth/me" }),
  /** Password-banner plan (2026-09-24), Slice 2: whether the SIGNED-IN caller's own stored
   *  credential still verifies against the default. Separate from `me()` since only the dashboard
   *  needs it and the server-side check costs a real argon2id verify. */
  getPasswordStatus: () =>
    request<{ usesDefaultPassword: boolean }>({ path: "/auth/me/password-status" }),
  listPosts: () =>
    request<{ posts: Array<{ post: AdminPost }> }>({ path: `/workspaces/${WORKSPACE_ID}/posts` }),
  createPost: (input: AdminPostCreateInput, _options: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/posts` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  getPost: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}` }),
  // Template-preview fix (2026-08-11). Kind-blind like getPost/updatePost/deletePost above — one
  // route serves both editors' Preview tabs (`apps/website/src/server/inbound/admin-http/routes/posts/template-preview.ts`'s own file
  // header explains why). NOT run through `request()`: the caller points an `<iframe src>` (or a
  // hidden form's `action`) directly at this URL rather than fetching+parsing JSON, so this only
  // builds the string.
  //
  // `templateChoice`'s tri-state (see `resolveTemplate`'s doc) is preserved through the query string:
  // `null` omits the param entirely ("never chosen" — the theme's page shell for a Page, or the
  // theme's first template for a Post), `""` sends `?templateChoice=` (a Post's diagnostic page;
  // since the bare-page ruling, 2026-09-23, a Page's explicit "No template" — bare, no theme styles/
  // scripts/header/footer), anything else sends that filename.
  //
  // `siteUrl(...)` wrapping (2026-08-12, owner-reported bug — mention links inside this preview
  // navigated to a blank Vite dev-server error page): every OTHER `BASE`-prefixed path in this file
  // is fetched via `request()`, so staying relative and letting `vite.config.ts`'s `/api` dev proxy
  // forward the bytes is correct for those. This one is different — its caller loads the RESPONSE as
  // a real navigated HTML document (an `<iframe src>` or a form `target`ed at one), which makes this
  // URL's origin the document's own base URI for every relative link INSIDE it. A relative path here
  // resolves against the ADMIN Vite dev server (:5173/:5173-equivalent), which proxies only a small
  // explicit allowlist (`/api`, `/agent-icons`, `/theme-assets`) — so `/theme-assets/...` links in the
  // rendered page happened to keep working while a post/page mention's `<a href="/{slug}">` (render.ts's
  // `"mention"` case) did not: `/{slug}` isn't in that allowlist, so Vite's own dev server 404s it with
  // its stock "did you mean /admin/{slug}?" page instead of ever reaching this route. `siteUrl` (already
  // used by the live-site branch's own iframe `src` for exactly this "escape the admin origin in dev"
  // reason) makes this absolute in dev and a no-op in production, where the admin SPA, this API, and the
  // public site are already the same origin.
  templatePreviewUrl: ({ id, templateChoice }: { id: string; templateChoice: string | null }, _optional: Record<string, never> = {}) =>
    siteUrl(
      { path: `${BASE}/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/template-preview${
        templateChoice === null ? "" : `?templateChoice=${encodeURIComponent(templateChoice)}`
      }` }
    ),
  // `expectedVersion` (2026-09-06) is the optimistic-concurrency basis, not a writable field —
  // the `AdminPost.version` the caller loaded, which the server compares and rejects with
  // `409 VERSION_CONFLICT` when a newer save has superseded it. Purely additive and optional: a
  // caller that omits it (every caller but `features/posts`' editor today, PageEditor included)
  // gets exactly the last-write-wins behavior this method has always had.
  updatePost: ({ id }: { id: string }, { options = {}, entry }: { options?: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage" | "publishAt" | "featuredMediaId" | "author" | "showAuthor">> & {
      expectedVersion?: number;
      hideCoverImageInBody?: boolean;
      slugFromTitle?: boolean;
    }; entry?: "page" } = {}
  ) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify(options),
    }, onOk: undefined, options: entry ? { failureEntry: entry } : {} }),
  // Soft delete (apps/website/src/server/inbound/admin-http/routes/posts/delete.ts): trashes the row rather than removing it,
  // revertible server-side via POST /change-sets/:id/revert. Kind-blind like getPost/updatePost —
  // deletes whatever row has this id regardless of whether it is a post or a page, which is why
  // PostEditor (shared between both) calls this rather than deletePage.
  deletePost: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}` }, { init: {
      method: "DELETE",
    } }),
  // Standing-draft autosave (2026-09-06) — kind-blind like getPost/updatePost/deletePost above, one
  // route serves both editors (`server/inbound/admin-http/routes/posts/autosave.ts`'s own file
  // header explains why there is no parallel `/pages/.../autosave`).
  //
  // `applied: false` is an ORDINARY outcome, not a thrown error: it means the row's `version` moved
  // (a real Save/Publish happened) since `baseVersion` was captured, so the caller's own in-memory
  // edit is no longer the current basis and this tick was correctly dropped rather than clobbering
  // the newer save.
  //
  // `options.keepalive` (2026-09-07) is the UNLOAD-SAFE transport, requested only by the autosave
  // hook's exit flush (`pagehide` / `visibilitychange`→hidden). An ordinary `fetch` started from
  // one of those events is cancelled when the browser tears the document down, so the newest edit
  // — the one still sitting in the debounce window, which is exactly what those listeners exist to
  // rescue — was the one most likely to be dropped. It is opt-in rather than always-on because
  // `keepalive` carries a 64 KiB body ceiling an ordinary request does not; see
  // {@link bodyFitsKeepalive} for what happens to a body over it.
  putAutosave: ({ id, draft }: { id: string; draft: { bodyFormat: "doc"; bodyJson: Record<string, unknown>; title: string; slug: string; baseVersion: number } | {
      bodyFormat: "html";
      bodyHtml: string;
      title: string;
      slug: string;
      baseVersion: number;
    } }, options: { keepalive?: boolean } = {}
  ) => {
    const body = JSON.stringify(draft);
    return request<{ applied: boolean }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave` }, { init: {
      method: "PUT",
      body,
      // Silently dropped rather than sent for an oversized body: `fetch` REJECTS outright when a
      // keepalive body exceeds the ceiling, which would turn a request that had at least a chance
      // of completing into one that provably never leaves. A plain fetch on the way out is the
      // pre-2026-09-07 behavior, i.e. no worse than before for the pages this cannot cover.
      ...(options.keepalive === true && bodyFitsKeepalive({ body }) ? { keepalive: true } : {}),
    } });
  },
  // The recovery-banner check on editor mount — reads whatever standing draft is currently parked,
  // or `null` when there is nothing to offer.
  getAutosave: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{
      autosave: {
        bodyFormat: "doc" | "html";
        bodyJson?: Record<string, unknown>;
        bodyHtml?: string;
        title: string;
        slug: string;
        baseVersion: number;
        savedAt: string;
        savedByPrincipalId: string;
      } | null;
    }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave` }),
  // Clears the standing draft — called after a real Save/Publish succeeds, and on an explicit
  // operator Discard. Unconditional: there is no stale basis to guard against when the intent is
  // simply "there is no longer a draft to offer".
  discardAutosave: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ ok: boolean }>({ path: `/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave` }, { init: {
      method: "DELETE",
    } }),
  listPages: () =>
    request<{ posts: Array<{ post: AdminPost }> }>({ path: `/workspaces/${WORKSPACE_ID}/pages` }),
  createPage: ({ title }: { title: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages` }, { init: {
      method: "POST",
      body: JSON.stringify({ title }),
    } }),
  // Kind-guarded read: 404s if the id's row is not actually `kind: "page"`. `features/pages` uses
  // this rather than `getPost` so the Pages editor can never silently open a Post — Pages and Posts
  // are separate features with separate editors, and the id in the URL is the only thing standing
  // between them.
  getPage: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost; pluginEmbeds?: readonly AdminPagePluginEmbed[] }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}` }),
  // SPEC-047 — writes the bespoke-HTML body, and births the html row on first call. A DIFFERENT
  // endpoint from `updatePost` on purpose: the body and the title/slug/status go through two
  // separate server-side write paths.
  //
  // **This route takes no `expectedVersion`, and its server-side compare-and-set does NOT protect a
  // second editor** — corrected 2026-09-07; this comment used to claim the opposite ("only this one
  // offers compare-and-set, a 409 rather than a silent overwrite when someone else edited the page
  // since this editor loaded it"), and `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts`'s own header still says
  // something similar. What the route actually does is `read()` then `write()` inside ONE request
  // (`PagesHtmlDocumentStore`, CIC-1), so the version it conditions on is one it captured
  // microseconds earlier — it serializes two writes racing inside the server, and can never see the
  // version the CLIENT loaded. It also BUMPS `version` on every successful write.
  //
  // `updatePost` above is the only one of the two that accepts a client-supplied `expectedVersion`,
  // which is why `usePageEditor.save` writes metadata FIRST and only reaches this route once that
  // guard has passed. Reordering those two calls, or adding a body-only save path, silently removes
  // the protection — see `writePage` in `use-page-editor.hooks.ts`.
  updatePageHtml: ({ id, html }: { id: string; html: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}/html` }, { init: {
      method: "PUT",
      body: JSON.stringify({ html }),
    } }),
  // Soft delete (apps/website/src/server/inbound/admin-http/routes/pages/delete.ts): same trash marker as deletePost, but
  // kind-guarded — 404s if the id's row is not actually kind:"page" (indistinguishable from
  // not-found, matching the rest of the pages/* routes' disclosed asymmetry).
  deletePage: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}` }, { init: {
      method: "DELETE",
    } }),
  getPresentation: (required: { kind?: "post" | "page" } = {}, _optional: Record<string, never> = {}) =>
    request<{
      settings: PresentationSettings;
      availableThemeIds: string[];
      availableThemes: AdminThemeSummary[];
      /** Template-picker feature (2026-08-10, unified 2026-08-11) — ONE list shared by both the
       *  Post editor's and the Pages editor's pickers (was two separate fields,
       *  `activeThemePostTemplates`/`activeThemePageTemplates`, until the unified `content` marker
       *  removed the reason they needed to differ). Editors now request `kind` to filter this
       *  list using the theme's optional `templateFor`; other callers retain the full catalog. */
      activeThemeTemplates: string[];
      activeThemeStaticPageIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/presentation${querySuffix({ query: required.kind ? "kind=" + required.kind : "" })}` }),
  /**
   * One theme's editable surface: which pages it ships, which root partials, and where it was
   * copied from. Drives the Explore screen's file list and its "you are editing a copy" banner.
   */
  getThemeDetail: ({ themeId }: { themeId: string }, _optional: Record<string, never> = {}) =>
    request<{
      id: string;
      name: string;
      tier: string;
      /** Manifest schema version (`2`, or `undefined` for v1) — see `ThemeExplorePort.getThemeDetail`'s
       *  own doc for why the Explore screen needs this (2026-08-19 architecture audit findings 1 & 2). */
      apiVersion?: 2;
      status: string;
      errors: string[];
      pages: string[];
      partials: string[];
      /**
       * Every file in the theme folder, not just the ones the renderer knows about. `editable` is
       * false for binaries (images, fonts) — those are viewable via `/theme-assets/` but must never
       * be round-tripped through a textarea. `resettable` is false for files the author added
       * themselves, which have no original to go back to.
       */
      files: Array<{
        path: string;
        group: ThemeFileGroup;
        /** Whether the raw source can be fetched/displayed as text at all — false only for binary
         *  assets (images, fonts). Independent of `editable`: a script is readable but not editable. */
        readable: boolean;
        /** Whether the file can be saved (PUT/reset). False for binaries AND for read-only groups
         *  (`script`, `other`) even though those stay `readable`. */
        editable: boolean;
        inherited?: boolean;
        resettable: boolean;
        /** Whether the live file's bytes differ from its catalog original — `null` exactly when
         *  `resettable` is false (no original to compare against). Optional so an older cached client
         *  response (before this field existed) still parses. */
        modified?: boolean | null;
        /** `null` for every file the publish question does not apply to at all — every non-page
         *  file, plus a page that is `index`/`404` or a declared Post/Page template shell. Only a
         *  real standalone page gets `true`/`false`. Optional so an older cached client response
         *  (before this field existed) still parses. */
        published?: boolean | null;
        /** The live content record occupying this page's own slug — `null`/absent for every file
         *  `published` is also `null`/absent for, plus a real candidate page with no such record.
         *  See `ThemeExploreFile.collidingContent` (`use-theme-explore.hooks.ts`) for the full
         *  contract: a page can read `published: true` and still not be what a visitor gets. */
        collidingContent?: { id: string; slug: string; title: string; kind: "post" | "page" } | null;
      }>;
      /** True when an untouched original of this theme exists in the catalog to reset back to. */
      hasOriginal: boolean;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}` }),
  /**
   * Restore one file to the pristine copy in the originals catalog, byte for byte. DESTRUCTIVE —
   * overwrites the working copy with no backup, so the caller must confirm with the operator first.
   * A file already identical to its original is not rewritten: `wasModified: false`, `bytes: 0`.
   * `content` is the restored file's text, or `null` past the server's 1 MB text-read limit.
   */
  resetThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; wasModified: boolean; bytes: number; content: string | null }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/reset` },
      { init: { method: "POST", body: JSON.stringify({ path }) } }
    ),
  /**
   * Save the theme's CURRENT files as its stored original, in the server's hidden originals catalog
   * (never a visible theme), so Reset has something to restore from. 409 `ORIGINAL_EXISTS` when the
   * theme already has one.
   */
  saveThemeOriginal: ({ themeId }: { themeId: string }, _optional: Record<string, never> = {}) =>
    request<{ themeId: string; saved: true }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/original` }, { init: {
      method: "POST",
      body: JSON.stringify({}),
    } }),
  /** Raw source of one file inside a theme, relative to the theme root (`pages/about.html`). */
  getThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; content: string }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file?path=${encodeURIComponent(path)}` }
    ),
  /** Overwrite one file inside a theme. Refused for catalog originals — those are never editable —
   *  and for read-only groups (scripts, `other`); see `ApiError.code === "READ_ONLY_FILE"`. */
  putThemeFile: ({ themeId, path, content }: { themeId: string; path: string; content: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; bytes: number }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file` },
      { init: { method: "PUT", body: JSON.stringify({ path, content }) } }
    ),
  /**
   * Duplicate one file inside a theme. The server computes the destination name (`about.html` ->
   * `about-1.html`, following collisions) — this call takes only the source path, nothing operator-
   * typed. Offered for every group, including read-only-to-edit ones: copying a script's bytes is
   * harmless even though editing one is refused.
   */
  copyThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{
      path: string;
      group: ThemeFileGroup;
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      copiedFrom: string;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/copy` }, { init: {
      method: "POST",
      body: JSON.stringify({ path }),
    } }),
  /**
   * Rename one file within its current folder. `name` is a bare filename (no `/`), so this can never
   * move a file between folders. Refused for `pages/index.html`/`theme.json`/`tokens.json`
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for a name already taken
   * (`code === "NAME_TAKEN"`).
   */
  renameThemeFile: ({ themeId, path, name }: { themeId: string; path: string; name: string }, _optional: Record<string, never> = {}) =>
    request<{
      path: string;
      group: ThemeFileGroup;
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      renamedFrom: string;
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/rename` }, { init: {
      method: "POST",
      body: JSON.stringify({ path, name }),
    } }),
  /**
   * Delete one file inside a theme, permanently — this repo keeps no theme-file revision history, so
   * there is no server-side undo. Refused for a theme's required files
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for the same read-only-identity groups
   * (`script`, `other`) rename refuses (`code === "READ_ONLY_FILE"`) — see `explore.ts`'s
   * `validateFileIdentityChange` for the shared reasoning.
   */
  deleteThemeFile: ({ themeId, path }: { themeId: string; path: string }, _optional: Record<string, never> = {}) =>
    request<{ path: string; deleted: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/delete` },
      { init: { method: "POST", body: JSON.stringify({ path }) } }
    ),
  /**
   * Publish or unpublish one of a static theme's own pages — the real replacement for the
   * `_unpublished/` folder convention an agent invented ad hoc because no such control existed at the
   * time. Refused for a non-`static`-tier theme (`ApiError.code === "NOT_STATIC_TIER"`) or a page id
   * that isn't one of this theme's own standalone pages — it does not exist, or is `index`/`404`/a
   * declared Post-or-Page template shell — with `code === "PAGE_NOT_PUBLISHABLE"`.
   */
  setThemePagePublished: ({ themeId, page, published }: { themeId: string; page: string; published: boolean }, _optional: Record<string, never> = {}) =>
    request<{ page: string; published: boolean; publishedPages: string[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/page/publish` },
      { init: { method: "POST", body: JSON.stringify({ page, published }) } }
    ),
  /**
   * Re-run theme discovery server-side. Needed because the server's theme list is built once at
   * boot, so a theme added to disk afterwards (downloaded, copied, pulled in by git, created by the
   * `npm run theme` CLI) does not exist as far as this screen is concerned until someone asks.
   */
  rescanThemes: () =>
    request<{
      added: string[];
      removed: string[];
      total: number;
      availableThemeIds: string[];
      duplicateIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/rescan` }, { init: { method: "POST" } }),
  /**
   * Copy one theme into a new theme folder (the Themes screen's Duplicate action) — the same
   * server service the `theme_duplicate` agent tool calls. `newId` omitted ⇒ derived from `newName`
   * and suffixed until free. The server rescans before answering, so `availableThemeIds` already
   * includes the copy. Refusals carry `ApiError.code` (`ID_TAKEN`, `SYMLINK`, `TOO_LARGE`, …).
   */
  duplicateTheme: ({ themeId, newName }: { themeId: string; newName: string }, { newId }: { newId?: string } = {}) =>
    request<{
      theme: { id: string; name: string; tier: ThemeTier; status: string; errors: string[] };
      sourceThemeId: string;
      files: number;
      availableThemeIds: string[];
    }>({ path: `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/duplicate` }, { init: {
      method: "POST",
      body: JSON.stringify(newId === undefined ? { newName } : { newName, newId }),
    } }),
  setActiveTheme: ({ activeThemeId }: { activeThemeId: string }, _optional: Record<string, never> = {}) =>
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/presentation` },
      { init: { method: "PATCH", body: JSON.stringify({ activeThemeId }) } }
    ),
  listMembers: () =>
    request<{ members: AdminMember[] }>({ path: `/workspaces/${WORKSPACE_ID}/members` }),
  getMember: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ member: AdminMember }>({ path: `/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}` }),
  disableMember: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ member: AdminMember }>({ path: `/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}/disable` }, { init: {
      method: "POST",
    } }),
  requestMemberMagicLink: ({ email }: { email: string }, options: { redirectPath?: string } = {}) =>
    request<{ delivered: true }>({ path: `/workspaces/${WORKSPACE_ID}/members/request-magic-link` }, { init: {
      method: "POST",
      body: JSON.stringify({ email, redirectPath: options.redirectPath }),
    } }),
  listRecentAnalyticsHits: (options: { limit?: number } = {}) =>
    request<{ hits: AdminAnalyticsHit[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/analytics/recent-hits${querySuffix({ query: options.limit ? "limit=" + options.limit : "" })}` }
    ),
  listMenus: () =>
    request<{ menus: AdminMenu[] }>({ path: `/workspaces/${WORKSPACE_ID}/menus` }),
  getMenu: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}` }),
  createMenu: (
    { title, slug }: { title: string; slug: string },
    options: { items?: AdminMenuItem[] } & AdminMenuAuthoring = {}
  ) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus` }, { init: {
      method: "POST",
      body: JSON.stringify({ title, slug, items: options.items, mode: options.mode, html: options.html }),
    } }),
  updateMenuTree: (
    { id, expectedVersion, items }: { id: string; expectedVersion: number; items: AdminMenuItem[] },
    options: { title?: string; slug?: string } & AdminMenuAuthoring = {}
  ) =>
    request<{ menu: AdminMenu }>({ path: `/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, items, title: options.title, slug: options.slug, mode: options.mode, html: options.html }),
    } }),
  listIntegrationSubscriptions: () =>
    request<{ subscriptions: AdminWebhookSubscription[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/integrations/subscriptions` }
    ),
  createIntegrationSubscription: (input: { label: string; targetUrl: string; topics: string[] }) =>
    request<{ subscription: AdminWebhookSubscription }>(
      { path: `/workspaces/${WORKSPACE_ID}/integrations/subscriptions` },
      { init: { method: "POST", body: JSON.stringify(input) } }
    ),
  pauseIntegrationSubscription: (
    { id, paused }: { id: string; paused: boolean },
    _options: Record<string, never> = {}
  ) =>
    request<{ subscription: AdminWebhookSubscription }>(
      { path: `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(id)}/pause` },
      { init: { method: "POST", body: JSON.stringify({ paused }) } }
    ),
  deleteIntegrationSubscription: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ subscription: AdminWebhookSubscription }>(
      { path: `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(id)}` },
      { init: { method: "DELETE" } }
    ),
  listIntegrationDeliveries: ({ subscriptionId }: { subscriptionId: string }, _optional: Record<string, never> = {}) =>
    request<{ deliveries: AdminWebhookDelivery[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(subscriptionId)}/deliveries` }
    ),
  listMedia: () => request<{ media: AdminMedia[] }>({ path: `/workspaces/${WORKSPACE_ID}/media` }),
  /** The workspace's media-generation vendor credentials, as markers only — never key material.
   *  Bare map, not a `{ data }` envelope, matching `MediaProvidersPort.fetchMediaProviders`. */
  getMediaProviders: () =>
    request<AdminMediaProviderMap>({ path: `/workspaces/${WORKSPACE_ID}/media/providers` }),
  /** Replaces the workspace's ENTIRE provider set — a provider absent from `providers` is deleted
   *  server-side, which is how the tab expresses Clear. Resolves the authoritative copy back. */
  saveMediaProviders: (providers: AdminMediaProviderMap) =>
    request<AdminMediaProviderMap>({ path: `/workspaces/${WORKSPACE_ID}/media/providers` }, { init: {
      method: "PUT",
      body: JSON.stringify(providers),
    } }),
  /** The workspace's configured external MCP servers. Carries env variable NAMES only — there is no
   *  route anywhere that returns a stored env VALUE, by design. */
  listExternalMcpServers: () =>
    request<{ servers: AdminExternalMcpServer[] }>({ path: `/workspaces/${WORKSPACE_ID}/mcp-servers` }),
  /** Creates or replaces one external MCP server. Omitting `env` PRESERVES the stored credentials
   *  (what an enable/disable toggle sends); passing `""` clears them. `restartRequired` is always
   *  true — federation freezes its tool set at connect, so a saved row lands at the next boot. */
  saveExternalMcpServer: ({ serverId, body }: { serverId: string; body: AdminExternalMcpServerInput }, _optional: Record<string, never> = {}) =>
    request<{ server: AdminExternalMcpServer; restartRequired: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}` },
      { init: { method: "PUT", body: JSON.stringify(body) } }
    ),
  /** Removes one external MCP server. 404s on an id that was never configured rather than
   *  reporting success, so deleting a typo cannot read as deleting the real server. */
  deleteExternalMcpServer: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) =>
    request<{ removed: boolean; restartRequired: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}` },
      { init: { method: "DELETE" } }
    ),
  /**
   * Connects to one already-saved server RIGHT NOW, lists its tools, describes them, and closes —
   * registering nothing (C-007, outline §3.1 Source A). A live snapshot of what the remote offers,
   * never a stored one: federation re-applies the allowlist against a fresh `tools/list` at connect
   * regardless, so this call cannot un-freeze anything the daemon holds.
   *
   * Also backs `useExternalMcp`'s `testSource` port method, which is what lights up Jini's existing
   * "Test" button (`useSourceConfigList.ts`'s `capabilities.canTest`) for free.
   */
  probeExternalMcpServer: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) =>
    request<AdminExternalMcpProbeResult>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/probe` },
      { init: { method: "POST" } }
    ),
  /** Starts an OAuth sign-in for one saved server. `redirect_required` carries the provider URL to
   *  open; `device_code` carries a code the operator types at `verificationUri`, then
   *  {@link api.pollExternalMcpOAuthDevice} reports when it lands. */
  connectExternalMcpOAuth: ({ serverId }: { serverId: string }, options: { destination?: "shared" } = {}) =>
    request<{ auth: AdminExternalMcpConnectStart }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/oauth/connect` },
      { init: { method: "POST", ...(options?.destination ? { body: JSON.stringify(options) } : {}) } }
    ),
  useLocalMcpConnection: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) => request<void>({ path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/oauth/shared` }, { init: { method: "DELETE" } }),
  stopSharedMcpConnection: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) => request<void>({ path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/oauth` }, { init: { method: "DELETE" } }),
  listSharedMcpConnections: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) => request<{ available: boolean; connections: { credentialId: string; label: string }[]; current: { credentialId: string; status: string; granted: boolean } | null }>(
    { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/oauth/shared` }),
  useSharedMcpConnection: (input: { serverId: string; credentialId: string }) => request<{ connected: boolean }>(
    { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(input.serverId)}/oauth/shared` }, { init: { method: "POST", body: JSON.stringify({ credentialId: input.credentialId }) } }),
  /** One poll of a device sign-in; the caller owns the loop and waits `retryAfterSeconds`. */
  pollExternalMcpOAuthDevice: ({ serverId }: { serverId: string }, _optional: Record<string, never> = {}) =>
    request<{ status: "pending"; retryAfterSeconds: number } | { status: "connected" }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/oauth/device/poll` },
      { init: { method: "POST" } }
    ),
  /**
   * What the RUNNING agent daemon actually admitted at its last boot, per connection (C-008,
   * outline §3.1 Source B) — the only route that can answer "you ticked 3 tools; the assistant is
   * running with 1." A stopped or unreachable daemon is a 503 (thrown as an `ApiError`), never a
   * silently empty `connections` array — a caller must not read "cannot reach the daemon" as "the
   * daemon is running with nothing admitted".
   */
  getExternalMcpAdmissions: async (): Promise<AdminExternalMcpAdmissionsSnapshot> => {
    const raw = await request<{ connections?: RawAdmissionConnection[]; configFailures?: AdminExternalMcpConfigFailure[] }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/admissions` },
    );
    // `?? []` guards a malformed 200 (no `connections` key at all) — never reachable against the
    // real C-008 route, which always sends `{ connections: [...] }` on 200 and answers a down/
    // unreachable daemon with a 503 that `request()` already throws as an `ApiError` before this
    // line runs (see this function's own doc). Kept anyway: a 200 with a missing `connections` key
    // is a "we don't know" case, same as the 503 branch, not "the daemon reported zero admissions".
    return {
      connections: (raw.connections ?? []).map(flattenAdmissionConnection),
      // Not defaulted to `[]` here — see `AdminExternalMcpAdmissionsSnapshot.configFailures`'s own
      // doc on why "absent" and "empty" must stay distinguishable one more hop upstream too.
      ...(raw.configFailures !== undefined ? { configFailures: raw.configFailures } : {}),
    };
  },
  /** Every saved "Always allow" on this site, sorted by server then tool. */
  listExternalMcpToolApprovals: () =>
    request<{ approvals: AdminExternalMcpToolApproval[] }>({ path: `/workspaces/${WORKSPACE_ID}/mcp-servers/tool-approvals` }),
  /** Revokes one "Always allow", so that tool asks again. 404s when none is saved. */
  revokeExternalMcpToolApproval: ({ serverId, toolName }: { serverId: string; toolName: string }, _optional: Record<string, never> = {}) =>
    request<{ removed: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/tool-approvals/${encodeURIComponent(toolName)}` },
      { init: { method: "DELETE" } }
    ),
  /** Byte-serving URL for an asset's original file (MSG-05) — authenticated, same-origin, so a
   *  plain `<img src>`/`<video src>` sends the session cookie automatically with no `crossorigin`
   *  attribute needed. Not wrapped in `request()` like the rest of this file's methods: callers
   *  want the URL string itself to hand to a DOM element, not a parsed JSON response. `Content-Type`
   *  is sniffed server-side from magic bytes (falls back to `application/octet-stream`, and a
   *  sniffed HTML/SVG is deliberately served as a non-rendering attachment) — see `Media.tsx`'s
   *  `MediaPreview` for how the client discovers which element type an asset actually needs. */
  mediaOriginalUrl: ({ id }: { id: string }, _optional: Record<string, never> = {}) => `${BASE}/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}/original`,
  /** The image a public post shows as its cover: the `/m/` route's core `public` rendition (WebP,
   *  uncropped, generated once and cached server-side — `apps/website/src/features/media/bootstrap.ts`).
   *  The Edit post cover slot shows this one so it matches the published page (owner 2026-10-11:
   *  it showed the `og` 1200 × 630 share crop squeezed into a 220px band; the public page shows the
   *  whole image). A browser that opened the post already has it cached. `v1` because that bootstrap
   *  is find-or-create and never mints a second version; callers still fall back to
   *  {@link mediaOriginalUrl} when this fails to load (no `sharp`, a gated asset, a newer version). */
  mediaPreviewRenditionUrl: ({ id }: { id: string }, _optional: Record<string, never> = {}) => siteUrl({ path: `/m/${encodeURIComponent(id)}/public.v1/image.jpg` }),
  /** The asset's real, server-sniffed `Content-Type`, read from a `HEAD` of {@link mediaOriginalUrl}
   *  (no body transferred) — the same value the public renderer dispatches `<img>` vs `<video>` on.
   *  Resolves `""` when the route answers non-2xx or sends no header. */
  mediaContentType: async ({ id }: { id: string }, _optional: Record<string, never> = {}): Promise<string> => {
    const res = await fetch(api.mediaOriginalUrl({ id }), {
      method: "HEAD",
      credentials: "same-origin",
    });
    return res.ok ? (res.headers.get("content-type") ?? "") : "";
  },
  importMediaFromUrl: (
    input: { url: string },
    options: { filename?: string; alt?: string; caption?: string; credit?: string } = {}
  ) =>
    request<{ media: AdminMedia }>({ path: `/workspaces/${WORKSPACE_ID}/media/import-url` }, { init: {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    } }),
  uploadMedia: (
    input: { filename: string; contentType: string; dataBase64: string },
    options: { alt?: string; caption?: string; credit?: string } = {}
  ) =>
    request<{ media: AdminMedia }>({ path: `/workspaces/${WORKSPACE_ID}/media` }, { init: {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    } }),
  updateMedia: (
    { id }: { id: string },
    options: {
      title?: string;
      slug?: string;
      alt?: string;
      caption?: string;
      credit?: string;
      width?: number | null;
      height?: number | null;
      cssClass?: string | null;
      htmlAttributes?: string | null;
    } = {}
  ) =>
    request<{ media: AdminMedia }>({ path: `/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}` }, { init: {
      method: "PATCH",
      body: JSON.stringify(options),
    } }),
  trashMedia: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ media: AdminMedia }>({ path: `/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}/trash` }, { init: {
      method: "POST",
    } }),
  deleteMedia: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ purged: boolean }>({ path: `/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}` }, { init: {
      method: "DELETE",
    } }),
  /** Library documents (`kind=document`): private, active only, never in media pickers. */
  listDocuments: () => request<{ media: AdminMedia[] }>({ path: `/workspaces/${WORKSPACE_ID}/media?kind=document` }),
  /** The server takes the document type from the filename's extension and checks the bytes. */
  uploadDocument: (input: { filename: string; dataBase64: string }) =>
    request<{ media: AdminMedia }>({ path: `/workspaces/${WORKSPACE_ID}/media` }, { init: {
      method: "POST",
      body: JSON.stringify({ ...input, kind: "document" }),
    } }),
  /** A Markdown/text/CSV/JSON document's UTF-8 source, 64 KiB per page (`nextOffset` continues it). */
  readDocumentText: ({ id }: { id: string }, options: { offset?: number } = {}) =>
    request<{ id: string; text: string; offset: number; nextOffset: number | null; totalBytes: number; truncated: boolean }>(
      { path: `/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}/text${querySuffix({ query: options.offset ? "offset=" + options.offset : "" })}` },
    ),
  listUsers: () => request<{ users: AdminIdentityUser[] }>({ path: `/workspaces/${WORKSPACE_ID}/users` }),
  createUser: (
    input: { username: string; password: string },
    options: { email?: string } = {}
  ) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users` }, { init: {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    } }),
  // SPEC-006 0.6.0 (users/roles/policies CRUD-completion amendment).
  updateUser: ({ principalId }: { principalId: string }, options: { email?: string; username?: string } = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}` }, { init: {
      method: "PATCH",
      body: JSON.stringify(options),
    } }),
  disableUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/disable` }, { init: {
      method: "POST",
    } }),
  enableUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/enable` }, { init: {
      method: "POST",
    } }),
  // Delete-user plan v2 (2026-09-24): DELETE now moves the target to the Trash (disabled, sessions
  // revoked, restorable there for 60 days) rather than hard-deleting it — same endpoint the v1
  // plan's `deleteUser` used, just a different server-side outcome behind the same 204.
  deleteUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}` }, { init: {
      method: "DELETE",
    } }),
  resetUserPassword: (
    { principalId, password }: { principalId: string; password: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/reset-password` }, { init: {
      method: "POST",
      body: JSON.stringify({ password }),
    } }),
  assignRole: (
    { principalId, roleId }: { principalId: string; roleId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ assignment: unknown }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/roles` }, { init: {
      method: "POST",
      body: JSON.stringify({ roleId }),
    } }),
  attachPolicy: (
    { principalId, policyId }: { principalId: string; policyId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ attachment: unknown }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/policies` }, { init: {
      method: "POST",
      body: JSON.stringify({ policyId }),
    } }),
  listRoles: () => authenticatedAdminRequest<{ roles: AdminRole[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/roles` }),
  createRole: ({ name }: { name: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ role: AdminRole }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/roles`, body: { name } }),
  // SPEC-006 0.6.0.
  updateRole: (
    { roleId, name }: { roleId: string; name: string },
    _options: Record<string, never> = {}
  ) =>
    authenticatedAdminRequest<{ role: AdminRole }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}`, body: { name } }),
  deleteRole: ({ roleId }: { roleId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}` }),
  listPolicies: () => authenticatedAdminRequest<{ policies: AdminPolicy[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/policies` }),
  createPolicy: ({ name }: { name: string }, options: { description?: string } = {}) =>
    authenticatedAdminRequest<{ policy: AdminPolicy }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/policies`, body: { name, description: options.description } }),
  // SPEC-006 0.6.0.
  updatePolicy: (
    { policyId }: { policyId: string },
    options: { name?: string; description?: string } = {}
  ) =>
    authenticatedAdminRequest<{ policy: AdminPolicy }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}`, body: options }),
  deletePolicy: ({ policyId }: { policyId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}` }),
  writePolicyPermission: (
    { policyId, permission }: { policyId: string; permission: string },
    options: { resourceType?: string } = {}
  ) =>
    authenticatedAdminRequest<{ policyPermission: unknown }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions`, body: { permission, resourceType: options.resourceType || undefined } }),
  listPolicyPermissions: ({ policyId }: { policyId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ policyPermissions: AdminPolicyPermission[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions` }),
  removePolicyPermission: ({ policyId, policyPermissionId }: { policyId: string; policyPermissionId: string }) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions/${encodeURIComponent(policyPermissionId)}` }),

  // SPEC-044 (Workspace Administration). Note the path shape here differs from every call above:
  // `workspaces` IS the resource (no `/workspaces/${WORKSPACE_ID}/<sub-resource>` nesting) —
  // `/workspaces` (list/create) and `/workspaces/:id` (get/update/delete), matching api.spec.md.
  getWorkspace: () => authenticatedAdminRequest<{ workspace: AdminWorkspace }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}` }),
  updateWorkspace: (options: { name?: string; slug?: string } = {}) =>
    authenticatedAdminRequest<{ workspace: AdminWorkspace }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}`, body: options }),

  // SPEC-007 Settings (core-only layered ledger) — Phase 6 UI.
  getSettingsEffective: ({ namespace }: { namespace: string }, options: { principalId?: string } = {}) => {
    const params = new URLSearchParams({ namespace });
    if (options.principalId) params.set("principalId", options.principalId);
    const path = `/workspaces/${WORKSPACE_ID}/settings/effective?${params.toString()}`;
    return shareSettingsEffectiveRead({ namespace, path, port: {
      read: () => authenticatedAdminRequest<{ data: SettingResolvedValue[] }>({ method: "GET", path }),
    } }, {});
  },
  setSetting: (
    input: { namespace: string; key: string; scope: SettingScope; valueJson: unknown },
    options: { principalId?: string } = {}
  ) =>
    authenticatedAdminRequest<SettingValueResponse>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/settings/value`, body: { ...input, ...options } }),

  // "Execution mode" tab (`@jini-ai/ui`'s `ExecutionTab`) — Local CLI detection + BYOK connection
  // test/model discovery. Deliberately separate from the settings.* methods above: these are
  // stateless egress probes (`apps/website/src/server/runtime/composition/modules/assistant-execution.ts`), not ledger CRUD, and the
  // `apiKey` field these two POST bodies carry is used for exactly one outbound request server-side
  // and never persisted (ADR-028 §6 — see `apps/admin/src/lib/execution-settings.ts`'s header).
  detectExecutionAgents: (_input: Record<string, never> = {}, { force = false }: { force?: boolean } = {}) =>
    authenticatedAdminRequest<{ data: AdminExecutionDetectedAgent[] }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/detect-agents`, body: force ? { force: true } : {} }),
  // `useStoredCredential` opts a probe into the workspace's encrypted server-side SITE credential
  // when `apiKey` is empty — for the AI Assistant tab's visitor form, whose key is write-only and so
  // genuinely absent from the browser. `useAdminStoredCredential` is the same opt-in for the OTHER
  // write-only key: the calling admin's own execution credential, which moved server-side on
  // 2026-08-05 and left these probes with nothing to send on the admin's own screens.
  //
  // Two flags, never one. Each is opt-in per request and never implicit, so neither screen can fall
  // through to the other's key — see `stored-credential-probe.ts`'s header on the server.
  testExecutionConnection: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
    useAdminStoredCredential?: boolean;
  }) =>
    authenticatedAdminRequest<{ ok: boolean; message: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/test-connection`, body: input }),
  testExecutionAgent: (input: { agentId: string; model?: string }) =>
    authenticatedAdminRequest<{ ok: boolean; message: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/test-agent`, body: input }),
  listExecutionModels: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
    useAdminStoredCredential?: boolean;
  }) =>
    authenticatedAdminRequest<{ ok: boolean; models: string[]; message?: string }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/assistant/execution/models`, body: input }),

  // SPEC-010 Forms (Tier-1 sample plugin) — admin UI.
  listForms: () => authenticatedAdminRequest<{ data: AdminFormDefinition[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/forms` }),

  // AI Assistant — the visitor-facing assistant's master switch. Same `{ data }` envelope and same
  // partial-PUT shape as Jini's SEO settings adapter, because the two routes are deliberately
  // identical in contract (see `apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts`).
  //
  // GET's response also carries a sibling `adminAssistantEnabled` — the UNRELATED admin assistant's
  // own `TOVU_ADMIN_ASSISTANT=off` switch, piggy-backed onto this response rather than a new
  // endpoint (`apps/website/src/server/inbound/admin-http/routes/assistant/get-settings.ts`'s own doc explains why: this module is
  // one of exactly two admin-assistant server modules mounted unconditionally, so it is reachable
  // even with that flag off). `apps/admin/src/App.hooks.ts`'s `useAdminAssistantAvailability` is the one reader.
  getAssistantSettings: () =>
    authenticatedAdminRequest<{ data: PublicAssistantSettings; adminAssistantEnabled: boolean }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/settings` }),
  setAssistantSettings: (patch: Partial<PublicAssistantSettings>) =>
    authenticatedAdminRequest<{ data: PublicAssistantSettings }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/settings`, body: patch }),
  // The folder-drop flow — the operator-set `fs-files`
  // `custom` root the assistant's `fs_list_files`/`fs_read_file` tools may reach outside this
  // repo/site (`apps/website`'s `features/fs-files/custom-root-store.ts`). `path: null` means no
  // folder has been set yet. `setFsFilesCustomRoot` can 400 with a message meant to be shown
  // verbatim (not an absolute path, does not exist, or is a file rather than a directory) — callers
  // read `ApiError.body.error` for that case rather than treating every rejection as unexpected.
  getFsFilesCustomRoot: () => authenticatedAdminRequest<{ path: string | null }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root` }),
  setFsFilesCustomRoot: ({ path }: { path: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ path: string }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root`, body: { path } }),
  clearFsFilesCustomRoot: () => authenticatedAdminRequest<{ path: null }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/fs-files/custom-root` }),
  // The composer's folder button. `GET` succeeds only when the server runs on this same machine
  // (`apps/website`'s `routes/fs-files/folder-picker.ts`) — any rejection means "hide the button".
  // `POST` opens the OS folder dialog there and resolves `{ path: null }` on Cancel.
  getFolderPicker: () => authenticatedAdminRequest<{ available: true }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/fs-files/folder-picker` }),
  pickFolder: () => authenticatedAdminRequest<{ path: string | null }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/fs-files/folder-picker` }),
  // The ADMIN's own agent daemon (Local CLI execution) — manual restart action for
  // `features/ai-assistant/AiAssistant.tsx`'s "Admin AI Assistant" tab. `server/routes/admin/system/
  // assistant-daemon.ts`'s route is synchronous and answers as soon as a restart is INITIATED, never
  // once it's healthy (no such signal exists in the daemon supervisor — see that route's own doc), so
  // this never throws for the ordinary "refused right now" outcome (e.g. `{reason: "shutting down"}`,
  // `POST` answers `409`) — only a genuinely unexpected failure (network, 403, 500) still throws,
  // exactly like every other route in this file. Callers read live health separately, via
  // `getAssistantDaemonReadyz` below.
  restartAssistantDaemon: async (): Promise<{ ok: boolean; reason?: string }> => {
    try {
      return await authenticatedAdminRequest<{ ok: true }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/system/assistant-daemon/restart` });
    } catch (e) {
      if (e instanceof ApiError && typeof e.body?.reason === "string") return { ok: false, reason: e.body.reason };
      throw e;
    }
  },
  // `/readyz` (root-level, NOT under `/api/admin/v1` — see `apps/website/src/server/inbound/public-http/routes/ops/health.ts`) is
  // deliberately unauthenticated and carries `assistantDaemonKnownFailed: true` only while a fresh
  // agent-daemon failure is latched (`readiness-state.ts`). Read directly rather than through
  // `request()`: both `200` (ready) and `503` (not ready) are ordinary, meaningful bodies here, not
  // error cases to throw on — the whole point of this call is telling the two apart after a restart.
  getAssistantDaemonReadyz: async (): Promise<{ ready: boolean; assistantDaemonKnownFailed?: true }> => {
    // Raw response, but through the same bounded fetch as `request()`: a bare `fetch` here queued
    // forever once long-lived SSE connections had used up the origin's connection budget.
    const res = await fetchOrThrowUnreachable({ url: "/readyz", init: { credentials: "same-origin" } });
    // `/readyz` (`apps/website/src/server/inbound/public-http/routes/ops/health.ts`'s `registerReadyzRoute`) always answers JSON, on both
    // its `200` and `503` branches — so a non-JSON response here means something ELSE answered
    // instead of the real route: a dev-server proxy gap (fixed 2026-08-17 in `vite.config.ts`, but
    // this guard is not just a workaround for that — the same class of failure is possible in
    // production from a reverse proxy's own error page or a captive portal), a stale build, etc.
    // Calling `res.json()` unconditionally used to let a plain-text 404 throw a raw
    // `Unexpected token 'T', "The server"... is not valid JSON` straight into the UI (live-verified
    // finding, 2026-08-17) — the least informative thing a STATUS CHECK could possibly show.
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Could not check the assistant's status (unexpected response, HTTP ${res.status}).`);
    }
    try {
      return (await res.json()) as { ready: boolean; assistantDaemonKnownFailed?: true };
    } catch {
      throw new Error(`Could not check the assistant's status (malformed response, HTTP ${res.status}).`);
    }
  },
  // The SITE's encrypted provider credential (ADR-058) — a DIFFERENT key from the browser-local one
  // `lib/execution-settings.ts` keeps for this admin's own assistant, and the whole reason these three
  // routes exist. All three return the same write-only `{ data: SiteAssistantCredential }` view;
  // none of them can return key material. `PUT` additionally answers `503 SECRET_STORE_UNCONFIGURED`
  // when the server has no `TOVU_SITE_KEY` — a fail-closed operator error, not a bug,
  // and one screens must translate rather than show raw (see `features/ai-assistant/AiAssistant.tsx`).
  getAssistantSiteCredential: () =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential` }),
  setAssistantSiteCredential: (patch: SiteAssistantCredentialPatch) =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential`, body: patch }),
  deleteAssistantSiteCredential: () =>
    authenticatedAdminRequest<{ data: SiteAssistantCredential }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/assistant/site-credential` }),
  // The ADMIN's own encrypted provider credential — a DIFFERENT key from the site one directly
  // above, scoped to this admin rather than the workspace. Same write-only `{ data }` envelope and
  // the same `503 SECRET_STORE_UNCONFIGURED` PUT failure mode. See `lib/execution-settings.ts` for
  // the caller-facing wrapper (explicit save only — never called from the debounced ledger-slice
  // auto-save path a typed key would otherwise ride along with).
  getAdminExecutionCredential: () =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential` }),
  setAdminExecutionCredential: (patch: AdminExecutionCredentialPatch) =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "PUT", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential`, body: patch }),
  deleteAdminExecutionCredential: () =>
    authenticatedAdminRequest<{ data: AdminExecutionCredential }>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/assistant/execution-credential` }),

  // Collections (ADR-022/ADR-043) — content-types registry + entries. `/api/admin/v1/*`, not the
  // `/workspaces/{id}/*` shape the rest of this file uses — these routes take workspace from the
  // authed principal's session server-side, matching `database`/`recovery` below.
  listContentTypes: () => request<{ items: AdminContentType[] }>({ path: "/content-types" }),
  createContentType: (input: { key: string; label: string; fields: ContentTypeFieldDef[] }) =>
    request<{ contentType: AdminContentType }>({ path: "/content-types" }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  updateContentTypeFields: (
    { key, fields, expectedVersion }: { key: string; fields: ContentTypeFieldDef[]; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ contentType: AdminContentType }>({ path: `/content-types/${encodeURIComponent(key)}/fields` }, { init: {
      method: "PUT",
      body: JSON.stringify({ fields, expectedVersion }),
    } }),
  contentTypeLifecycle: (
    {
      key,
      op,
      expectedVersion,
    }: { key: string; op: ContentTypeLifecycleOp; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ contentType: AdminContentType }>({ path: `/content-types/${encodeURIComponent(key)}/lifecycle` }, { init: {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    } }),
  listEntries: (options: { type?: string } = {}) =>
    request<{ items: AdminEntry[] }>({ path: `/entries${querySuffix({ query: options.type ? "type=" + encodeURIComponent(options.type) : "" })}` }),
  createEntry: (
    input: { type: string; slug: string; title: string },
    options: { fieldsJson?: unknown; bodyJson?: unknown } = {}
  ) =>
    request<{ entry: AdminEntry }>({ path: "/entries" }, { init: { method: "POST", body: JSON.stringify({ ...input, ...options }) } }),
  updateEntry: (
    { id, expectedVersion }: { id: string; expectedVersion: number },
    // `bodyJson` was missing here, which made the rich-text half of an entry
    // edit untypeable — see `CollectionEntryEditor`'s save. `createEntry` above
    // has always accepted it, and `updatePost` does too.
    options: { title?: string; fieldsJson?: unknown; bodyJson?: unknown } = {}
  ) =>
    request<{ entry: AdminEntry }>({ path: `/entries/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, ...options }),
    } }),
  entryLifecycle: (
    { id, op, expectedVersion }: { id: string; op: "publish" | "unpublish"; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: AdminEntry }>({ path: `/entries/${encodeURIComponent(id)}/lifecycle` }, { init: {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    } }),

  // Categories & Tags (ADR-044) — taxonomies + terms.
  listTaxonomies: () => request<{ items: AdminTaxonomyWithTerms[] }>({ path: "/taxonomy" }),
  createTaxonomy: (input: { name: string; hierarchical: boolean }) =>
    request<{ taxonomy: AdminTaxonomy }>({ path: "/taxonomy" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  createTerm: (
    { taxonomyId, name }: { taxonomyId: string; name: string },
    options: { parentId?: string | null } = {}
  ) =>
    request<{ term: AdminTerm }>({ path: `/taxonomy/${encodeURIComponent(taxonomyId)}/terms` }, { init: {
      method: "POST",
      body: JSON.stringify({ name, parentId: options.parentId }),
    } }),
  renameTerm: (
    { termId, newName }: { termId: string; newName: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ term: AdminTerm }>({ path: `/taxonomy/terms/${encodeURIComponent(termId)}` }, { init: {
      method: "PUT",
      body: JSON.stringify({ newName }),
    } }),
  /** Additive: upserts one `entry_terms` row per `termIds` entry (never clears an existing,
   * unselected assignment — {@link unassignTerms} removes). Posts, pages and collection entries. */
  assignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>({ path: "/taxonomy/assign-terms" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** Removes each `termIds` assignment; one that is not there is a no-op. */
  unassignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>({ path: "/taxonomy/unassign-terms" }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** The term ids one post, page or entry holds now, sorted. */
  assignedTerms: ({ contentType, contentId }: { contentType: string; contentId: string }) =>
    request<{ termIds: string[] }>(
      { path: `/taxonomy/assigned-terms?contentType=${encodeURIComponent(contentType)}&contentId=${encodeURIComponent(contentId)}` }
    ),
  // Categories & Tags — merge-term ceremony (ADR-044, SPEC-018 C-207). 3-step plan/confirm/execute.
  planMergeTerm: (
    { fromTermId, intoTermId }: { fromTermId: string; intoTermId: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedPlanResult<MergeTermPlanDetails>>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/plan` }, { init: {
      method: "POST",
      body: JSON.stringify({ intoTermId }),
    } }),
  confirmMergeTerm: (
    { fromTermId, planId, planHash }: { fromTermId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/confirm` }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    } }),
  executeMergeTerm: (
    {
      fromTermId,
      intoTermId,
      confirmationToken,
    }: { fromTermId: string; intoTermId: string; confirmationToken: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ mergedCount: number }>({ path: `/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/execute` }, { init: {
      method: "POST",
      body: JSON.stringify({ intoTermId, confirmationToken }),
    } }),

  // Database — Timeline + restore points (ADR-041).
  getDatabaseTimeline: (options: {
    kind?: string;
    outcome?: string;
    fromDate?: string;
    toDate?: string;
    cursor?: string;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (options.kind) params.set("kind", options.kind);
    if (options.outcome) params.set("outcome", options.outcome);
    if (options.fromDate) params.set("fromDate", options.fromDate);
    if (options.toDate) params.set("toDate", options.toDate);
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return request<{ items: AdminLedgerRow[]; nextCursor: string | null }>(
      { path: `/database/timeline${querySuffix({ query: qs })}` }
    );
  },
  /** ADR-041 §3 — this site's drift classification. Read-only: there is deliberately no matching
   *  write/repair call, and the server exposes none. */
  getDatabaseSchemaState: () => request<AdminSchemaState>({ path: "/database/schema-state" }),

  // Database — migrate-forward ceremony (ADR-041 §3, SPEC-017 C-103/C-105). Plan takes no body —
  // the plan is computed entirely from the site's current migration/capability state server-side.
  planMigrateForward: () =>
    request<GatedPlanResult>({ path: "/database/migrate-forward/plan" }, { init: { method: "POST" } }),
  confirmMigrateForward: (
    { planId, planHash }: { planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>({ path: "/database/migrate-forward/confirm" }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    } }),
  executeMigrateForward: ({ confirmationToken }: { confirmationToken: string }, _optional: Record<string, never> = {}) =>
    request<MigrateForwardExecuteResult>({ path: "/database/migrate-forward/execute" }, { init: {
      method: "POST",
      body: JSON.stringify({ confirmationToken }),
    } }),

  // Recovery (ADR-045) — restore-points list (shared with Database), disclosure, deep-link, status,
  // and the restore ceremony itself (SPEC-019 C-301/C-302/C-303).
  listRecoveryRestorePoints: () => request<{ items: AdminRestorePoint[] }>({ path: "/recovery/restore-points" }),
  /** Same underlying `/database/restore-points` write `createDatabaseRestorePoint` above uses — the
   *  `restore_points` table is genuinely shared (see `AdminRestorePoint`'s own doc comment) and
   *  there is no separate Recovery-owned write route. Recovery grew its own create action
   *  (2026-09-10, restore-point functionality consolidation) so this gets a Recovery-named entry
   *  point for that reason, not because the backend route differs. */
  createRecoveryRestorePoint: (options: { trigger?: string; costAck?: boolean } = {}) =>
    request<{ restorePoint: AdminRestorePointSummary }>({ path: "/database/restore-points" }, { init: {
      method: "POST",
      body: JSON.stringify(options),
    } }),
  computeRecoveryDisclosure: ({ restorePointId }: { restorePointId: string }, _optional: Record<string, never> = {}) =>
    request<AdminDisclosureResult>({ path: "/recovery/disclosure" }, { init: {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    } }),
  resolveRecoveryDeepLink: (envelope: DatabaseContextEnvelope) =>
    request<AdminRecoveryDeepLinkResult>({ path: "/recovery/deep-link" }, { init: {
      method: "POST",
      body: JSON.stringify({ envelope }),
    } }),
  getRecoveryStatus: () => request<AdminRecoveryStatus>({ path: "/recovery/status" }),
  planRestore: ({ restorePointId }: { restorePointId: string }, _optional: Record<string, never> = {}) =>
    request<GatedPlanResult>({ path: "/recovery/restore/plan" }, { init: {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    } }),
  confirmRestore: (
    {
      planId,
      planHash,
      disclosureAcknowledged,
    }: { planId: string; planHash: string; disclosureAcknowledged: boolean },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>({ path: "/recovery/restore/confirm" }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash, disclosureAcknowledged }),
    } }),
  executeRestore: (
    { confirmationToken, restorePointId }: { confirmationToken: string; restorePointId: string },
    _options: Record<string, never> = {}
  ) =>
    request<RestoreExecuteResult>({ path: "/recovery/restore/execute" }, { init: {
      method: "POST",
      body: JSON.stringify({ confirmationToken, restorePointId }),
    } }),

  // Comments — the dashboard reads the queue here; moderation and settings use Jini.
  // Mirrors `getDatabaseTimeline`'s query-param-building shape for the paginated queue read.
  listCommentsQueue: (options: { status?: CommentStatus; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return authenticatedAdminRequest<AdminCommentsQueuePage>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/comments/queue${querySuffix({ query: qs })}` });
  },

  // -------------------------------------------------------------------------
  // Trash — the cross-domain recycle bin (design:
  // `ADS-memory/reports/2026-09-20-trash-delete-architecture.md`). Keyset paging like
  // `listCommentsQueue` above. Restore names items by `{entityType, entityId}` and purge by trash
  // ROW id — that asymmetry is the server's, and it is deliberate: the purge endpoint resolves each
  // row's kind itself rather than trusting one the client sent, so it cannot be told that a post is
  // a comment.
  // -------------------------------------------------------------------------
  listTrash: (options: { cursor?: string; limit?: number; entityTypes?: string[] } = {}) => {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.entityTypes?.length) params.set("entityTypes", options.entityTypes.join(","));
    const qs = params.toString();
    return authenticatedAdminRequest<AdminTrashPage>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/trash${querySuffix({ query: qs })}` });
  },
  restoreTrashItems: ({ items }: { items: { entityType: string; entityId: string }[] }) =>
    authenticatedAdminRequest<AdminTrashRestoreReport>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/restore`, body: { items } }),
  purgeTrashItems: ({ ids }: { ids: string[] }) =>
    authenticatedAdminRequest<AdminTrashPurgeReport>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/purge`, body: { ids } }),
  /** The generic single-item trash endpoint (`POST /trash/items`, `W/features/trash/`): the way
   *  every OTHER admin feature's delete button (forms, widgets, menus, terms, taxonomies) moves one
   *  row to the Trash, instead of each domain keeping its own bespoke delete call. */
  trash: ({ type, id }: { type: string; id: string }) =>
    authenticatedAdminRequest<{ ok: true; version: number | null }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/trash/items`, body: { type, id } }),

  // -------------------------------------------------------------------------
  // Widgets (SPEC-043, ADR-047) — mirrors the Menus client functions' exact shape
  // -------------------------------------------------------------------------
  listWidgets: (options: { widgetType?: string; includeInactive?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (options.widgetType) params.set("widgetType", options.widgetType);
    if (options.includeInactive) params.set("includeInactive", "true");
    const qs = params.toString();
    // `skippedCount`/`skippedIds` (dossier C5 follow-up, 2026-08-03) are additive and optional —
    // present only when the server dropped one or more malformed records. Absent in the common case.
    return authenticatedAdminRequest<{ widgets: AdminWidget[]; skippedCount?: number; skippedIds?: string[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/widgets${querySuffix({ query: qs })}` });
  },
  getWidget: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ widget: AdminWidget; whereUsed: AdminWidgetWhereUsed }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}` }),
  createWidget: (
    input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> },
    options: { slug?: string } = {}
  ) =>
    authenticatedAdminRequest<{ widget: AdminWidget }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/widgets`, body: { ...input, ...options } }),

  // SPEC-005 REQ-12..17 (1.1.0 UI amendment) — consumes REQ-10's PLUGINS_LIST/PLUGIN_SET_ENABLED
  // HTTP contract as a black box (ui.spec.md §3.1/§4.2).
  listPlugins: () => request<{ plugins: AdminPlugin[] }>({ path: `/workspaces/${WORKSPACE_ID}/plugins` }),
  /** PLUGIN_PROVIDER_SETTINGS (2026-10-26) — a provider plugin's declared settings card. */
  getPluginProviderSettings: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<AdminPluginProviderSettings>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/provider-settings` }),
  /** Saves and reapplies card values; a blank secret keeps the saved one. */
  savePluginProviderSettings: ({ pluginId, values }: { pluginId: string; values: Record<string, string> }, _optional: Record<string, never> = {}) =>
    request<AdminPluginProviderSettings>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/provider-settings` }, { init: {
      method: "PUT", body: JSON.stringify({ values }),
    } }),
  useProjectKey: ({ keyId, use }: { keyId: string; use: boolean }, _optional = {}) =>
    request<{ keyId: string; usedByThisSite: boolean; usedBy: string[]; appliesAt: "now" | "restart" | "failed"; message?: string }>({ path: `/workspaces/${WORKSPACE_ID}/project-keys/${encodeURIComponent(keyId)}/use` }, { init: { method: "PUT", body: JSON.stringify({ use }) } }),
  setPluginEnabled: ({ pluginId, enabled }: { pluginId: string; enabled: boolean }, _optional: Record<string, never> = {}) =>
    request<{ plugin: { id: string; version: string; enabled: boolean; updatedAt: string }; changeSetId: string }>(
      { path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}` },
      { init: { method: "PATCH", body: JSON.stringify({ enabled }) } }
    ),
  /** Moves a site plugin to the 60-day Trash. `PLUGIN_IN_TRASH` reports an existing parked copy. */
  uninstallPlugin: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<{ pluginId: string; trashed: true }>(
      { path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}` },
      { init: { method: "DELETE" } }
    ),
  /** PLUGIN_FILES (2026-09-13) — `GET /workspaces/:id/plugins/:pluginId/files`: the read-only,
   *  server-capped listing of one plugin's own files behind the Plugins screen's package-files
   *  viewer. Refuses `PLUGIN_NOT_FOUND` (404) and `PLUGIN_ID_INVALID` (400). */
  getPluginFiles: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<AdminPluginFiles>({ path: `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/files` }),

  // 2026-09-09 — AGENT_PLUGINS_LIST: the `agent-plugins` screen's read of real installed Agent
  // Plugins (a separate family from listPlugins/setPluginEnabled above — see AdminAgentPlugin's doc).
  listAgentPlugins: () => request<{ agentPlugins: AdminAgentPlugin[] }>({ path: `/workspaces/${WORKSPACE_ID}/agent-plugins` }),
  /** AGENT_PLUGIN_FILES (2026-09-13) — `GET /workspaces/:id/agent-plugins/:pluginId/files`: one
   *  installed Agent Plugin's files, switched on or off, behind the Agent Plugins eye button.
   *  Refuses `AGENT_PLUGIN_NOT_FOUND` (404). */
  getAgentPluginFiles: ({ pluginId }: { pluginId: string }, _optional: Record<string, never> = {}) =>
    request<AdminAgentPluginFiles>({ path: `/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}/files` }),
  /**
   * AGENT_PLUGIN_SET_ENABLED — turns one installed Agent Plugin on or off for this workspace.
   *
   * Returns the SINGLE updated row rather than a `changeSetId`, deliberately unlike
   * `setPluginEnabled` above: that family's route is `executeCommand`-wrapped and its client
   * re-fetches the whole list afterwards, while this one writes one JSON activation record and
   * hands back the row in `listAgentPlugins`' own shape, so the caller replaces it in place with no
   * second GET. See the route's own header for what skipping the gateway costs.
   *
   * `enabled` is validated server-side, not coerced — an omitted or non-boolean value is 400
   * `VALIDATION_ERROR` instead of a silent disable.
   */
  setAgentPluginEnabled: ({ pluginId, enabled }: { pluginId: string; enabled: boolean }, _optional: Record<string, never> = {}) =>
    request<{ agentPlugin: AdminAgentPlugin; warnings?: string[] }>({ path: `/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}` }, { init: {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    } }),

  // Deployment panel (`apps/website/src/server/inbound/admin-http/routes/system/deployment-overview.ts` /
  // `dockerfile-source.ts`) — `system.read`-gated, same shape as `getModuleStatus` just above.
  /** Runtime mode, boot-gate/default-password status, agent-daemon known-failure state, db/uploads
   *  paths, and required-env-var presence (never values) — the Deployment panel's Overview tab. */
  getDeploymentOverview: () =>
    request<AdminDeploymentOverview>({ path: `/workspaces/${WORKSPACE_ID}/system/deployment-overview` }),

  // Observability panel, Overview tab (`apps/website/src/server/inbound/admin-http/routes/system/
  // observability-status.ts`) — `system.read`-gated, same shape as `getDeploymentOverview` above.
  /** Whether `platform/observability`'s real OTel adapter is on right now, and under what service
   *  name — never the OTLP endpoint value itself. See {@link AdminObservabilityStatus}. */
  getObservabilityStatus: () =>
    request<AdminObservabilityStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/observability-status` }),
  sendObservabilityTestError: () => request<AdminTelemetryTestResult>({ path: `/workspaces/${WORKSPACE_ID}/system/observability/test-error` }, { init: { method: "POST" } }),
  /** Owner-only filter over native CLI fallback entries in the existing audit store. */
  getToolGaps: () => request<{ entries: import('@jini-ai/daemon/tool-audit').ToolGapEntry[] }>({ path: `/workspaces/${WORKSPACE_ID}/system/tool-gaps` }),
  /** Recent captured server log lines (`routes/system/server-logs.ts`, `system.read`-gated) — the
   *  Observability "Recent errors" tab. */
  getServerLogs: (query: AdminServerLogsQuery = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
    const qs = params.toString();
    return request<AdminServerLogs>({ path: `/workspaces/${WORKSPACE_ID}/system/server-logs${querySuffix({ query: qs })}` });
  },
  /** Whether outbound email really sends — the form editor greys out its notify settings when not. */
  getMailStatus: () => request<AdminMailStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/mail-status` }),

  // Sites panel (`apps/website/src/server/inbound/admin-http/routes/system/sites.ts`) — list is
  // `system.read`, create/activate are `system.write` AND additionally refused with
  // `SITE_SWITCHING_DISABLED` when the deployment capability flag is off. Same `system.*` split as
  // `getDockerfileSource`/`setDockerfileSource` immediately above.
  /** Every site under `sites/`, plus what this server process is ACTUALLY bound to right now and
   *  any pending activate choice — see {@link AdminSitesSnapshot}. */
  getSitesConfig: () => request<SitesUserConfig>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/config` }),
  setSitesConfig: (input: SitesUserConfigPatch) => request<SitesUserConfig>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/config` }, { init: { method: "PUT", body: JSON.stringify(input) } }),
  setSitesHome: (input: { path: string }) => request<{ home: string }>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/home` }, { init: { method: "PUT", body: JSON.stringify(input) } }),
  listSites: () => request<AdminSitesSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/sites` }),
  /** Create `sites/<name>/` through the same `initSite` path `tovu init` uses. `409`
   *  `SITE_ALREADY_EXISTS` when the directory is occupied, `400` `VALIDATION_ERROR` for a name
   *  outside `[a-z0-9-]{1,100}`. */
  createSite: (input: { name: string; adminPassword?: string; agentPluginTokens?: Record<string, string> }) =>
    request<{ site: AdminCreatedSite; agentPluginTokens?: AdminCreatedSiteAgentPluginTokens }>({ path: `/workspaces/${WORKSPACE_ID}/system/sites` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** Installed Agent Plugins that take a pasted access token — the create form's optional
   *  "connect now" fields. A given token is checked, then applied on the new site's first start. */
  listTokenSignInPlugins: () =>
    request<{ plugins: AdminTokenSignInPlugin[] }>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/token-sign-in-plugins` }),
  /** Persist `name` as the site the NEXT boot serves. Writes `TOVU_SITE=<name>` to the repo-root
   *  `.env` and returns restart instructions — it does not kill, signal, or re-exec anything, and
   *  this process keeps serving whatever it booted with. See {@link AdminSiteActivation}. */
  activateSite: ({ name }: { name: string }, _optional: Record<string, never> = {}) =>
    request<AdminSiteActivation>(
      { path: `/workspaces/${WORKSPACE_ID}/system/sites/${encodeURIComponent(name)}/activate` },
      { init: { method: "POST" } }
    ),
  manageLocalSite: (input: { name: string; action: AdminLocalSiteAction; confirmed?: boolean; checked?: boolean }) => {
    const name = encodeURIComponent(input.name);
    if (input.action === "switch") return request<AdminSiteActivation>(
      { path: `/workspaces/${WORKSPACE_ID}/system/sites/${name}/activate` }, { init: { method: "POST", body: JSON.stringify({ restartNow: true }) }, onOk: () => adminFailureChannel.reset() });
    const path = input.action === "restore" || input.action === "delete"
      ? `trash/${name}/${input.action}` : `${name}/${input.action}`;
    return request<unknown>({ path: `/workspaces/${WORKSPACE_ID}/system/sites/${path}` }, { init: {
      method: "POST", body: JSON.stringify({ confirmed: input.confirmed, checked: input.checked }),
    } });
  },
  /** The repo-root `Dockerfile`'s current contents, or `{ exists: false }` when none has been
   *  generated yet, plus its `etag` merged in from the response's own `ETag` header (never the JSON
   *  body — see {@link AdminDockerfileSource.etag}'s own doc). */
  getDockerfileSource: (): Promise<AdminDockerfileSource> => {
    let etag = "";
    return authenticatedAdminRequest<{ exists: boolean; contents: string | null }>(
      { method: "GET", path: `/workspaces/${WORKSPACE_ID}/system/dockerfile` },
      { onOk: ({ response }, _optional = {}) => {
        etag = response.headers.get("ETag") ?? "";
      } }
    ).then((body) => ({ ...body, etag }));
  },
  /** 2026-08-15 — `PUT` half of the Dockerfile tab, `system.write`-gated (distinct from the `GET`
   *  above's `system.read`, mirroring `triggerSiteExport`'s own `system.export` vs `system.read`
   *  split below). Overwrites the repo-root Dockerfile with `contents` and returns the snapshot it
   *  now has — this only writes bytes to disk, it never builds or deploys anything.
   *
   *  `ifMatch` (the etag from the last `getDockerfileSource`/`setDockerfileSource` response) is sent
   *  as the `If-Match` request header and REQUIRED by the server — a stale value rejects with a
   *  `412` `ApiError` whose `.body.current` carries the real `{exists, contents}` currently on disk,
   *  a missing/empty one with `400`; see {@link AdminDockerfileSource.etag}'s own doc for why. */
  setDockerfileSource: ({ contents, ifMatch }: { contents: string; ifMatch: string }, _optional: Record<string, never> = {}): Promise<AdminDockerfileSource> => {
    let etag = "";
    return authenticatedAdminRequest<{ exists: boolean; contents: string | null }>(
      { method: "PUT", path: `/workspaces/${WORKSPACE_ID}/system/dockerfile`, body: { contents } },
      { headers: { "If-Match": ifMatch }, onOk: ({ response }, _optional = {}) => {
        etag = response.headers.get("ETag") ?? "";
      } }
    ).then((body) => ({ ...body, etag }));
  },

  // Static Site tab (`apps/website/src/server/inbound/admin-http/routes/system/export-site.ts`) — trigger + poll, not a
  // single synchronous call: a real export can take seconds to minutes, so `triggerSiteExport`
  // returns the moment the run STARTS (202) and a caller polls `getSiteExportStatus` for the
  // outcome. `system.export`-gated on trigger (writes to disk), `system.read` on the poll.
  /** Starts a new static-site export. `409` (surfaced as a thrown error by `request`, same as any
   *  non-2xx) if one is already running — this instance runs at most one export at a time. */
  triggerSiteExport: (options?: { clean?: boolean; basePath?: string }) =>
    request<AdminExportRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/export` }, { init: {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    } }),
  /** The current/most recent export run's status — poll this after `triggerSiteExport` until
   *  `status` is no longer `"running"`. */
  getSiteExportStatus: () => request<AdminExportRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/export` }),

  // Static Site tab "Getting it online" card (`apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts`) —
  // publishing the current export straight to an installed static host plugin's target.
  // Same trigger+poll shape as
  // the export pair just above, plus a third pure-read preview route with no run of its own.
  /** Read-only: validates `config`, reports the base path a real publish would use (always
   *  SERVER-derived — see {@link AdminStaticPublishConfig}'s own doc), and whether a credential is
   *  configured for the target (a boolean only, never the credential itself). Never starts a run. */
  getPublishPreview: (config: AdminStaticPublishConfig) => {
    const query = new URLSearchParams({ ...config.fields, target: config.target });
    return request<AdminStaticPublishPreview>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/preview?${query.toString()}` });
  },
  /** The deploy targets the installed hosting plugins provide, with their publish and credential
   *  form fields — the publish card renders from this. */
  getPublishTargets: () =>
    request<{ targets: AdminPublishTargetDescriptor[] }>({ path: `/workspaces/${WORKSPACE_ID}/system/publish-targets` }).then((res) => res.targets),
  /** Starts a new publish to `config.target`. `409` (surfaced as a thrown error) if one is already
   *  running — this instance runs at most one publish at a time, independent of a plain export.
   *
   *  `credentialId` names the saved connection the operator chose, and BINDS the publish to it
   *  (terra review 2026-09-20, finding 1 — Critical): without it the server resolved whichever row
   *  was `is_default` when the POST landed, so picking connection B and clicking Publish while B's
   *  promotion was still in flight published the site to A's account. The server validates the id
   *  against this workspace and this target and REFUSES on a mismatch — it never falls back to the
   *  default (`static-publish/credentials.ts`). Omitted entirely (never sent as an explicit
   *  `undefined`) when this provider has no saved connection — an install publishing from server
   *  env vars has no connection ids at all, and that caller keeps the default lookup. */
  triggerPublish: (input: { config: AdminStaticPublishConfig; projectName: string; credentialId?: string }) =>
    request<AdminPublishRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/publish` }, { init: {
      method: "POST",
      body: JSON.stringify({
        ...input.config.fields,
        target: input.config.target,
        projectName: input.projectName,
        ...(input.credentialId !== undefined ? { credentialId: input.credentialId } : {}),
      }),
    } }),
  /** The current/most recent publish run's status — poll this after `triggerPublish` until `status`
   *  is no longer `"running"`. */
  getPublishStatus: () => request<AdminPublishRunSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/publish` }),
  /** Past static publishes, Tovu peers pushed to, and deploys of this site, newest first. Read-only:
   *  publishing again still goes through `triggerPublish` or the publish-content push. */
  listPublishDestinations: () =>
    request<AdminPublishDestination[]>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/destinations` }),

  // Static Site tab "Getting it online" card → credential management (`apps/website/src/server/inbound/admin-http/routes/
  // system/publish-credentials.ts`) — named provider connections for `triggerPublish`, stored
  // encrypted server-side and never read back. See `AdminPublishCredentialSummary`'s own doc for
  // exactly what a saved row can and cannot reveal.
  /** Every configured credential for this workspace, plus the server's own `executionMode` — the
   *  ONLY source of truth for whether this instance can drive a CLI locally or needs a stored
   *  credential to publish at all. Never sniffed client-side; see `AdminPublishExecutionMode`'s doc. */
  listPublishCredentials: () =>
    request<AdminPublishCredentialsSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/credentials` }),
  /** Creates one named connection. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError` with that
   *  `code`) if this workspace already has a credential with the same label — labels are the only
   *  human-facing identifier a reader has for telling two connections apart, so silently allowing a
   *  second row with the same one would make the list ambiguous. `isDefault` is optional — omitted
   *  entirely (not `false`) lets the server apply its own default-assignment rule (e.g. a provider's
   *  first-ever saved connection), rather than this admin guessing at it. */
  createPublishCredential: (input: { label: string; connection: AdminPublishConnectionInput; isDefault?: boolean; worksFor?: string[] }) =>
    request<{ credential: AdminPublishCredentialSummary; verification?: AdminPublishCredentialVerification }>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/credentials` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** Updates a credential's label, connection, and/or default status. Omitting `connection` entirely
   *  — never sending it as an empty object or blank fields — is what keeps the stored secret
   *  untouched; see `use-publish-credentials.hooks.ts`'s header for why the form can never send a
   *  half-blank one. `isDefault: true` makes this the default connection for its provider (the server
   *  owns clearing any previous default for that same provider); omitted leaves default status
   *  unchanged. `worksFor` omitted preserves compatibility; [] clears it without a connection. */
  updatePublishCredential: ({ id, input }: { id: string; input: { label?: string; connection?: AdminPublishConnectionInput; isDefault?: boolean; worksFor?: string[] } }, _optional: Record<string, never> = {}) =>
    request<{ credential: AdminPublishCredentialSummary; verification?: AdminPublishCredentialVerification }>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify(input),
    } }),
  /** `204`, idempotent — deleting an id that is already gone (a stale list, a double click) still
   *  resolves rather than throwing. */
  deletePublishCredential: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}` }, { init: { method: "DELETE" } }),
  /** Re-checks one already-saved credential against its real provider right now — the human-facing
   *  counterpart to the best-effort verify a create/update already runs automatically, for when that
   *  cached result has gone stale (a rotated token) or was lost (a server restart clears the
   *  in-memory verification cache; see `AdminPublishCredentialSummary.accountLabel`'s doc for why the
   *  DB-persisted half of this survives that even though this specific response does not). Never
   *  4xxs for an unreachable or rejected provider — a failed verification is still a `200` carrying
   *  `status: "invalid" | "unreachable"`, only a genuinely missing credential id 404s. */
  verifyPublishCredential: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ verification: AdminPublishCredentialVerification }>({ path: `/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}/verify` }, { init: {
      method: "POST",
    } }),

  // Secrets panel → site key tab (`src/server/inbound/admin-http/routes/system/site-key.ts`)
  // — status of the TOVU_SITE_KEY site key's generated-file fallback, an explicit
  // reveal action, and a create-only generate action. `admin.security.site-key.manage`-gated
  // server-side on every one of the three calls below. See that route file's own header for the
  // 2026-09-09 durability fix (a generated key file now genuinely protects every stored credential
  // in production too, with one disclosed gap: webhook signing/newsletter tokens still need the
  // env var there) and for the accepted security tradeoff of a key file living beside the
  // database it protects.
  /** Never throws for "no key active" — that is `{active: false, source: "none"}`, a normal 200,
   *  not an error. Never carries the key value — see `revealSiteKey` for that. */
  getSiteKeyStatus: () => request<AdminSiteKeyStatus>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key` }),
  /** Returns the raw key value (whichever source is active) when one is set — a deliberate,
   *  explicit, separately-clickable action, never fired on page load. Superseded an earlier
   *  fingerprint-only brief (owner: "i want that token to be visible to admins or else when it
   *  breaks they have no idea whats going on"). No audit trail — this codebase has no
   *  general-purpose sensitive-read audit mechanism to hook into (checked; not built here). */
  revealSiteKey: () =>
    request<AdminRevealedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/reveal` }, { init: { method: "POST" } }),
  /** Makes sure this site has the RIGHT key, never a second one (2026-09-29): resolves `200`
   *  `already-active`/`recovered` or `201` `created` ({@link AdminSiteKeyGenerateOutcome}).
   *  Refusals are `409 {error, detail}`, nothing written, thrown as an `ApiError` whose `.message`
   *  is the code and whose `.body.detail` is a plain-words sentence: `KEY_DEPENDENT_DATA` (saved
   *  credentials need a key that is not here), `KEY_MISMATCH` (the key here is not the one they
   *  were locked with), `KEY_INVALID` (a key is set but malformed), `SITE_META_UNREADABLE`, and in
   *  production `ALREADY_EXISTS` (a key file appeared mid-request). See `use-site-key.hooks.ts`'s
   *  `classifySiteKeyGenerateError`. Never overwrites or rotates a key. */
  generateSiteKey: () =>
    request<AdminGeneratedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/generate` }, { init: { method: "POST" } }),
  /** "Paste your old token": installs `token` only once it opens this site's saved credentials,
   *  moving anything saved under the key in place onto it first. Refusals throw an `ApiError` with
   *  a plain `.body.detail`: `TOKEN_INVALID` (400), `TOKEN_DOES_NOT_OPEN`, `ENV_KEY_SET`,
   *  `RESTORE_POINT_UNAVAILABLE`, `SITE_META_UNREADABLE` (409). */
  importSiteKey: (input: { siteKey: string }, _optional = {}) =>
    request<AdminImportedSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/import` }, { init: { method: "POST", body: JSON.stringify(input) } }),
  /** What "Start fresh" would remove and which webhooks get a new signing secret. Changes nothing. */
  previewSiteKeyStartFresh: () =>
    request<AdminSiteKeyStartFreshPreview>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/start-fresh` }),
  /** "Start fresh": restore point, remove what can't be unlocked, install the key. `confirm` must be
   *  `START FRESH` (else 400 `CONFIRMATION_REQUIRED`); other refusals as {@link importSiteKey}'s
   *  plus `STORAGE_SECRET_LOCKED`. */
  startFreshSiteKey: ({ confirm }: { confirm: string }, _optional: Record<string, never> = {}) =>
    request<AdminStartedFreshSiteKey>({ path: `/workspaces/${WORKSPACE_ID}/system/site-key/start-fresh` }, { init: { method: "POST", body: JSON.stringify({ confirm }) } }),

  // Source Control page → credential management (`apps/website/src/server/inbound/admin-http/routes/system/
  // source-control-credentials.ts`) — one saved GitHub/GitLab/Bitbucket identity connection per
  // provider, stored encrypted server-side and never read back. Structurally mirrors the
  // publish-credentials block above; see `AdminSourceControlCredentialSummary`'s own doc for
  // exactly what a saved row can and cannot reveal. `source-control.credentials.write`-gated on
  // every verb server-side — NOT the same permission as the publish-credentials calls above (see
  // that route's own header for why connecting a source-control identity is not a publish
  // trigger).
  /** The source-control hosts switched-on plugins declare, with their credential forms. */
  listSourceControlProviders: () => request<AdminSourceControlProvidersSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/source-control/providers` }),
  /** Every configured source-control credential for this workspace. */
  listSourceControlCredentials: () =>
    request<AdminSourceControlCredentialsSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/source-control/credentials` }),
  /** Creates one named connection. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError` with that
   *  `code`) if this workspace already has a credential with the same `(providerId, label)`.
   *  `isDefault` is optional — omitted entirely (not `false`) lets the server apply its own
   *  default-assignment rule (a provider's first-ever saved connection), rather than this admin
   *  guessing at it. */
  createSourceControlCredential: (input: { label: string; connection: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    request<{ credential: AdminSourceControlCredentialSummary }>({ path: `/workspaces/${WORKSPACE_ID}/system/source-control/credentials` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** Updates a credential's label, connection, and/or default status. Omitting `connection`
   *  entirely — never sending it as an empty object or blank fields — is what keeps the stored
   *  secret untouched; see `use-source-control-credentials.hooks.ts`'s header for why the form can
   *  never send a half-blank one. */
  updateSourceControlCredential: ({ id, input }: { id: string; input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean } }, _optional: Record<string, never> = {}) =>
    request<{ credential: AdminSourceControlCredentialSummary }>({ path: `/workspaces/${WORKSPACE_ID}/system/source-control/credentials/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify(input),
    } }),
  /** `204`, idempotent — deleting an id that is already gone (a stale list, a double click) still
   *  resolves rather than throwing. Not called anywhere on this page today (there is no delete
   *  affordance in the UI — replacing a token PUTs over the existing row), kept for parity with
   *  the publish-credentials block above. */
  deleteSourceControlCredential: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/system/source-control/credentials/${encodeURIComponent(id)}` }, { init: { method: "DELETE" } }),

  /** Owner-only Shared Keys metadata; no other site inventories or credential values. */
  listCredentialCopySources: (_required: Record<string, never>, options: AuthenticatedAdminRequestOptions = {}) =>
    authenticatedAdminRequest<{ sources: AdminCredentialCopySource[] }>({
      path: `/workspaces/${WORKSPACE_ID}/system/credential-copy`, method: "GET",
    }, options),
  /** Approve one saved key for this site; a key saved on another site is added to Shared Keys first. sourceSiteId is the fixed shared-keys group. */
  copyCredentials: (input: { sourceSiteId: string; ids: string[]; overwrite: boolean }, options: AuthenticatedAdminRequestOptions = {}) =>
    authenticatedAdminRequest<{ results: AdminCredentialCopyResult[] }>({
      path: `/workspaces/${WORKSPACE_ID}/system/credential-copy`, method: "POST", body: input,
    }, options),

  // Access Tokens page → "Add custom provider" (`apps/website/src/server/inbound/admin-http/routes/system/
  // custom-credentials.ts`) — a user-defined provider (name, base URL, token, optional username,
  // category), stored encrypted server-side and never read back. Structurally mirrors the
  // source-control-credentials block above. `custom-credentials.write`-gated on every verb
  // server-side.
  /** Every configured custom-provider credential for this workspace. */
  listCustomCredentials: () => request<AdminCustomCredentialsSnapshot>({ path: `/workspaces/${WORKSPACE_ID}/system/custom/credentials` }),
  /** Creates one custom-provider credential. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError`
   *  with that `code`) if this workspace already has one with the same `label`. */
  createCustomCredential: (input: {
    scope?: "project" | "site";
    worksFor?: string[];
    label: string;
    category: AdminCustomCredentialCategoryId;
    baseUrl: string;
    /** Omitted = no extra hosts beyond `baseUrl` (server-side default — see
     *  `validateAdditionalHosts`'s own doc). */
    additionalHosts?: readonly string[];
    connection: AdminCustomConnectionInput;
  }) =>
    request<{ credential: AdminCustomCredentialSummary }>({ path: `/workspaces/${WORKSPACE_ID}/system/custom/credentials` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** Updates a credential's label, category, base URL, additional hosts, username, and/or
   *  connection. Omitting `connection` entirely — never sending it as an empty object or blank
   *  fields — is what keeps the stored secret untouched, same contract every sibling credential
   *  update call documents. Omitting `additionalHosts` leaves it unchanged; supplying it REPLACES
   *  the whole list (never merges), matching `updateCustomCredential`'s own server-side contract.
   *  `username` is independent of `connection` (2026-09-01, `store.ts`'s own precedence doc): omit
   *  it to leave the saved username exactly as `connection` (if sent) would otherwise set it, send
   *  `null` to clear it, or a non-empty string to set it — with NO token retype required either
   *  way. When both `username` and `connection` are sent in the same call, `username` wins for what
   *  gets stored in the plaintext column (server-side precedence, not a client-side rule).
   *  `worksFor` omitted preserves compatibility; [] clears it without a connection. */
  updateCustomCredential: ({ id, input }: { id: string; input: {
      worksFor?: string[];
      label?: string;
      category?: AdminCustomCredentialCategoryId;
      baseUrl?: string;
      additionalHosts?: readonly string[];
      username?: string | null;
      connection?: AdminCustomConnectionInput;
    } }, _optional: Record<string, never> = {}
  ) =>
    request<{ credential: AdminCustomCredentialSummary }>({ path: `/workspaces/${WORKSPACE_ID}/system/custom/credentials/${encodeURIComponent(id)}` }, { init: {
      method: "PUT",
      body: JSON.stringify(input),
    } }),
  /** `204`, idempotent. */
  deleteCustomCredential: ({ id }: { id: string }, _optional: Record<string, never> = {}) => request<void>({ path: `/workspaces/${WORKSPACE_ID}/system/custom/credentials/${encodeURIComponent(id)}` }, { init: { method: "DELETE" } }),


  // Publish Content — the peer push ceremony behind the Dashboard's "Publish Content"
  // button (`ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 11).
  // Same 3-endpoint gated-mutation shape as `planMergeTerm`/`planRestore` above; the result types
  // come from `@tovu/publish-content-ui` so this client and the server's own planner cannot hold
  // two drifting copies of the report shape.
  //
  // Every call names a PEER by id. A raw peer URL or credential is never sent from the browser and
  // never returned to it — `PublishContentPeerSummary` carries `masked`/`hasCredential` and nothing
  // else credential-shaped (Task 10 owns the sealing).
  listPublishContentPeers: () =>
    request<{ peers: PublishContentPeerSummary[] }>({ path: `/workspaces/${WORKSPACE_ID}/publish-content/peers` }),
  /** Zero-setup connect — reads whether this install already publishes somewhere, and if not, the
   *  candidate pre-filled from the repo's own deploy config
   *  (`routes/publish-content/destination.ts`). Nothing credential-shaped is ever in this response:
   *  see that route's own header for why. */
  getPublishDestination: () => request<AdminPublishDestinationView>({ path: publishContentDestinationPath() }),
  /** The one action that turns a fresh install into a connected one — no key is minted, displayed
   *  or copied. `siteUrl` is optional; omitted, the server falls back to its own candidate, which is
   *  the only path the Dashboard's empty-state offer uses. */
  connectPublishDestination: (input: { siteUrl?: string } = {}) =>
    request<AdminPublishDestinationView>({ path: `${publishContentDestinationPath()}/connect` }, { init: {
      method: "POST",
      body: JSON.stringify(input),
    } }),
  /** `selectedEntityKeys` (the report rows' own `entityType:entityId` keys) narrows the bundle this
   *  push stages on the peer BEFORE it plans — omitted means "everything", which is what an
   *  untouched dialog sends. See `features/publish-content/export-bundle.ts`'s `selectBundleEntities`
   *  for why a selection is applied at stage time rather than carried into execute.
   *
   *  `overwriteEntityKeys` (publish-overwrite-live-plan §4/S9) is the operator's ticked "Overwrite on
   *  live" rows — sent alongside `selectedEntityKeys`, never in place of it, so re-planning against a
   *  narrower selection never silently drops what was ticked. Omitted means nothing was ticked.
   *
   *  `scope` (`plan-publish-sections-2026-09-25.md` §2 S2) narrows the bundle on the SERVER before
   *  `selectedEntityKeys` does, same "absent means everything" contract. Sent unchanged on every call
   *  the dialog was opened with a scope for. */
  planPublishContent: ({
    peerId,
    selectedEntityKeys,
    overwriteEntityKeys,
    scope,
  }: {
    peerId: string;
    selectedEntityKeys?: readonly string[];
    overwriteEntityKeys?: readonly string[];
    scope?: PublishScope;
  }) =>
    request<PublishContentPlanResult>({ path: `${publishContentPeerPath({ peerId })}/push/plan` }, { init: {
      method: "POST",
      ...(selectedEntityKeys === undefined && overwriteEntityKeys === undefined && scope === undefined
        ? {}
        : {
            body: JSON.stringify({
              ...(selectedEntityKeys === undefined ? {} : { selectedEntityKeys }),
              ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys }),
              ...(scope === undefined ? {} : { scope }),
            }),
          }),
    } }),
  confirmPublishContent: (
    { peerId, planId, planHash }: { peerId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentConfirmResult>({ path: `${publishContentPeerPath({ peerId })}/push/confirm` }, { init: {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    } }),
  /** `bundleId` comes from `planPublishContent`'s own response and is required: the peer's
   *  `/import/execute` refuses a confirmation token against any bundle but the one it planned.
   *  `overwriteEntityKeys` (publish-overwrite-live-plan §4/S9) is echoed straight from the confirmed
   *  plan's own `overwriteEntityKeys` — never re-derived here — so execute can only force the exact
   *  set the operator's plan was already confirmed against. */
  executePublishContent: (
    {
      peerId,
      bundleId,
      confirmationToken,
      overwriteEntityKeys,
    }: { peerId: string; bundleId: string; confirmationToken: string; overwriteEntityKeys?: readonly string[] },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentExecuteResult>({ path: `${publishContentPeerPath({ peerId })}/push/execute` }, { init: {
      method: "POST",
      body: JSON.stringify({ bundleId, confirmationToken, ...(overwriteEntityKeys === undefined ? {} : { overwriteEntityKeys }) }),
    } }),
};
