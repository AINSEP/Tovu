import type {
  PublishContentConfirmResult,
  PublishContentExecuteResult,
  PublishContentPeerSummary,
  PublishContentPlanResult,
} from "@tovu/publish-content-ui";

import { isPageUnloading } from "./page-lifecycle";
import { siteUrl } from "./site-url";

export const WORKSPACE_ID = "workspace-local";

const BASE = "/api/admin/v1";

/** The peer-scoped prefix every publish-content push call hangs off — the peer is named in the PATH
 *  (`routes/publish-content/peer-transport.ts`), never in a body, and never as a URL or credential. */
function publishContentPeerPath(peerId: string): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/peers/${encodeURIComponent(peerId)}`;
}

/** The zero-setup connect action's own path — a workspace-scoped singleton, not peer-scoped, since
 *  there is nothing to name until it exists (`routes/publish-content/destination.ts`). */
function publishContentDestinationPath(): string {
  return `/workspaces/${WORKSPACE_ID}/publish-content/destination`;
}

export interface AdminUser {
  id: string;
  username: string;
}

/**
 * SPEC-007 Settings (core-only layered ledger) — client-side types mirroring
 * `features/settings/types.ts` + `api.spec.md` §5 response contracts.
 *
 * Note: only the 5 routes actually shipped in Phase 5 exist server-side
 * (`register-definitions`, `get-effective`, `set`, `clear`, `reset`) —
 * `SETTINGS_GET_RAW`/`SETTINGS_LIST_DEFINITIONS` from api.spec.md §1 were
 * deliberately not built (tasks.md T044). `Settings.tsx` works around the
 * absence of a raw per-layer read and a definitions listing by composing two
 * `getSettingsEffective` calls (with/without `principalId`) to distinguish the
 * user layer from the rest — see that file's header comment for the exact
 * technique and its known limits.
 */
export type SettingScope = "global" | "workspace" | "user";

export interface SettingResolvedValue {
  key: string;
  value: unknown;
  sourceLayer: "user" | "workspace" | "global" | "default";
  defVersion: number;
}

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
 * `src/media/provider-credential-store.ts`'s `MediaProviderCredentialView` on the server. `apiKey`
 * is send-only: the operator types one and it goes up, but no response ever carries it back — a
 * stored key comes back as `apiKeyConfigured`/`apiKeyTail` instead.
 */
export interface AdminMediaProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
  apiKeyTail?: string;
  source?: string;
}

export type AdminMediaProviderMap = Record<string, AdminMediaProviderCredentials>;

/**
 * One configured external MCP server, as the admin tab sees it. Mirrors
 * `src/assistant/external-mcp-store.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server.
 */
/**
 * The OAuth half of {@link AdminExternalMcpServer}. Mirrors
 * `src/assistant/external-mcp-store.ts`'s `ExternalMcpOAuthView` — never carries an access token, a
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
 * `src/assistant/external-mcp-store.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server. `url`/`authMode`/`oauth` are the same posture applied
 * to the two fields the generic streamable-HTTP + OAuth transport added on top of the original
 * stdio-only shape.
 */
export interface AdminExternalMcpServer {
  serverId: string;
  label: string;
  transport: string;
  /** One of `src/assistant/external-mcp-store.ts`'s `EXTERNAL_MCP_AUTH_MODES` — `none` | `static_env` | `oauth`. */
  authMode: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a `streamable_http` server. `null` for `stdio`, where `command` is used instead. */
  url: string | null;
  args: string[];
  allowedToolNames: string[];
  /**
   * The operator's SECOND, write-authorization list — mirrors
   * `src/assistant/external-mcp-store.ts`'s `ExternalMcpServerView.writeAllowedToolNames`. A remote
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
 * `src/assistant/mcp-federation/ports.ts`'s `RemoteToolAnnotations` verbatim. Self-declared by the
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

/** One of `src/assistant/mcp-federation/trust.ts`'s `ToolRefusalReason` members — why the admission
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
 * write-tool picker — mirrors `mcp-federation/trust.ts`'s `RemoteToolSurfaceEntry` verbatim, field
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
 * `mcp-federation/trust.ts`'s `FederatedAdmissionReport`, FLATTENED per connection by
 * {@link api.getExternalMcpAdmissions} (see {@link RawAdmissionConnection} for why that flattening
 * step exists and is not optional).
 *
 * `admitted` intentionally carries only what a drift banner needs (a name and whether it is
 * write-authorized), not the full `AdmittedFederatedTool` the daemon holds (which also carries a
 * `toolId` and the remote's raw input schema) — same "richer server shape, unread extra fields"
 * precedent {@link AdminConnector}'s own doc states.
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
 * either. Most commonly a sealed env block that failed to decrypt because the site token is not
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
 *  `DeploymentEnvVarStatus` in `src/server/routes/admin/system/deployment-overview.ts`. */
export interface AdminDeploymentEnvVarStatus {
  name: string;
  set: boolean;
}

/** One publish CLI's presence on the SERVER process's PATH (never the browser's) — mirrors
 *  `DeployCliStatus` in `src/server/routes/admin/system/deployment-overview.ts`. A real filesystem
 *  check (`isOnPath`, committed 2026-08-15), not a placeholder: `installed` is either `true` or
 *  `false`, never a third "unknown" state, so a caller renders a real pill for it directly rather
 *  than a "can't tell yet" sentence. */
export interface AdminDeployCliStatus {
  name: string;
  installed: boolean;
}

/** Mirrors `DeploymentOverviewSnapshot` in `src/server/routes/admin/system/deployment-overview.ts`
 *  — see that type's own doc comments for what each field does and does not prove. */
export interface AdminDeploymentOverview {
  mode: "production" | "local";
  productionReadinessGate: { applicable: boolean; passed: boolean };
  defaultOwnerPasswordUnsafe: boolean;
  daemonKnownFailed: boolean;
  dbPath: string;
  uploadsDir: string;
  envVars: AdminDeploymentEnvVarStatus[];
  /** `gh`/`vercel` PATH presence, in server display order. See {@link AdminDeployCliStatus}. */
  deployClis: AdminDeployCliStatus[];
}

/** Mirrors `ObservabilityConfig` in `apps/website/src/platform/observability/config.ts`, flattened
 *  for the wire the same way {@link AdminDeploymentOverview} flattens its own source config.
 *  `serviceName` is `null` whenever `enabled` is `false` — there is no service name to report for
 *  a port that never loads the OTel SDK. Deliberately does NOT carry the OTLP endpoint itself: that
 *  can embed a collector hostname or credential, and this status read only needs to answer on/off. */
export interface AdminObservabilityStatus {
  enabled: boolean;
  serviceName: string | null;
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
   *  `.site-meta.json` marker existed (this repo's own `sites/tovu-com`), which is how the list can
   *  come back EMPTY on a server that is plainly serving something. */
  listed: boolean;
}

/** Mirrors the `GET .../system/sites` response in
 *  `apps/website/src/server/inbound/admin-http/routes/system/sites.ts`. */
export interface AdminSitesSnapshot {
  /** The deployment capability flag (`TOVU_ENABLE_SITE_SWITCHER`) — Create/Activate 403 when off. */
  switchingEnabled: boolean;
  sites: AdminSiteListEntry[];
  currentSite: AdminSiteBinding;
  /** The site name a previous Activate persisted to `.env`, pending a restart — `null` when none. */
  persistedSiteName: string | null;
}

/** The `201` body of `POST .../system/sites`. */
export interface AdminCreatedSite {
  name: string;
  dir: string;
  siteId: string;
}

/** The `200` body of `POST .../system/sites/:name/activate`. Nothing was killed, signalled, or
 *  re-exec'd — `restartInstructions` is the server's own prose for what the human must now do, and
 *  the screen renders it verbatim rather than hardcoding a second copy. */
export interface AdminSiteActivation {
  ok: boolean;
  activeSiteName: string;
  restartRequired: boolean;
  restartInstructions: string;
}

/** Mirrors `DockerfileSourceSnapshot` in `src/server/routes/admin/system/dockerfile-source.ts`. */
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

/** Mirrors `ExportRunStatus` in `src/server/routes/admin/system/export-site.ts`. */
export type AdminExportRunStatus = "idle" | "running" | "completed" | "errored";

/** Mirrors `ExportRunSnapshot` in `src/server/routes/admin/system/export-site.ts` — see that
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

/**
 * Mirrors `StaticPublishTargetId` in `src/features/deployments/static-publish/types.ts` — which is
 * itself a type ALIAS of that feature's `PublishProviderId` (2026-08-15, widened from a github-pages
 * + vercel-only pass to all four Jini targets). Declared here as an alias of
 * {@link AdminPublishCredentialProviderId} for the identical reason the server aliases the two: "what
 * this admin can publish to" and "what provider a credential can be saved for" must never drift into
 * two different sets — see that type's own doc for why it is declared as the wider of the two names
 * even though the two id sets are now equal.
 */
export type AdminStaticPublishTargetId = AdminPublishCredentialProviderId;

/** Mirrors `GitHubPagesPublishConfig`/`VercelPublishConfig`/`NetlifyPublishConfig`/
 *  `CloudflarePagesPublishConfig` (same file). `basePath` is deliberately NOT a field on any variant
 *  — the server always derives it from `repo` (github-pages) or omits it entirely (every other
 *  target), never accepts one, so there is no field here a caller could even try to set it through.
 *  Netlify and Cloudflare Pages carry no target-specific field at all: Jini's `NetlifyDeployTarget`
 *  find-or-creates its site, and Cloudflare Pages' `accountId` lives on the CREDENTIAL, not this
 *  config — see `CloudflarePagesPublishConfig`'s own doc server-side for why. Both still find-or-
 *  create their project/site from the SAME `projectName` `triggerPublish` already sends alongside
 *  `config` — see `staticPublishProjectNameCopy` in `features/deployment/rules.ts` for why that one
 *  field means something different per target. */
export type AdminStaticPublishConfig =
  | { target: "github-pages"; owner: string; repo: string; branch?: string }
  | { target: "vercel"; teamId?: string }
  | { target: "netlify" }
  | { target: "cloudflare-pages" };

/** Mirrors `StaticPublishOutcome` (same file) — the terminal result of one publish attempt, present
 *  on an {@link AdminPublishRunSnapshot} once `status` is `"completed"` or `"errored"`. */
export type AdminStaticPublishOutcome =
  | { ok: true; targetId: AdminStaticPublishTargetId; url: string; status: string; deploymentId?: string; basePath?: string }
  | { ok: false; code: "INVALID_CONFIG" | "NO_CREDENTIALS_CONFIGURED" | "EXPORT_FAILED" | "PROVIDER_ERROR"; message: string };

/** Mirrors `PublishRunStatus` in `src/server/routes/admin/system/publish-site.ts`. */
export type AdminPublishRunStatus = "idle" | "running" | "completed" | "errored";

/** Mirrors `PublishRunSnapshot` (same file) — the trigger+poll run slot for a publish to GitHub
 *  Pages/Vercel, independent of {@link AdminExportRunSnapshot}'s own run slot (a plain export and a
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

/** Mirrors the JSON shape `GET .../system/publish/preview` returns — see that route's own doc
 *  comment in `publish-site.ts`. A pure read: never starts a run, never echoes a credential's value,
 *  only whether one is configured. */
export interface AdminStaticPublishPreview {
  target: AdminStaticPublishTargetId;
  valid: boolean;
  validationError: string | null;
  /** `/${repo}` for github-pages, `null` for vercel or an invalid config — always SERVER-derived,
   *  never something the caller supplied. */
  basePath: string | null;
  credentialsConfigured: boolean;
  credentialGuidance: string | null;
  willInjectNojekyll: boolean;
}

/**
 * A NAMED provider connection for publishing, stored server-side and never read back — see
 * {@link AdminPublishCredentialSummary}. The canonical four-provider union: {@link AdminStaticPublishTargetId}
 * is declared as an ALIAS of this type, not a separate literal list, so "what a credential can be
 * saved for" and "what `triggerPublish` can actually reach" can never drift apart again. They were
 * briefly two different sets (2026-08-15, credential save wired ahead of the publish-target UI for
 * Netlify/Cloudflare Pages — see `ADS-memory/reports/external-audit/runs/
 * 2026-08-15-terra-xhigh-publish-credentials-design.md`); the publish-target UI caught up the same
 * day, closing the gap.
 */
export type AdminPublishCredentialProviderId = "github-pages" | "vercel" | "netlify" | "cloudflare-pages";

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
  /** The verified account's public login/username (GitHub `login`, Vercel `username`), healed onto
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

/**
 * The body a create/update sends to configure ONE provider's connection — mirrors the server's
 * closed discriminated union verbatim. A credential holds the secret plus only the account scoping
 * that has nowhere else to live: GitHub Pages' `owner`/`repo`/`branch` and Vercel's `teamId` already
 * live on {@link AdminStaticPublishConfig} (the publish TARGET, chosen per run), so this type does
 * NOT duplicate them — a duplicate copy here would just be a second, driftable place either could be
 * set. Cloudflare Pages is the one provider with a second field: `accountId` is HARD required
 * (Cloudflare Pages has no account-scope-free API surface, and unlike `owner`/`repo` there is no
 * per-run publish target this could otherwise live on).
 */
export type AdminPublishConnectionInput =
  | { providerId: "github-pages"; token: string }
  | { providerId: "vercel"; token: string }
  | { providerId: "netlify"; token: string }
  | { providerId: "cloudflare-pages"; token: string; accountId: string };

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
 *  Site Token tab's own copy of "is this a production deployment" (the fact that decides whether
 *  the generate action can matter at all — see `AdminSiteTokenStatus`'s doc). */
export type AdminSiteTokenRuntimeMode = "production" | "local";

/** Mirrors `GET .../system/site-token`'s response shape (`inspectRootKeyMaterial`, server-side).
 *  NEVER carries the key value itself — only whether one is active, which of the two possible
 *  sources it came from, and a one-way `fingerprint` a human can use to recognize "same key as
 *  before" across a reload without revealing it. Call `api.revealSiteToken()` for the actual
 *  value, behind its own explicit action. */
export interface AdminSiteTokenStatus {
  active: boolean;
  source: "env" | "file" | "none";
  fingerprint?: string;
  /** `true` when a source was found but is not valid hex — `active` is `false` in this case too. */
  invalid?: boolean;
  /** Where a generated file lives (or would live) — not secret, a fixed filesystem convention.
   *  Always present, even when `source` isn't `"file"`, so a `"none"` status can still say where
   *  Generate would write. */
  keyFilePath: string;
  runtimeMode: AdminSiteTokenRuntimeMode;
}

/** Mirrors `POST .../system/site-token/generate`'s `201` response shape. Deliberately has NO
 *  `hex` field (sol finding 3-2, 2026-09-16 fix): `useSiteToken`'s `generate()` only ever reads
 *  `fingerprint`/`keyFilePath`/`runtimeMode` from this response, so the server stopped sending the
 *  raw key value here — it had no consumer and was pure exposure. `api.revealSiteToken()` (below)
 *  stays the one, explicit, on-purpose call that returns the value; `AdminSiteTokenStatus` (the
 *  plain `GET`) never carries it either. */
export interface AdminGeneratedSiteToken {
  fingerprint: string;
  keyFilePath: string;
  runtimeMode: AdminSiteTokenRuntimeMode;
}

/** Mirrors `POST .../system/site-token/reveal`'s response shape — {@link AdminSiteTokenStatus}
 *  plus the raw value when one is active. `hex` is absent when `active` is `false` (nothing to
 *  reveal). */
export interface AdminRevealedSiteToken extends AdminSiteTokenStatus {
  hex?: string;
}

/**
 * The three providers the Source Control page can save a connection for. Deliberately its own
 * union, NOT reusing {@link AdminPublishCredentialProviderId} — that type is a deploy-target id by
 * design (aliased to {@link AdminStaticPublishTargetId} so the two can never drift), and none of
 * GitLab, Bitbucket, or a *source* GitHub account is a static-publish target. See
 * `src/platform/db/schema.ts`'s `sourceControlCredentialSets` doc comment (server-side) for the full "why a
 * second table/type, not a wider union" reasoning this type mirrors on the client.
 */
export type AdminSourceControlProviderId = "github" | "gitlab" | "bitbucket";

/**
 * One saved connection's non-secret summary — never carries the token itself, and (like
 * {@link AdminPublishCredentialSummary}) deliberately carries no masked/last-4 hint either. A
 * stored token is never read back once saved; this is the fact a row's UI has to render its
 * connected/not-connected state from.
 */
export interface AdminSourceControlCredentialSummary {
  readonly id: string;
  readonly providerId: AdminSourceControlProviderId;
  readonly label: string;
  readonly configured: true;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * What a create/update call sends. A closed discriminated union on `providerId`, same shape
 * {@link AdminPublishConnectionInput} uses for the same reason: a provider that needs a field
 * beyond the universal `token` gets it here, typed, rather than every provider silently carrying
 * every other provider's optional fields. Bitbucket is the one provider here that needs a second
 * field — its API authenticates a token against the username it belongs to, not the token alone
 * (see `apps/admin/src/features/source-control/rules.ts`'s `SOURCE_CONTROL_PROVIDERS` for the
 * citation).
 */
export type AdminSourceControlConnectionInput =
  | { providerId: "github"; token: string }
  | { providerId: "gitlab"; token: string }
  | { providerId: "bitbucket"; token: string; username: string };

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
 * One saved custom-provider credential's non-secret summary (`src/server/routes/admin/system/
 * custom-credentials.ts`) — never carries the token or username. Unlike
 * {@link AdminSourceControlCredentialSummary}, `baseUrl`/`category` ARE part of this summary: both
 * are stored in the clear server-side specifically so the Access Tokens list can group/filter a
 * custom row without decrypting it (see `src/platform/db/schema.ts`'s `customCredentialSets` doc).
 */
export interface AdminCustomCredentialSummary {
  readonly id: string;
  readonly label: string;
  readonly category: AdminCustomCredentialCategoryId;
  readonly baseUrl: string;
  /** Extra allowed origins beyond `baseUrl` (e.g. fly.io needs both `api.fly.io` and
   *  `api.machines.dev`) — mirrors `src/features/custom-credentials/types.ts`'s server-side
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
}

/** Mirrors `features/deployments/types.ts`'s `EnvironmentRecord`. */
export interface AdminDeploymentEnvironment {
  workspaceId: string;
  id: string;
  name: string;
  slug: string;
  isProduction: boolean;
  createdAtIso: string;
  version: number;
}

/** Mirrors `features/deployments/types.ts`'s `DeploymentTargetRecord`. `config` is non-secret
 *  provider config only (repo owner/name, environment name) — credentials are not stored here and
 *  never will be reachable through this read-only route. */
export interface AdminDeploymentTarget {
  workspaceId: string;
  id: string;
  environmentId: string;
  providerId: string;
  label: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAtIso: string;
  version: number;
}

/** Mirrors `features/deployments/types.ts`'s `ReleaseRecord`/`ReleaseSource`. */
export interface AdminDeploymentRelease {
  workspaceId: string;
  id: string;
  label: string;
  source: { kind: "git-revision"; repoUrl: string; commitSha: string } | { kind: "external-artifact"; uri: string; checksum?: string };
  createdByPrincipalId: string;
  createdAtIso: string;
  version: number;
}

/** Mirrors `features/deployments/types.ts`'s `DeploymentRunRecord`. */
export interface AdminDeploymentRun {
  workspaceId: string;
  id: string;
  providerId: string;
  targetId: string | null;
  environmentId: string | null;
  releaseId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  providerRunRef: string | null;
  reconciliation: "poll" | "callback" | "manual";
  requestedByPrincipalId: string;
  requestedAtIso: string;
  startedAtIso: string | null;
  finishedAtIso: string | null;
  errorSummary: string | null;
  version: number;
}

/** Mirrors `AdminDeploymentsSnapshot` in `src/server/routes/admin/deployments/list.ts` — the Full
 *  Site tab's real-state read. */
export interface AdminDeploymentsSnapshot {
  environments: AdminDeploymentEnvironment[];
  targets: AdminDeploymentTarget[];
  releases: AdminDeploymentRelease[];
  runs: AdminDeploymentRun[];
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

/**
 * Whether this workspace has a Composio API key. Mirrors `src/platform/connectors/composio-config-store.ts`'s
 * `ComposioConfigView` and, structurally, `@jini-ai/integrations/composio`'s `PublicComposioConfig`.
 *
 * Markers only, in both directions of the two-kinds-of-present distinction: `configured` says a key
 * exists, `apiKeyTail` shows its last 4 characters. The key itself is send-only and never returned.
 */
export interface AdminComposioConfig {
  configured: boolean;
  apiKeyTail: string;
}

/**
 * One connector as the Connectors tab sees it.
 *
 * Structurally `@jini-ai/ui`'s `Connector`, restated here rather than imported so this file stays
 * the single description of Tovu's admin wire shapes (the same call
 * {@link AdminMediaProviderCredentials} makes). The server returns
 * `@jini-ai/integrations/composio`'s richer `ConnectorDetail`, which is a superset — the extra
 * fields are simply unread by the UI.
 */
export interface AdminConnector {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
  status: "available" | "connected" | "error" | "disabled";
  accountLabel?: string;
  lastError?: string;
  auth?: { provider: string };
  tools: { name: string; title?: string; description?: string; safety: { sideEffect: string; reason?: string } }[];
  toolCount?: number;
  toolsNextCursor?: string;
  toolsHasMore?: boolean;
  featuredToolNames?: string[];
  logoUrl?: string;
}

/** Mirrors `@jini-ai/ui`'s `ExecutionTab` `DetectedAgent` shape — see
 *  `src/server/routes/admin/assistant/detect-agents.ts`'s `toExecutionTabAgent`.
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
 * Mirrors `apps/website/src/features/seo/types.ts`'s `SeoExtFields` — the per-entry override
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
 * genuine override, and `getEntryMeta` (`features/seo/seo.ts`) resolves overrides with `??`, so an
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

export interface AdminPost {
  id: string;
  workspaceId: string;
  // Was missing from this client-side type even though `toHeadlessPost` (server/http/shared/post.ts)
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
   * (`headless/contracts.ts`, `server/http/shared/post.ts`), and REQ-3 wants this type to mirror it
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
  id: string;
  tier: ThemeTier;
  /** Manifest schema version (`2`, or `undefined` for v1) — mirrored client-side from
   *  `#src/contracts/headless`'s `HeadlessThemeSummary.apiVersion` (2026-08-19 architecture audit finding 1),
   *  same decoupling precedent as `ThemeTier`'s own doc comment. Feeds `PostTemplateModal`'s "View
   *  Template" fetch, which needs to know whether this theme's page templates live under `pages/`
   *  or `render/pages/`. */
  apiVersion?: 2;
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
}

// ---------------------------------------------------------------------------
// Widgets (SPEC-043, ADR-047) — mirrors AdminMenu's shape, the direct structural sibling
// ---------------------------------------------------------------------------

export type AdminWidgetType = "text" | "social-links" | "recent-entries" | "menu" | "contact-form";

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

/** SPEC-044 (Workspace Administration) — mirrors `server/http/admin/workspace.ts`'s DTO. */
export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/**
 * SPEC-010 Forms (Tier-1 sample plugin) — client-side types mirroring `server/http/admin/forms.ts`
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
}

export interface AdminFormSubmission {
  id: string;
  formDefinitionId: string;
  workspaceId: string;
  data: Record<string, string | boolean>;
  sourceIp: string;
  submittedAt: string;
}

/** Mirrors `src/server/http/admin/redirects.ts`'s `AdminRedirectDto` (SPEC-009). */
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

/** Mirrors `toAdminRedirectImportResponse`'s shape (`server/http/admin/redirects.ts`) — the route
 * always answers `207 Multi-Status`, so this is a plain success body, not an error path. */
export interface AdminRedirectImportResponse {
  created: AdminRedirect[];
  failed: Array<{ index: number; code: string; message: string }>;
}

/**
 * Collections (ADR-022/ADR-043) — mirrors `features/content-types/types.ts` +
 * `features/entries/types.ts`. The 18 routes these types back were wired in the
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
 * Categories & Tags (ADR-044) — mirrors `features/taxonomy/write-service.ts`'s `Taxonomy`/`Term`.
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

/** Recovery (ADR-045) — mirrors `features/recovery/disclosure.ts`'s `DisclosureResult`. */
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

/** Mirrors `src/server/http/admin/plugins.ts`'s `AdminPluginEnvelope` (SPEC-005 REQ-10, api.spec.md
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
  pluginId: string;
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

export class ApiError extends Error {
  readonly status: number;
  /** Canonical error `code` from the response body (`FORBIDDEN`, `GRANT_EXCEEDS_ISSUER`,
   * `VALIDATION_ERROR`, `RESOURCE_CONFLICT`, ...) when the server sent one — SPEC-006 errors.spec.md. */
  readonly code?: string;
  /** Raw parsed JSON error body, when present — lets a caller read route-specific fields beyond
   * `code`/`message` (e.g. the comments moderation routes' 409 `currentVersion`, SPEC-036 REQ-07)
   * without a bespoke `ApiError` subclass per route. */
  readonly body?: Record<string, unknown>;
  constructor(message: string, status: number, code?: string, body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * `ApiError.code` for "no Tovu API answered this request" — client-synthesized, not a server code
 * (the server never sent one, which is the whole point). Lets a screen branch on the condition
 * without string-matching the operator copy below.
 */
export const API_UNREACHABLE_CODE = "API_UNREACHABLE";

/**
 * `ApiError.code` for "no response arrived within {@link DEFAULT_REQUEST_TIMEOUT_MS}" —
 * client-synthesized, like {@link API_UNREACHABLE_CODE} above, for the sibling failure mode that
 * code cannot cover: `fetch` only rejects when the origin itself refuses the connection. It does
 * NOT reject when the origin is reachable but the browser has no free connection to send the
 * request on at all — every open admin tab keeps one `EventSource` connection to
 * `.../settings/events` open for its entire life (`lib/settings-events.ts`, "deliberately not
 * closed"), and this app is served over plain HTTP/1.1 in both dev and production, where Chrome caps
 * concurrent connections to one origin at 6. Enough long-lived tabs/streams against the same origin
 * exhausts that budget, and any OTHER request — reachable server, correct auth, nothing wrong with
 * either side — then queues in the browser forever with no error to catch (live-found 2026-08-17: the
 * Themes screen's `getPresentation()` call hung indefinitely with no server-side activity and no
 * client-side rejection). Bounding every request here converts that silent, permanent hang into a
 * visible, retriable one.
 */
export const REQUEST_TIMEOUT_CODE = "REQUEST_TIMEOUT";

/** How long a request may go unanswered before {@link fetchOrThrowUnreachable} gives up on it.
 *  Most real calls through `request()` are CRUD round trips measured in low tens of milliseconds
 *  locally, and the few genuinely long-running operations (static export/publish) are start/poll,
 *  never a single blocking call — EXCEPT `uploadMedia`, which sends a whole file as base64 JSON
 *  through this same seam and can legitimately run long: `server/app.ts` accepts request bodies up
 *  to 15mb (`express.json({ limit: "15mb" })`), which a slow/mobile upload could take the better
 *  part of a minute to send. 60s comfortably covers that worst real case while staying far short of
 *  "hangs forever" — the failure this timeout exists to convert into something visible. */
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function timeoutApiMessage(): string {
  return `the Tovu API did not respond within ${DEFAULT_REQUEST_TIMEOUT_MS / 1000}s — the browser may be out of free connections for this origin (try closing other admin tabs) or the server is unresponsive`;
}

/**
 * Operator copy for a request that never reached a Tovu API able to answer it.
 *
 * Replaces the old `request failed (500)`, which cost a real debugging hour on 2026-08-06: a bare
 * status *asserts a server exists and returned a server error*, so the operator reads it as "the
 * API crashed" and goes looking at application code, when in fact nothing was listening at all.
 * The status is kept in the message when we have one, because that is the only thing that
 * distinguishes the two routes described on {@link request} for a human reading the screen.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function unreachableApiMessage(status?: number): string {
  const detail = status === undefined ? "" : ` (HTTP ${status})`;
  return `cannot reach the Tovu API${detail} — is the server running?`;
}

/** Sentinel for "the response body was not parseable JSON", distinct from a body that legitimately
 * parsed to `null`/`{}` — those prove an application answered, and must keep the old behavior. */
const UNPARSEABLE_BODY = Symbol("unparseable-json-body");

/**
 * `fetch`, with the one failure mode it signals by REJECTING translated into an `ApiError` like
 * every other failure here.
 *
 * A rejected `fetch` (a `TypeError`: DNS failure, connection refused at the origin itself, offline,
 * TLS failure) is the case where nothing is listening where the admin app is served from — the
 * neighbouring route to {@link request}'s unparseable-5xx case, and the one that never reaches its
 * error handling at all. Unwrapped it surfaces as the browser's own "Failed to fetch"/"NetworkError
 * when attempting to fetch resource", which is both browser-specific and says nothing about Tovu.
 *
 * `AbortError` is deliberately re-thrown untouched: a caller-cancelled request is not a reachability
 * failure, and reporting it as one would be exactly the misleading-assertion bug this fixes. The
 * original failure text is preserved on `body.cause` rather than discarded.
 *
 * Only a `TypeError` gets wrapped — the type both the browser's `fetch` and Node's `undici` reject
 * with for DNS failure/connection refused/offline/TLS failure, per the paragraph above. Anything
 * else `fetch` rejects with (there is no other real case, but a caller could stub one, e.g. in a
 * test) is not a reachability failure this function has evidence for, and is re-thrown as-is rather
 * than relabeled — the same non-assertion discipline the unparseable-5xx case above already applies.
 *
 * @complexity O(1) plus the request itself.
 * @overallScore 100
 */
/** `cause.name` without assuming `cause instanceof Error` — a fired `AbortSignal.timeout()` rejects
 *  `fetch` with a `DOMException`, and DOMException's `instanceof Error` result is realm-dependent
 *  (true against Node's own global, observed false against a test environment's jsdom-provided
 *  global). Duck-typing `name` is the only check that holds in both. */
function errorName(value: unknown): string | undefined {
  return value && typeof value === "object" && "name" in value && typeof value.name === "string"
    ? value.name
    : undefined;
}

/**
 * Classifies a `fetch()` rejection cause and throws the appropriate translated error — the whole
 * catch-block body {@link fetchOrThrowUnreachable} used to carry inline. Pulled into its own
 * function (2026-09-04, complexity pass) purely to drop nesting: Cognitive Complexity charges extra
 * for a construct nested inside another (here, three `if`s and a ternary all nested inside the
 * `catch`), and that penalty is what pushed the caller to 10 against a 9 ceiling even though
 * cyclomatic complexity (which does not weight nesting) was already within bounds at 7. Moving the
 * SAME checks into a function of their own does not remove any branch — cyclomatic is unchanged —
 * it only resets the nesting depth they're scored at. Always throws; never returns normally, exactly
 * like the catch block it replaces.
 */
function throwTranslatedFetchFailure(cause: unknown): never {
  if (errorName(cause) === "AbortError") throw cause;
  if (errorName(cause) === "TimeoutError") {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(timeoutApiMessage(), 0, REQUEST_TIMEOUT_CODE, { cause: message });
  }
  if (!(cause instanceof TypeError)) throw cause;
  // A navigation cancels in-flight fetches with this SAME `TypeError`, after `pagehide` (see
  // `page-lifecycle.ts`). That is a cancellation, not evidence the server is down.
  if (isPageUnloading()) throw new DOMException("request cancelled: the page is unloading", "AbortError");
  throw new ApiError(unreachableApiMessage(), 0, API_UNREACHABLE_CODE, {
    cause: cause.message,
  });
}

async function fetchOrThrowUnreachable(url: string, init: RequestInit): Promise<Response> {
  // A caller-supplied signal (none exist today, but `AbortError` handling below already
  // anticipates one) is honored as-is; otherwise every request is bounded so a queued-forever
  // request (see `REQUEST_TIMEOUT_CODE`'s own doc) cannot hang a screen indefinitely.
  const signal = init.signal ?? AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal });
  } catch (cause) {
    return throwTranslatedFetchFailure(cause);
  }
}

type UnauthenticatedListener = () => void;
const unauthenticatedListeners = new Set<UnauthenticatedListener>();

/**
 * Subscribe to "the server just told us this tab's session is no longer valid" — a real 401 from
 * `request()` below, carrying `code: "UNAUTHENTICATED"`, not a client-side guess. Returns an
 * unsubscribe function.
 *
 * Exists because `App.hooks.tsx`'s `useAdminSession` only ever checked auth ONCE, at boot
 * (`api.me()` on mount) — a session that expires or is invalidated (server restart, admin revoke)
 * mid-tab left `user` stuck non-null forever, so `App.tsx`'s `if (!user) return <Login .../>` gate
 * never re-fired. Every OTHER screen's own `request()` call kept 401ing silently instead — the
 * live bug (2026-08-17): source control, deployments, assistant, and recovery all "loading forever"
 * with no indication of why, because none of those screens' own error handling was built to
 * recognize "you're logged out" as distinct from "the network/server is having a problem."
 * `useAdminSession` is the single subscriber (see that file) — it calls its own `setUser(null)` on
 * notification, which re-triggers the EXISTING `<Login>` gate rather than adding a second one.
 *
 * Gated on `code === "UNAUTHENTICATED"`, not bare `status === 401`, since found by adversarial
 * review the same day: 401 is not exclusively "this session is invalid" in this codebase — a bad
 * Composio API key relays as a verbatim 401 through `sendConnectorError`
 * (`src/server/routes/admin/connectors/errors.ts`, sourced from
 * `@jini-ai/integrations`'s `composio.ts`, which deliberately preserves Composio's own 401 rather
 * than folding it into its usual 502). That is a documented, pre-existing failure mode
 * (`put-config.ts`'s own comment: a bad key surfaces when "a detail drawer 401s") — before this
 * whole mechanism existed it broke one drawer; without this narrower gate it would silently log the
 * whole tab out instead. Every genuine session-invalidity 401 (`dev-auth.ts`) sets
 * `code: "UNAUTHENTICATED"`; Composio's relayed error does not.
 */
export function onUnauthenticated(listener: UnauthenticatedListener): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

/** Builds `fetch`'s own `init`, merging in `request`'s two fixed defaults (`credentials`,
 *  `Content-Type`) under whatever the caller passed. Pulled out of `request` (2026-09-04, complexity
 *  pass) purely to carry the `= {}` default itself: TypeScript still resolves `buildFetchInit(init)`
 *  correctly when `request`'s own `init` argument is omitted (`undefined` triggers this function's
 *  default exactly as it did `request`'s), so no call site — inside or outside this file — changes
 *  behavior; only which function's signature carries the default-parameter branch changes.
 *
 *  `headers` is spread and rebuilt LAST, after `...init`, so `init`'s other fields (`method`, `body`,
 *  `credentials`) can still override the fixed defaults above them, but `init.headers` itself always
 *  merges onto the `Content-Type` default rather than replacing the whole `headers` object outright —
 *  a caller passing one custom header (e.g. `If-Match`) must not silently lose `Content-Type` (see
 *  `setDockerfileSource`'s regression test in `api-endpoint-option-branches.unit.test.ts`). A caller
 *  that sets its own `Content-Type` still wins, since it's spread after the default.
 *
 *  Exported (browser-file-scope-only otherwise) purely so `api-build-fetch-init.unit.test.ts` can
 *  assert this merge order directly — no in-repo caller currently overrides `Content-Type` itself, so
 *  that branch would otherwise be unreachable through the public `api` surface. */
/**
 * The Fetch standard's ceiling on the combined body size of all in-flight `keepalive` requests
 * (64 KiB). A `fetch` whose keepalive body exceeds it rejects rather than being sent.
 */
export const KEEPALIVE_MAX_BODY_BYTES = 64 * 1024;

/**
 * Whether `body` is small enough to ride a `keepalive` fetch — measured in BYTES, not characters:
 * the ceiling is on the encoded payload, and a body of astral-plane characters is up to four bytes
 * each, so a `length` check would wave through a body four times over the limit.
 *
 * Conservative on purpose. The ceiling is shared across every in-flight keepalive request, so a
 * body at exactly the limit can still be refused when something else is in flight; being under it
 * is necessary, not sufficient. That is acceptable here because the fallback is an ordinary fetch,
 * which is what this path did before keepalive existed.
 *
 * @complexity Time O(n) in body length; space O(n) for the encoded copy.
 */
export function bodyFitsKeepalive(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BODY_BYTES;
}

export function buildFetchInit(init: RequestInit = {}): RequestInit {
  return {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  };
}

/** Parses `res`'s body as JSON, folding the "not valid JSON at all" case into the same
 *  `UNPARSEABLE_BODY` sentinel {@link request} always used, via `wasUnparseable`. `body` is `{}`
 *  when unparseable (unchanged from `request`'s own prior fallback) and the raw parsed value
 *  otherwise — including a legitimate JSON literal `null`, which is NOT the same thing as
 *  unparseable (see `UNPARSEABLE_BODY`'s own doc). Pulled out of `request` (2026-09-04, complexity
 *  pass) as its own step; the two callers below (`notifyIfUnauthenticated`,
 *  `buildRequestFailedError`) both need `wasUnparseable`, not just `body`. */
async function parseJsonBody(res: Response): Promise<{ body: Record<string, unknown>; wasUnparseable: boolean }> {
  const parsed = await res.json().catch(() => UNPARSEABLE_BODY);
  const wasUnparseable = parsed === UNPARSEABLE_BODY;
  return { body: wasUnparseable ? {} : parsed, wasUnparseable };
}

/** The one side effect on `request`'s error path: notifying every {@link onUnauthenticated}
 *  listener when, and only when, this non-2xx response is a genuine session invalidation. Gated on
 *  `status === 401 && code === "UNAUTHENTICATED"` specifically — not bare 401, and not 403. Bare 401
 *  is overloaded in this codebase: a relayed Composio failure (bad API key) is also a verbatim 401,
 *  see `onUnauthenticated`'s own doc comment for the concrete route that proved it. Only
 *  `dev-auth.ts`'s genuine session-invalidity 401s carry this code. 403 means an authenticated
 *  principal lacks a permission, a completely different, per-action condition that must not kick the
 *  operator back to the login screen. Pulled out of `request` (2026-09-04, complexity pass) as its
 *  own step, run before {@link buildRequestFailedError} builds the thrown error. */
function notifyIfUnauthenticated({ status, body }: { status: number; body: Record<string, unknown> }): void {
  if (status === 401 && body?.code === "UNAUTHENTICATED") {
    for (const listener of unauthenticatedListeners) listener();
  }
}

/** Builds the {@link ApiError} for `request`'s non-2xx branch. Three different failures can leave
 *  the operator staring at this error, and they need different actions:
 *
 *  1. **An application answered and reported a failure** — the body is JSON with an `error`/`code`
 *     envelope. Its own message wins, unchanged.
 *  2. **Nothing was listening upstream.** In dev, Vite's `/api` proxy answers an unreachable target
 *     with a bare `500`, `Content-Type: text/plain`, and a zero-length body (verified live against
 *     this repo's own proxy config, 2026-08-06); a production reverse proxy answers the same shape
 *     with 502/503/504. `fetch` resolves normally in this case — the proxy IS reachable — so this is
 *     the branch that must not report a plain "500".
 *  3. **The origin itself was unreachable**, so `fetch` rejected — handled one level down in
 *     {@link fetchOrThrowUnreachable}, and never reaches this function.
 *
 *  Cases 2 and 3 are the ones the old message got wrong. Note the limit of what case 2 can prove: an
 *  unparseable 5xx is *also* what a genuine server-side crash looks like when it escapes to
 *  Express's default (HTML) error handler rather than this codebase's JSON envelopes — the wire
 *  shape is the same, so this cannot distinguish them, and the message deliberately does not claim
 *  to. It names the likeliest cause, keeps the status for the other one, and points at the server
 *  either way, which is the correct first action for both. Parseable JSON (including a literal
 *  `null` body) is the discriminator that IS reliable: it proves an application, not a proxy,
 *  composed the response, so those keep `request failed (n)`.
 *
 *  Pulled out of `request` (2026-09-04, complexity pass) as its own pure step: a `{status, body,
 *  wasUnparseable}` triple in, an `ApiError` out, no `fetch`/parsing involved. */
function buildRequestFailedError({
  status,
  body,
  wasUnparseable,
}: {
  status: number;
  body: Record<string, unknown>;
  wasUnparseable: boolean;
}): ApiError {
  const noAppEnvelope = wasUnparseable && status >= 500;
  return new ApiError(
    String(body?.error ?? (noAppEnvelope ? unreachableApiMessage(status) : `request failed (${status})`)),
    status,
    noAppEnvelope ? API_UNREACHABLE_CODE : typeof body?.code === "string" ? body.code : undefined,
    body
  );
}

/**
 * The single fetch seam every `api.*` call goes through: sends JSON, parses JSON, and turns any
 * non-2xx into an {@link ApiError}.
 *
 * `onOk`, when passed, is called with the raw `Response` immediately before this function resolves
 * on a 2xx — the ONE hook a caller needing something off the wire that isn't in the JSON body (e.g.
 * `getDockerfileSource`/`setDockerfileSource` reading the `ETag` response header, 2026-08-15) can
 * use without reimplementing this function's own fetch/parse/error-shaping. Deliberately not called
 * on the error path: nothing today needs a response header out of a FAILED request, and every
 * caller that does can still read `ApiError.body` (already routed through non-2xx responses).
 *
 * See {@link buildFetchInit}, {@link parseJsonBody}, {@link notifyIfUnauthenticated}, and
 * {@link buildRequestFailedError} for the steps this orchestrates — each carries its own doc for why
 * its branch exists; this function's own job is only the sequencing.
 *
 * @complexity O(1) plus the request and body parse.
 * @overallScore 100
 */
async function request<T>(path: string, init?: RequestInit, onOk?: (res: Response) => void): Promise<T> {
  const res = await fetchOrThrowUnreachable(`${BASE}${path}`, buildFetchInit(init));
  const { body, wasUnparseable } = await parseJsonBody(res);
  if (!res.ok) {
    notifyIfUnauthenticated({ status: res.status, body });
    throw buildRequestFailedError({ status: res.status, body, wasUnparseable });
  }
  onOk?.(res);
  return body as T;
}

/**
 * Shared translation from a thrown request error to operator-facing copy — the "opt-out by
 * default" base every screen should build on, instead of each one copy-pasting this exact base
 * case under its own locally-defined `describeApiError` (audit cross-cutting finding #2,
 * `ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`: `request()` above throws
 * `body.error` verbatim with no shared translation layer, so operator-quality copy was opt-in per
 * screen — roughly two dozen screens had independently rebuilt this exact fallback chain, and any
 * screen whose author forgot would show the operator a raw server/developer string). An
 * `ApiError` already carries the server's own message; this only decides what to show when that
 * message is empty, or when `e` isn't an `ApiError` at all (a network failure, a thrown non-Error
 * value, …).
 *
 * A screen with real per-`code` handling should check its own codes first and fall through to
 * this for the rest, rather than reimplementing the base case:
 *
 * ```ts
 * import { describeApiError as describeApiErrorDefault } from "../lib/api";
 *
 * function describeApiError(e: unknown, fallback: string): string {
 *   if (e instanceof ApiError && e.code === "MY_SCREEN_SPECIFIC_CODE") return "...";
 *   return describeApiErrorDefault(e, fallback);
 * }
 * ```
 *
 * Deliberately NOT a single shared code→message table covering every screen's codes: the same
 * `code` means different things in different domains here (`RESOURCE_CONFLICT` is "still
 * referenced elsewhere" on `Roles.tsx`, "that slug is already taken" on `Workspace.tsx`, "that
 * username is already in use" on `Users.tsx` — three genuinely different operator-facing meanings
 * for one code, not a divergence a shared table could resolve without a screen-specific parameter
 * every caller would have to thread through anyway). Consolidating those into one wrong answer
 * would be a regression, not a fix — see the audit fix's own instruction to preserve each
 * screen's existing per-code copy rather than picking one.
 *
 * @complexity O(1) — two `instanceof` checks, no iteration.
 * @overallScore 100
 */
export function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

export const api = {
  login: ({ username, password }: { username: string; password: string }, _options: Record<string, never> = {}) =>
    request<{ user: AdminUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  me: () =>
    request<{ user: AdminUser; effectivePermissions?: string[] }>("/auth/me"),
  listPosts: () =>
    request<{ posts: Array<{ post: AdminPost }> }>(`/workspaces/${WORKSPACE_ID}/posts`),
  createPost: (title: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  getPost: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}`),
  // Template-preview fix (2026-08-11). Kind-blind like getPost/updatePost/deletePost above — one
  // route serves both editors' Preview tabs (`routes/admin/posts/template-preview.ts`'s own file
  // header explains why). NOT run through `request()`: the caller points an `<iframe src>` (or a
  // hidden form's `action`) directly at this URL rather than fetching+parsing JSON, so this only
  // builds the string.
  //
  // `templateChoice`'s tri-state (see `resolveTemplate`'s doc) is preserved through the query string:
  // `null` omits the param entirely ("never chosen"), `""` sends `?templateChoice=` (the explicit
  // "No template chosen" opt-out), anything else sends that filename.
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
  templatePreviewUrl: (id: string, templateChoice: string | null) =>
    siteUrl(
      `${BASE}/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/template-preview${
        templateChoice === null ? "" : `?templateChoice=${encodeURIComponent(templateChoice)}`
      }`
    ),
  // `expectedVersion` (2026-09-06) is the optimistic-concurrency basis, not a writable field —
  // the `AdminPost.version` the caller loaded, which the server compares and rejects with
  // `409 VERSION_CONFLICT` when a newer save has superseded it. Purely additive and optional: a
  // caller that omits it (every caller but `features/posts`' editor today, PageEditor included)
  // gets exactly the last-write-wins behavior this method has always had.
  updatePost: (
    { id }: { id: string },
    options: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> & {
      expectedVersion?: number;
    } = {}
  ) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  // Soft delete (server/routes/admin/posts/delete.ts): trashes the row rather than removing it,
  // revertible server-side via POST /change-sets/:id/revert. Kind-blind like getPost/updatePost —
  // deletes whatever row has this id regardless of whether it is a post or a page, which is why
  // PostEditor (shared between both) calls this rather than deletePage.
  deletePost: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
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
  putAutosave: (
    id: string,
    draft: { bodyFormat: "doc"; bodyJson: Record<string, unknown>; title: string; slug: string; baseVersion: number } | {
      bodyFormat: "html";
      bodyHtml: string;
      title: string;
      slug: string;
      baseVersion: number;
    },
    options: { keepalive?: boolean } = {}
  ) => {
    const body = JSON.stringify(draft);
    return request<{ applied: boolean }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave`, {
      method: "PUT",
      body,
      // Silently dropped rather than sent for an oversized body: `fetch` REJECTS outright when a
      // keepalive body exceeds the ceiling, which would turn a request that had at least a chance
      // of completing into one that provably never leaves. A plain fetch on the way out is the
      // pre-2026-09-07 behavior, i.e. no worse than before for the pages this cannot cover.
      ...(options.keepalive === true && bodyFitsKeepalive(body) ? { keepalive: true } : {}),
    });
  },
  // The recovery-banner check on editor mount — reads whatever standing draft is currently parked,
  // or `null` when there is nothing to offer.
  getAutosave: (id: string) =>
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
    }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave`),
  // Clears the standing draft — called after a real Save/Publish succeeds, and on an explicit
  // operator Discard. Unconditional: there is no stale basis to guard against when the intent is
  // simply "there is no longer a draft to offer".
  discardAutosave: (id: string) =>
    request<{ ok: boolean }>(`/workspaces/${WORKSPACE_ID}/posts/${encodeURIComponent(id)}/autosave`, {
      method: "DELETE",
    }),
  listPages: () =>
    request<{ posts: Array<{ post: AdminPost }> }>(`/workspaces/${WORKSPACE_ID}/pages`),
  createPage: (title: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  // Kind-guarded read: 404s if the id's row is not actually `kind: "page"`. `features/pages` uses
  // this rather than `getPost` so the Pages editor can never silently open a Post — Pages and Posts
  // are separate features with separate editors, and the id in the URL is the only thing standing
  // between them.
  getPage: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}`),
  // SPEC-047 — writes the bespoke-HTML body, and births the html row on first call. A DIFFERENT
  // endpoint from `updatePost` on purpose: the body and the title/slug/status go through two
  // separate server-side write paths.
  //
  // **This route takes no `expectedVersion`, and its server-side compare-and-set does NOT protect a
  // second editor** — corrected 2026-09-07; this comment used to claim the opposite ("only this one
  // offers compare-and-set, a 409 rather than a silent overwrite when someone else edited the page
  // since this editor loaded it"), and `routes/admin/pages/update-html.ts`'s own header still says
  // something similar. What the route actually does is `read()` then `write()` inside ONE request
  // (`PagesHtmlDocumentStore`, CIC-1), so the version it conditions on is one it captured
  // microseconds earlier — it serializes two writes racing inside the server, and can never see the
  // version the CLIENT loaded. It also BUMPS `version` on every successful write.
  //
  // `updatePost` above is the only one of the two that accepts a client-supplied `expectedVersion`,
  // which is why `usePageEditor.save` writes metadata FIRST and only reaches this route once that
  // guard has passed. Reordering those two calls, or adding a body-only save path, silently removes
  // the protection — see `writePage` in `use-page-editor.hooks.ts`.
  updatePageHtml: (id: string, html: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}/html`, {
      method: "PUT",
      body: JSON.stringify({ html }),
    }),
  // Soft delete (server/routes/admin/pages/delete.ts): same trash marker as deletePost, but
  // kind-guarded — 404s if the id's row is not actually kind:"page" (indistinguishable from
  // not-found, matching the rest of the pages/* routes' disclosed asymmetry).
  deletePage: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getPresentation: () =>
    request<{
      settings: PresentationSettings;
      availableThemeIds: string[];
      availableThemes: AdminThemeSummary[];
      /** Template-picker feature (2026-08-10, unified 2026-08-11) — ONE list shared by both the
       *  Post editor's and the Pages editor's pickers (was two separate fields,
       *  `activeThemePostTemplates`/`activeThemePageTemplates`, until the unified `content` marker
       *  removed the reason they needed to differ). */
      activeThemeTemplates: string[];
      activeThemeStaticPageIds: string[];
    }>(`/workspaces/${WORKSPACE_ID}/presentation`),
  /** What's installable from the marketplace. `idTaken` means a download will get a `-N` suffix. */
  listMarketplaceThemes: () =>
    request<{
      themes: Array<{ id: string; name: string; tier: string; description?: string; idTaken: boolean }>;
    }>(`/workspaces/${WORKSPACE_ID}/marketplace/themes`),
  /**
   * Download a marketplace theme: writes the pristine original into the catalog AND an editable
   * copy alongside it, then rescans so the new theme is usable without a server restart.
   *
   * `id` in the response is the id actually ASSIGNED, which is not necessarily the one requested —
   * a collision makes it `basic-1`. Callers must show what they got rather than what they asked for.
   */
  downloadMarketplaceTheme: (themeId: string) =>
    request<{
      id: string;
      suffixed: boolean;
      tier: string;
      rescan: { added: string[]; removed: string[]; total: number };
    }>(`/workspaces/${WORKSPACE_ID}/marketplace/themes/${encodeURIComponent(themeId)}/download`, {
      method: "POST",
    }),
  /**
   * One theme's editable surface: which pages it ships, which root partials, and where it was
   * copied from. Drives the Explore screen's file list and its "you are editing a copy" banner.
   */
  getThemeDetail: (themeId: string) =>
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
        group: "page" | "partial" | "style" | "script" | "config" | "asset" | "other";
        /** Whether the raw source can be fetched/displayed as text at all — false only for binary
         *  assets (images, fonts). Independent of `editable`: a script is readable but not editable. */
        readable: boolean;
        /** Whether the file can be saved (PUT/reset). False for binaries AND for read-only groups
         *  (`script`, `other`) even though those stay `readable`. */
        editable: boolean;
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
      lineage: { from?: string; tier?: string; version?: string; catalog?: string } | null;
      /** True when an untouched original of this theme exists in the catalog to reset back to. */
      hasOriginal: boolean;
    }>(`/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}`),
  /**
   * Restore one file to the pristine copy in the originals catalog, byte for byte. DESTRUCTIVE —
   * overwrites the working copy with no backup, so the caller must confirm with the operator first.
   * A file already identical to its original is not rewritten: `wasModified: false`, `bytes: 0`.
   * `content` is the restored file's text, or `null` past the server's 1 MB text-read limit.
   */
  resetThemeFile: (themeId: string, path: string) =>
    request<{ path: string; wasModified: boolean; bytes: number; content: string | null }>(
      `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/reset`,
      { method: "POST", body: JSON.stringify({ path }) }
    ),
  /** Raw source of one file inside a theme, relative to the theme root (`pages/about.html`). */
  getThemeFile: (themeId: string, path: string) =>
    request<{ path: string; content: string }>(
      `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file?path=${encodeURIComponent(path)}`
    ),
  /** Overwrite one file inside a theme. Refused for catalog originals — those are never editable —
   *  and for read-only groups (scripts, `other`); see `ApiError.code === "READ_ONLY_FILE"`. */
  putThemeFile: (themeId: string, path: string, content: string) =>
    request<{ path: string; bytes: number }>(
      `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file`,
      { method: "PUT", body: JSON.stringify({ path, content }) }
    ),
  /**
   * Duplicate one file inside a theme. The server computes the destination name (`about.html` ->
   * `about-1.html`, following collisions) — this call takes only the source path, nothing operator-
   * typed. Offered for every group, including read-only-to-edit ones: copying a script's bytes is
   * harmless even though editing one is refused.
   */
  copyThemeFile: (themeId: string, path: string) =>
    request<{
      path: string;
      group: "page" | "partial" | "style" | "script" | "config" | "asset" | "other";
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      copiedFrom: string;
    }>(`/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/copy`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  /**
   * Rename one file within its current folder. `name` is a bare filename (no `/`), so this can never
   * move a file between folders. Refused for `pages/index.html`/`theme.json`/`tokens.json`
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for a name already taken
   * (`code === "NAME_TAKEN"`).
   */
  renameThemeFile: (themeId: string, path: string, name: string) =>
    request<{
      path: string;
      group: "page" | "partial" | "style" | "script" | "config" | "asset" | "other";
      readable: boolean;
      editable: boolean;
      resettable: boolean;
      modified: boolean | null;
      renamedFrom: string;
    }>(`/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/rename`, {
      method: "POST",
      body: JSON.stringify({ path, name }),
    }),
  /**
   * Delete one file inside a theme, permanently — this repo keeps no theme-file revision history, so
   * there is no server-side undo. Refused for a theme's required files
   * (`ApiError.code === "REQUIRED_FILE_LOCKED"`) and for the same read-only-identity groups
   * (`script`, `other`) rename refuses (`code === "READ_ONLY_FILE"`) — see `explore.ts`'s
   * `validateFileIdentityChange` for the shared reasoning.
   */
  deleteThemeFile: (themeId: string, path: string) =>
    request<{ path: string; deleted: boolean }>(
      `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/delete`,
      { method: "POST", body: JSON.stringify({ path }) }
    ),
  /**
   * Publish or unpublish one of a static theme's own pages — the real replacement for the
   * `_unpublished/` folder convention an agent invented ad hoc because no such control existed at the
   * time. Refused for a non-`static`-tier theme (`ApiError.code === "NOT_STATIC_TIER"`) or a page id
   * that isn't one of this theme's own standalone pages — it does not exist, or is `index`/`404`/a
   * declared Post-or-Page template shell — with `code === "PAGE_NOT_PUBLISHABLE"`.
   */
  setThemePagePublished: (themeId: string, page: string, published: boolean) =>
    request<{ page: string; published: boolean; publishedPages: string[] }>(
      `/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/page/publish`,
      { method: "POST", body: JSON.stringify({ page, published }) }
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
    }>(`/workspaces/${WORKSPACE_ID}/themes/rescan`, { method: "POST" }),
  setActiveTheme: (activeThemeId: string) =>
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      `/workspaces/${WORKSPACE_ID}/presentation`,
      { method: "PATCH", body: JSON.stringify({ activeThemeId }) }
    ),
  listMembers: () =>
    request<{ members: AdminMember[] }>(`/workspaces/${WORKSPACE_ID}/members`),
  getMember: (id: string) =>
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}`),
  disableMember: (id: string) =>
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${encodeURIComponent(id)}/disable`, {
      method: "POST",
    }),
  requestMemberMagicLink: ({ email }: { email: string }, options: { redirectPath?: string } = {}) =>
    request<{ delivered: true }>(`/workspaces/${WORKSPACE_ID}/members/request-magic-link`, {
      method: "POST",
      body: JSON.stringify({ email, redirectPath: options.redirectPath }),
    }),
  listRecentAnalyticsHits: (options: { limit?: number } = {}) =>
    request<{ hits: AdminAnalyticsHit[] }>(
      `/workspaces/${WORKSPACE_ID}/analytics/recent-hits${options.limit ? `?limit=${options.limit}` : ""}`
    ),
  listMenus: () =>
    request<{ menus: AdminMenu[] }>(`/workspaces/${WORKSPACE_ID}/menus`),
  getMenu: (id: string) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}`),
  createMenu: (
    { title, slug }: { title: string; slug: string },
    options: { items?: AdminMenuItem[] } = {}
  ) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus`, {
      method: "POST",
      body: JSON.stringify({ title, slug, items: options.items }),
    }),
  updateMenuTree: (
    { id, expectedVersion, items }: { id: string; expectedVersion: number; items: AdminMenuItem[] },
    options: { title?: string; slug?: string } = {}
  ) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, items, title: options.title, slug: options.slug }),
    }),
  deleteMenu: ({ id }: { id: string }, options: { force?: boolean } = {}) =>
    request<{ menu: AdminMenu | null; purged: boolean }>(
      `/workspaces/${WORKSPACE_ID}/menus/${encodeURIComponent(id)}${options.force ? "?force=true" : ""}`,
      { method: "DELETE" }
    ),
  listIntegrationSubscriptions: () =>
    request<{ subscriptions: AdminWebhookSubscription[] }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions`
    ),
  createIntegrationSubscription: (input: { label: string; targetUrl: string; topics: string[] }) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  pauseIntegrationSubscription: (
    { id, paused }: { id: string; paused: boolean },
    _options: Record<string, never> = {}
  ) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(id)}/pause`,
      { method: "POST", body: JSON.stringify({ paused }) }
    ),
  deleteIntegrationSubscription: (id: string) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    ),
  listIntegrationDeliveries: (subscriptionId: string) =>
    request<{ deliveries: AdminWebhookDelivery[] }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${encodeURIComponent(subscriptionId)}/deliveries`
    ),
  listMedia: () => request<{ media: AdminMedia[] }>(`/workspaces/${WORKSPACE_ID}/media`),
  /** The workspace's media-generation vendor credentials, as markers only — never key material.
   *  Bare map, not a `{ data }` envelope, matching `MediaProvidersPort.fetchMediaProviders`. */
  getMediaProviders: () =>
    request<AdminMediaProviderMap>(`/workspaces/${WORKSPACE_ID}/media/providers`),
  /** Replaces the workspace's ENTIRE provider set — a provider absent from `providers` is deleted
   *  server-side, which is how the tab expresses Clear. Resolves the authoritative copy back. */
  saveMediaProviders: (providers: AdminMediaProviderMap) =>
    request<AdminMediaProviderMap>(`/workspaces/${WORKSPACE_ID}/media/providers`, {
      method: "PUT",
      body: JSON.stringify(providers),
    }),
  /** The workspace's configured external MCP servers. Carries env variable NAMES only — there is no
   *  route anywhere that returns a stored env VALUE, by design. */
  listExternalMcpServers: () =>
    request<{ servers: AdminExternalMcpServer[] }>(`/workspaces/${WORKSPACE_ID}/mcp-servers`),
  /** Creates or replaces one external MCP server. Omitting `env` PRESERVES the stored credentials
   *  (what an enable/disable toggle sends); passing `""` clears them. `restartRequired` is always
   *  true — federation freezes its tool set at connect, so a saved row lands at the next boot. */
  saveExternalMcpServer: (serverId: string, body: AdminExternalMcpServerInput) =>
    request<{ server: AdminExternalMcpServer; restartRequired: boolean }>(
      `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "PUT", body: JSON.stringify(body) }
    ),
  /** Removes one external MCP server. 404s on an id that was never configured rather than
   *  reporting success, so deleting a typo cannot read as deleting the real server. */
  deleteExternalMcpServer: (serverId: string) =>
    request<{ removed: boolean; restartRequired: boolean }>(
      `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE" }
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
  probeExternalMcpServer: (serverId: string) =>
    request<AdminExternalMcpProbeResult>(
      `/workspaces/${WORKSPACE_ID}/mcp-servers/${encodeURIComponent(serverId)}/probe`,
      { method: "POST" }
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
      `/workspaces/${WORKSPACE_ID}/mcp-servers/admissions`,
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
  /** Whether this workspace has a Composio API key, as markers only — drives `ConnectorsBrowser`'s
   *  `unlocked` prop. Never carries key material. */
  getComposioConfig: () =>
    request<AdminComposioConfig>(`/workspaces/${WORKSPACE_ID}/connectors/config`),
  /** Stores (`string`) or clears (`null`) the workspace's Composio API key. A missing `apiKey`
   *  property is a 400 server-side — "leave it alone" is not expressible against one field. */
  saveComposioConfig: (apiKey: string | null) =>
    request<AdminComposioConfig>(`/workspaces/${WORKSPACE_ID}/connectors/config`, {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),
  /** The Composio connector catalog. Without `refresh` this is the provider's in-process static
   *  catalog (no API key needed, no outbound request); with it, a live re-fetch that does need one. */
  listConnectors: (refresh?: boolean) =>
    request<{ connectors: AdminConnector[] }>(
      `/workspaces/${WORKSPACE_ID}/connectors${refresh ? "?refresh=1" : ""}`
    ),
  /** Every connector's connection status, as a bare map keyed by connector id. */
  getConnectorStatuses: () =>
    request<Record<string, { status: string; accountLabel?: string; lastError?: string }>>(
      `/workspaces/${WORKSPACE_ID}/connectors/statuses`
    ),
  /** Begins authorizing a connector. Resolves `{ connector, auth }`; `auth.kind` is
   *  `redirect_required` for the normal OAuth path, or `connected` when Composio already had a
   *  validated account. */
  connectConnector: (connectorId: string) =>
    request<{
      connector: AdminConnector;
      auth?: { kind: "redirect_required" | "pending" | "connected"; redirectUrl?: string; expiresAt?: string };
    }>(`/workspaces/${WORKSPACE_ID}/connectors/${encodeURIComponent(connectorId)}/connect`, {
      method: "POST",
    }),
  /** Revokes the account at Composio and deletes the sealed local credentials. */
  disconnectConnector: (connectorId: string) =>
    request<AdminConnector>(
      `/workspaces/${WORKSPACE_ID}/connectors/${encodeURIComponent(connectorId)}/disconnect`,
      { method: "POST" }
    ),
  /** Drops an in-flight authorization. Nothing was stored, so this only clears pending state. */
  cancelConnectorAuthorization: (connectorId: string) =>
    request<AdminConnector>(
      `/workspaces/${WORKSPACE_ID}/connectors/${encodeURIComponent(connectorId)}/cancel`,
      { method: "POST" }
    ),
  /** One connector, optionally with a page of its tools (the drawer's bounded preview read). */
  getConnector: (
    connectorId: string,
    options?: { hydrateTools?: boolean; toolsLimit?: number; toolsCursor?: string }
  ) => {
    const query = new URLSearchParams();
    if (options?.hydrateTools) query.set("hydrateTools", "1");
    if (options?.toolsLimit !== undefined) query.set("toolsLimit", String(options.toolsLimit));
    if (options?.toolsCursor !== undefined) query.set("toolsCursor", options.toolsCursor);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return request<AdminConnector>(
      `/workspaces/${WORKSPACE_ID}/connectors/${encodeURIComponent(connectorId)}${suffix}`
    );
  },
  /** Byte-serving URL for an asset's original file (MSG-05) — authenticated, same-origin, so a
   *  plain `<img src>`/`<video src>` sends the session cookie automatically with no `crossorigin`
   *  attribute needed. Not wrapped in `request()` like the rest of this file's methods: callers
   *  want the URL string itself to hand to a DOM element, not a parsed JSON response. `Content-Type`
   *  is sniffed server-side from magic bytes (falls back to `application/octet-stream`, and a
   *  sniffed HTML/SVG is deliberately served as a non-rendering attachment) — see `Media.tsx`'s
   *  `MediaPreview` for how the client discovers which element type an asset actually needs. */
  mediaOriginalUrl: (id: string) => `${BASE}/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}/original`,
  uploadMedia: (
    input: { filename: string; contentType: string; dataBase64: string },
    options: { alt?: string; caption?: string; credit?: string } = {}
  ) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
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
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  trashMedia: (id: string) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}/trash`, {
      method: "POST",
    }),
  deleteMedia: (id: string) =>
    request<{ purged: boolean }>(`/workspaces/${WORKSPACE_ID}/media/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listUsers: () => request<{ users: AdminIdentityUser[] }>(`/workspaces/${WORKSPACE_ID}/users`),
  createUser: (
    input: { username: string; password: string },
    options: { email?: string } = {}
  ) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
  // SPEC-006 0.6.0 (users/roles/policies CRUD-completion amendment).
  updateUser: ({ principalId }: { principalId: string }, options: { email?: string } = {}) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  disableUser: (principalId: string) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/disable`, {
      method: "POST",
    }),
  enableUser: (principalId: string) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/enable`, {
      method: "POST",
    }),
  resetUserPassword: (
    { principalId, password }: { principalId: string; password: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  assignRole: (
    { principalId, roleId }: { principalId: string; roleId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ assignment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleId }),
    }),
  attachPolicy: (
    { principalId, policyId }: { principalId: string; policyId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ attachment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/policies`, {
      method: "POST",
      body: JSON.stringify({ policyId }),
    }),
  listRoles: () => request<{ roles: AdminRole[] }>(`/workspaces/${WORKSPACE_ID}/roles`),
  createRole: (name: string) =>
    request<{ role: AdminRole }>(`/workspaces/${WORKSPACE_ID}/roles`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  // SPEC-006 0.6.0.
  updateRole: (
    { roleId, name }: { roleId: string; name: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ role: AdminRole }>(`/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteRole: (roleId: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }),
  listPolicies: () => request<{ policies: AdminPolicy[] }>(`/workspaces/${WORKSPACE_ID}/policies`),
  createPolicy: ({ name }: { name: string }, options: { description?: string } = {}) =>
    request<{ policy: AdminPolicy }>(`/workspaces/${WORKSPACE_ID}/policies`, {
      method: "POST",
      body: JSON.stringify({ name, description: options.description }),
    }),
  // SPEC-006 0.6.0.
  updatePolicy: (
    { policyId }: { policyId: string },
    options: { name?: string; description?: string } = {}
  ) =>
    request<{ policy: AdminPolicy }>(`/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  deletePolicy: (policyId: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}`, { method: "DELETE" }),
  writePolicyPermission: (
    { policyId, permission }: { policyId: string; permission: string },
    options: { resourceType?: string } = {}
  ) =>
    request<{ policyPermission: unknown }>(`/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions`, {
      method: "POST",
      body: JSON.stringify({ permission, resourceType: options.resourceType || undefined }),
    }),
  listPolicyPermissions: (policyId: string) =>
    request<{ policyPermissions: AdminPolicyPermission[] }>(
      `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions`
    ),
  removePolicyPermission: ({ policyId, policyPermissionId }: { policyId: string; policyPermissionId: string }) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions/${encodeURIComponent(policyPermissionId)}`, {
      method: "DELETE",
    }),

  // SPEC-044 (Workspace Administration). Note the path shape here differs from every call above:
  // `workspaces` IS the resource (no `/workspaces/${WORKSPACE_ID}/<sub-resource>` nesting) —
  // `/workspaces` (list/create) and `/workspaces/:id` (get/update/delete), matching api.spec.md.
  getWorkspace: () => request<{ workspace: AdminWorkspace }>(`/workspaces/${WORKSPACE_ID}`),
  updateWorkspace: (options: { name?: string; slug?: string } = {}) =>
    request<{ workspace: AdminWorkspace }>(`/workspaces/${WORKSPACE_ID}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  deleteWorkspace: () => request<void>(`/workspaces/${WORKSPACE_ID}`, { method: "DELETE" }),

  // SPEC-007 Settings (core-only layered ledger) — Phase 6 UI.
  getSettingsEffective: ({ namespace }: { namespace: string }, options: { principalId?: string } = {}) => {
    const params = new URLSearchParams({ namespace });
    if (options.principalId) params.set("principalId", options.principalId);
    return request<{ data: SettingResolvedValue[] }>(
      `/workspaces/${WORKSPACE_ID}/settings/effective?${params.toString()}`
    );
  },
  setSetting: (
    input: { namespace: string; key: string; scope: SettingScope; valueJson: unknown },
    options: { principalId?: string } = {}
  ) =>
    request<SettingValueResponse>(`/workspaces/${WORKSPACE_ID}/settings/value`, {
      method: "PUT",
      body: JSON.stringify({ ...input, ...options }),
    }),
  clearSetting: (
    input: { namespace: string; key: string; scope: SettingScope },
    options: { principalId?: string } = {}
  ) =>
    request<SettingValueResponse>(`/workspaces/${WORKSPACE_ID}/settings/value`, {
      method: "DELETE",
      body: JSON.stringify({ ...input, ...options }),
    }),
  resetSettingsNamespace: (input: { namespace: string; scope: SettingScope }) =>
    request<SettingResetResponse>(`/workspaces/${WORKSPACE_ID}/settings/reset`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // "Execution mode" tab (`@jini-ai/ui`'s `ExecutionTab`) — Local CLI detection + BYOK connection
  // test/model discovery. Deliberately separate from the settings.* methods above: these are
  // stateless egress probes (`src/server/modules/assistant-execution.ts`), not ledger CRUD, and the
  // `apiKey` field these two POST bodies carry is used for exactly one outbound request server-side
  // and never persisted (ADR-028 §6 — see `apps/admin/src/lib/execution-settings.ts`'s header).
  detectExecutionAgents: () =>
    request<{ data: AdminExecutionDetectedAgent[] }>(`/workspaces/${WORKSPACE_ID}/assistant/execution/detect-agents`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
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
    request<{ ok: boolean; message: string }>(`/workspaces/${WORKSPACE_ID}/assistant/execution/test-connection`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  testExecutionAgent: (input: { agentId: string; model?: string }) =>
    request<{ ok: boolean; message: string }>(`/workspaces/${WORKSPACE_ID}/assistant/execution/test-agent`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listExecutionModels: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
    useAdminStoredCredential?: boolean;
  }) =>
    request<{ ok: boolean; models: string[]; message?: string }>(`/workspaces/${WORKSPACE_ID}/assistant/execution/models`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // SPEC-010 Forms (Tier-1 sample plugin) — admin UI.
  listForms: () => request<{ data: AdminFormDefinition[] }>(`/workspaces/${WORKSPACE_ID}/forms`),
  getForm: (id: string) => request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${encodeURIComponent(id)}`),
  createForm: (
    input: { name: string; slug: string; fields: AdminFormField[] },
    options: { notify?: AdminFormNotify } = {}
  ) =>
    request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
  updateForm: (
    { id }: { id: string },
    options: { name?: string; fields?: AdminFormField[]; notify?: AdminFormNotify; status?: "active" | "disabled" } = {}
  ) =>
    request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  listFormSubmissions: ({ formId }: { formId: string }, options: { cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return request<{ data: AdminFormSubmission[]; nextCursor: string | null }>(
      `/workspaces/${WORKSPACE_ID}/forms/${encodeURIComponent(formId)}/submissions${qs ? `?${qs}` : ""}`
    );
  },
  getFormSubmission: (
    { formId, submissionId }: { formId: string; submissionId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ data: AdminFormSubmission }>(`/workspaces/${WORKSPACE_ID}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`),
  deleteFormSubmission: (
    { formId, submissionId }: { formId: string; submissionId: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`, {
      method: "DELETE",
    }),
  // AI Assistant — the visitor-facing assistant's master switch. Same `{ data }` envelope and same
  // partial-PUT shape as the SEO settings pair below, because the two routes are deliberately
  // identical in contract (see `server/routes/admin/assistant/put-settings.ts`).
  //
  // GET's response also carries a sibling `adminAssistantEnabled` — the UNRELATED admin assistant's
  // own `TOVU_ADMIN_ASSISTANT=off` switch, piggy-backed onto this response rather than a new
  // endpoint (`server/routes/admin/assistant/get-settings.ts`'s own doc explains why: this module is
  // one of exactly two admin-assistant server modules mounted unconditionally, so it is reachable
  // even with that flag off). `App.hooks.tsx`'s `useAdminAssistantAvailability` is the one reader.
  getAssistantSettings: () =>
    request<{ data: PublicAssistantSettings; adminAssistantEnabled: boolean }>(`/workspaces/${WORKSPACE_ID}/assistant/settings`),
  setAssistantSettings: (patch: Partial<PublicAssistantSettings>) =>
    request<{ data: PublicAssistantSettings }>(`/workspaces/${WORKSPACE_ID}/assistant/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  // The chat composer's folder control (`FsFolderIndicator.tsx`) — the operator-set `fs-files`
  // `custom` root the assistant's `fs_list_files`/`fs_read_file` tools may reach outside this
  // repo/site (`apps/website`'s `features/fs-files/custom-root-store.ts`). `path: null` means no
  // folder has been set yet. `setFsFilesCustomRoot` can 400 with a message meant to be shown
  // verbatim (not an absolute path, does not exist, or is a file rather than a directory) — callers
  // read `ApiError.body.error` for that case rather than treating every rejection as unexpected.
  getFsFilesCustomRoot: () => request<{ path: string | null }>(`/workspaces/${WORKSPACE_ID}/fs-files/custom-root`),
  setFsFilesCustomRoot: (path: string) =>
    request<{ path: string }>(`/workspaces/${WORKSPACE_ID}/fs-files/custom-root`, {
      method: "PUT",
      body: JSON.stringify({ path }),
    }),
  clearFsFilesCustomRoot: () =>
    request<{ path: null }>(`/workspaces/${WORKSPACE_ID}/fs-files/custom-root`, { method: "DELETE" }),
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
      return await request<{ ok: true }>(`/workspaces/${WORKSPACE_ID}/system/assistant-daemon/restart`, { method: "POST" });
    } catch (e) {
      if (e instanceof ApiError && typeof e.body?.reason === "string") return { ok: false, reason: e.body.reason };
      throw e;
    }
  },
  // `/readyz` (root-level, NOT under `/api/admin/v1` — see `server/routes/ops/health.ts`) is
  // deliberately unauthenticated and carries `assistantDaemonKnownFailed: true` only while a fresh
  // agent-daemon failure is latched (`readiness-state.ts`). Read directly rather than through
  // `request()`: both `200` (ready) and `503` (not ready) are ordinary, meaningful bodies here, not
  // error cases to throw on — the whole point of this call is telling the two apart after a restart.
  getAssistantDaemonReadyz: async (): Promise<{ ready: boolean; assistantDaemonKnownFailed?: true }> => {
    // Raw response, but through the same bounded fetch as `request()`: a bare `fetch` here queued
    // forever once long-lived SSE connections had used up the origin's connection budget.
    const res = await fetchOrThrowUnreachable("/readyz", { credentials: "same-origin" });
    // `/readyz` (`server/routes/ops/health.ts`'s `registerReadyzRoute`) always answers JSON, on both
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
  // when the server has no `TOVU_INTEGRATIONS_ROOT_KEY` — a fail-closed operator error, not a bug,
  // and one screens must translate rather than show raw (see `features/ai-assistant/AiAssistant.tsx`).
  getAssistantSiteCredential: () =>
    request<{ data: SiteAssistantCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/site-credential`),
  setAssistantSiteCredential: (patch: SiteAssistantCredentialPatch) =>
    request<{ data: SiteAssistantCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/site-credential`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteAssistantSiteCredential: () =>
    request<{ data: SiteAssistantCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/site-credential`, {
      method: "DELETE",
    }),
  // The ADMIN's own encrypted provider credential — a DIFFERENT key from the site one directly
  // above, scoped to this admin rather than the workspace. Same write-only `{ data }` envelope and
  // the same `503 SECRET_STORE_UNCONFIGURED` PUT failure mode. See `lib/execution-settings.ts` for
  // the caller-facing wrapper (explicit save only — never called from the debounced ledger-slice
  // auto-save path a typed key would otherwise ride along with).
  getAdminExecutionCredential: () =>
    request<{ data: AdminExecutionCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/execution-credential`),
  setAdminExecutionCredential: (patch: AdminExecutionCredentialPatch) =>
    request<{ data: AdminExecutionCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/execution-credential`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  deleteAdminExecutionCredential: () =>
    request<{ data: AdminExecutionCredential }>(`/workspaces/${WORKSPACE_ID}/assistant/execution-credential`, {
      method: "DELETE",
    }),
  getSeoSettings: () => request<{ data: SeoSettings }>(`/workspaces/${WORKSPACE_ID}/seo/settings`),
  setSeoSettings: (options: SeoSettingsPatch = {}) =>
    request<{ data: SeoSettings }>(`/workspaces/${WORKSPACE_ID}/seo/settings`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  regenerateSitemap: () =>
    request<{ data: { accepted: true } }>(`/workspaces/${WORKSPACE_ID}/seo/sitemap/regenerate`, {
      method: "POST",
    }),
  /** GET an entry's effective/resolved SEO meta (SPEC-037 REQ-06). */
  getSeoEntry: (entryId: string) =>
    request<{ data: SeoEntryMeta }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${encodeURIComponent(entryId)}`),
  /** PUT partial SEO overrides for an entry; a `409`-shaped body never occurs here (this route has
   * no optimistic-concurrency field) — failures are `400` field/canonical-URL validation errors,
   * surfaced via `ApiError.message` (SPEC-037 REQ-08). Returns the same resolved shape as
   * `getSeoEntry`, reflecting the merged overrides. */
  putSeoEntry: ({ entryId }: { entryId: string }, options: SeoEntryOverridesPatch = {}) =>
    request<{ data: SeoEntryMeta }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${encodeURIComponent(entryId)}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  /** GET an entry's SEO score + issues (SPEC-037 REQ-07, read-only). */
  getSeoEntryAnalyze: (entryId: string) =>
    request<{ data: SeoEntryAnalysis }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${encodeURIComponent(entryId)}/analyze`),
  listRedirects: () => request<{ data: AdminRedirect[] }>(`/workspaces/${WORKSPACE_ID}/redirects`),
  createRedirect: (
    input: { matchType: string; fromPattern: string; toTarget: string; statusCode: number },
    options: { override?: boolean; priority?: number } = {}
  ) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
  updateRedirect: (
    { id }: { id: string },
    options: Partial<{
      matchType: string;
      fromPattern: string;
      toTarget: string;
      statusCode: number;
      status: string;
      override: boolean;
      priority: number;
    }> = {}
  ) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  tombstoneRedirect: (id: string) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getRedirectHits: (id: string) =>
    request<{ data: AdminRedirectHitStats }>(`/workspaces/${WORKSPACE_ID}/redirects/${encodeURIComponent(id)}/hits`),
  /** POST a bulk-import batch (1-500 rules, `MAX_IMPORT_BATCH_SIZE`). Always answers `207` on the
   * wire; `fetch`/`request()` treat 2xx (incl. 207) as success, so the per-item `created`/`failed`
   * breakdown always comes back as the resolved value, never a thrown `ApiError`. */
  importRedirects: (rules: RedirectImportRule[]) =>
    request<AdminRedirectImportResponse>(`/workspaces/${WORKSPACE_ID}/redirects/import`, {
      method: "POST",
      body: JSON.stringify({ rules }),
    }),

  // Collections (ADR-022/ADR-043) — content-types registry + entries. `/api/admin/v1/*`, not the
  // `/workspaces/{id}/*` shape the rest of this file uses — these routes take workspace from the
  // authed principal's session server-side, matching `database`/`recovery` below.
  listContentTypes: () => request<{ items: AdminContentType[] }>("/content-types"),
  createContentType: (input: { key: string; label: string; fields: ContentTypeFieldDef[] }) =>
    request<{ contentType: AdminContentType }>("/content-types", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateContentTypeFields: (
    { key, fields, expectedVersion }: { key: string; fields: ContentTypeFieldDef[]; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ contentType: AdminContentType }>(`/content-types/${encodeURIComponent(key)}/fields`, {
      method: "PUT",
      body: JSON.stringify({ fields, expectedVersion }),
    }),
  contentTypeLifecycle: (
    {
      key,
      op,
      expectedVersion,
    }: { key: string; op: "deprecate" | "reactivate" | "tombstone"; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ contentType: AdminContentType }>(`/content-types/${encodeURIComponent(key)}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    }),
  listEntries: (options: { type?: string } = {}) =>
    request<{ items: AdminEntry[] }>(`/entries${options.type ? `?type=${encodeURIComponent(options.type)}` : ""}`),
  createEntry: (
    input: { type: string; slug: string; title: string },
    options: { fieldsJson?: unknown; bodyJson?: unknown } = {}
  ) =>
    request<{ entry: AdminEntry }>("/entries", { method: "POST", body: JSON.stringify({ ...input, ...options }) }),
  updateEntry: (
    { id, expectedVersion }: { id: string; expectedVersion: number },
    // `bodyJson` was missing here, which made the rich-text half of an entry
    // edit untypeable — see `CollectionEntryEditor`'s save. `createEntry` above
    // has always accepted it, and `updatePost` does too.
    options: { title?: string; fieldsJson?: unknown; bodyJson?: unknown } = {}
  ) =>
    request<{ entry: AdminEntry }>(`/entries/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, ...options }),
    }),
  entryLifecycle: (
    { id, op, expectedVersion }: { id: string; op: "publish" | "unpublish"; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: AdminEntry }>(`/entries/${encodeURIComponent(id)}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    }),

  // Categories & Tags (ADR-044) — taxonomies + terms.
  listTaxonomies: () => request<{ items: AdminTaxonomyWithTerms[] }>("/taxonomy"),
  createTaxonomy: (input: { name: string; hierarchical: boolean }) =>
    request<{ taxonomy: AdminTaxonomy }>("/taxonomy", { method: "POST", body: JSON.stringify(input) }),
  createTerm: (
    { taxonomyId, name }: { taxonomyId: string; name: string },
    options: { parentId?: string | null } = {}
  ) =>
    request<{ term: AdminTerm }>(`/taxonomy/${encodeURIComponent(taxonomyId)}/terms`, {
      method: "POST",
      body: JSON.stringify({ name, parentId: options.parentId }),
    }),
  renameTerm: (
    { termId, newName }: { termId: string; newName: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ term: AdminTerm }>(`/taxonomy/terms/${encodeURIComponent(termId)}`, {
      method: "PUT",
      body: JSON.stringify({ newName }),
    }),
  /** Additive: upserts one `entry_terms` row per `termIds` entry (never clears an existing,
   * unselected assignment — there is no remove-assignment route yet). */
  assignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>("/taxonomy/assign-terms", { method: "POST", body: JSON.stringify(input) }),
  // Guarded hard-delete (backend-gap closure, 2026-08-05) — refuses with a 409 rather than
  // cascading through live content: `TERM_HAS_ASSIGNMENTS`/`TAXONOMY_HAS_ASSIGNMENTS` when content
  // is still assigned, `TERM_HAS_CHILDREN` when a hierarchical term still has children. `rules.ts`'s
  // `describeDeleteBlocked` turns the `ApiError`'s `code`/`assignedCount`/`childCount` into operator
  // copy naming the remedy, not just a raw refusal. See `src/server/routes/admin/taxonomy/delete-
  // term.ts`/`delete-taxonomy.ts` for the route implementations this contract was taken from.
  deleteTerm: (termId: string) =>
    request<{ deletedTermId: string }>(`/taxonomy/terms/${encodeURIComponent(termId)}`, { method: "DELETE" }),
  /** `deletedTermIds` lists any (unassigned) member terms cascade-deleted along with the taxonomy —
   *  the taxonomy delete is refused (409 `TAXONOMY_HAS_ASSIGNMENTS`) before any of this happens if
   *  even one member term is still assigned, so this list is never a surprise loss of live content. */
  deleteTaxonomy: (taxonomyId: string) =>
    request<{ deletedTaxonomyId: string; deletedTermIds: string[] }>(`/taxonomy/${encodeURIComponent(taxonomyId)}`, {
      method: "DELETE",
    }),

  // Categories & Tags — merge-term ceremony (ADR-044, SPEC-018 C-207). 3-step plan/confirm/execute.
  planMergeTerm: (
    { fromTermId, intoTermId }: { fromTermId: string; intoTermId: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedPlanResult<MergeTermPlanDetails>>(`/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/plan`, {
      method: "POST",
      body: JSON.stringify({ intoTermId }),
    }),
  confirmMergeTerm: (
    { fromTermId, planId, planHash }: { fromTermId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>(`/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/confirm`, {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    }),
  executeMergeTerm: (
    {
      fromTermId,
      intoTermId,
      confirmationToken,
    }: { fromTermId: string; intoTermId: string; confirmationToken: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ mergedCount: number }>(`/taxonomy/terms/${encodeURIComponent(fromTermId)}/merge/execute`, {
      method: "POST",
      body: JSON.stringify({ intoTermId, confirmationToken }),
    }),

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
      `/database/timeline${qs ? `?${qs}` : ""}`
    );
  },
  /** ADR-041 §3 — this site's drift classification. Read-only: there is deliberately no matching
   *  write/repair call, and the server exposes none. */
  getDatabaseSchemaState: () => request<AdminSchemaState>("/database/schema-state"),
  listDatabaseRestorePoints: () => request<{ items: AdminRestorePoint[] }>("/database/restore-points"),
  createDatabaseRestorePoint: (options: { trigger?: string; costAck?: boolean } = {}) =>
    request<{ restorePoint: AdminRestorePointSummary }>("/database/restore-points", {
      method: "POST",
      body: JSON.stringify(options),
    }),

  // Database — migrate-forward ceremony (ADR-041 §3, SPEC-017 C-103/C-105). Plan takes no body —
  // the plan is computed entirely from the site's current migration/capability state server-side.
  planMigrateForward: () =>
    request<GatedPlanResult>("/database/migrate-forward/plan", { method: "POST" }),
  confirmMigrateForward: (
    { planId, planHash }: { planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>("/database/migrate-forward/confirm", {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    }),
  executeMigrateForward: (confirmationToken: string) =>
    request<MigrateForwardExecuteResult>("/database/migrate-forward/execute", {
      method: "POST",
      body: JSON.stringify({ confirmationToken }),
    }),

  // Recovery (ADR-045) — restore-points list (shared with Database), disclosure, deep-link, status,
  // and the restore ceremony itself (SPEC-019 C-301/C-302/C-303).
  listRecoveryRestorePoints: () => request<{ items: AdminRestorePoint[] }>("/recovery/restore-points"),
  /** Same underlying `/database/restore-points` write `createDatabaseRestorePoint` above uses — the
   *  `restore_points` table is genuinely shared (see `AdminRestorePoint`'s own doc comment) and
   *  there is no separate Recovery-owned write route. Recovery grew its own create action
   *  (2026-09-10, restore-point functionality consolidation) so this gets a Recovery-named entry
   *  point for that reason, not because the backend route differs. */
  createRecoveryRestorePoint: (options: { trigger?: string; costAck?: boolean } = {}) =>
    request<{ restorePoint: AdminRestorePointSummary }>("/database/restore-points", {
      method: "POST",
      body: JSON.stringify(options),
    }),
  computeRecoveryDisclosure: (restorePointId: string) =>
    request<AdminDisclosureResult>("/recovery/disclosure", {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    }),
  resolveRecoveryDeepLink: (envelope: DatabaseContextEnvelope) =>
    request<AdminRecoveryDeepLinkResult>("/recovery/deep-link", {
      method: "POST",
      body: JSON.stringify({ envelope }),
    }),
  getRecoveryStatus: () => request<AdminRecoveryStatus>("/recovery/status"),
  planRestore: (restorePointId: string) =>
    request<GatedPlanResult>("/recovery/restore/plan", {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    }),
  confirmRestore: (
    {
      planId,
      planHash,
      disclosureAcknowledged,
    }: { planId: string; planHash: string; disclosureAcknowledged: boolean },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>("/recovery/restore/confirm", {
      method: "POST",
      body: JSON.stringify({ planId, planHash, disclosureAcknowledged }),
    }),
  executeRestore: (
    { confirmationToken, restorePointId }: { confirmationToken: string; restorePointId: string },
    _options: Record<string, never> = {}
  ) =>
    request<RestoreExecuteResult>("/recovery/restore/execute", {
      method: "POST",
      body: JSON.stringify({ confirmationToken, restorePointId }),
    }),

  // Comments — moderation queue + settings (ADR-031, SPEC-033/035, SPEC-036 frontend). Mirrors
  // `getDatabaseTimeline`'s query-param-building shape for the paginated queue read, and
  // `getSeoSettings`/`setSeoSettings`'s `{data: ...}` shape for the settings GET/PUT.
  listCommentsQueue: (options: { status?: CommentStatus; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return request<AdminCommentsQueuePage>(`/workspaces/${WORKSPACE_ID}/comments/queue${qs ? `?${qs}` : ""}`);
  },
  moderateComment: (
    { commentId, action, expectedVersion }: { commentId: string; action: CommentModerationAction; expectedVersion: number },
    options: { note?: string } = {}
  ) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${encodeURIComponent(commentId)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion, note: options.note }),
    }),
  purgeComment: ({ commentId }: { commentId: string }, options: { note?: string } = {}) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${encodeURIComponent(commentId)}/purge`, {
      method: "POST",
      body: JSON.stringify({ note: options.note }),
    }),
  getCommentsSettings: () => request<{ data: CommentsSettings }>(`/workspaces/${WORKSPACE_ID}/comments/settings`),
  putCommentsSettings: (options: Partial<CommentsSettings> = {}) =>
    request<{ data: CommentsSettings }>(`/workspaces/${WORKSPACE_ID}/comments/settings`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),

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
    return request<AdminTrashPage>(`/workspaces/${WORKSPACE_ID}/trash${qs ? `?${qs}` : ""}`);
  },
  restoreTrashItems: ({ items }: { items: { entityType: string; entityId: string }[] }) =>
    request<AdminTrashRestoreReport>(`/workspaces/${WORKSPACE_ID}/trash/restore`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  purgeTrashItems: ({ ids }: { ids: string[] }) =>
    request<AdminTrashPurgeReport>(`/workspaces/${WORKSPACE_ID}/trash/purge`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  /** The generic single-item trash endpoint (`POST /trash/items`, `W/features/trash/`): the way
   *  every OTHER admin feature's delete button (forms, widgets, menus, terms, taxonomies) moves one
   *  row to the Trash, instead of each domain keeping its own bespoke delete call. */
  trash: ({ type, id }: { type: string; id: string }) =>
    request<{ ok: true; version: number | null }>(`/workspaces/${WORKSPACE_ID}/trash/items`, {
      method: "POST",
      body: JSON.stringify({ type, id }),
    }),

  // -------------------------------------------------------------------------
  // Widgets (SPEC-043, ADR-047) — mirrors the Menus client functions' exact shape
  // -------------------------------------------------------------------------
  listWidgets: (options: { widgetType?: string; includeInactive?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (options.widgetType) params.set("widgetType", options.widgetType);
    if (options.includeInactive) params.set("includeInactive", "true");
    const qs = params.toString();
    // `skippedCount` (dossier C5 follow-up, 2026-08-03) is additive and optional — present only
    // when the server silently dropped one or more malformed rows. Absent in the common case.
    return request<{ widgets: AdminWidget[]; skippedCount?: number }>(
      `/workspaces/${WORKSPACE_ID}/widgets${qs ? `?${qs}` : ""}`
    );
  },
  getWidget: (id: string) =>
    request<{ widget: AdminWidget; whereUsed: AdminWidgetWhereUsed }>(`/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}`),
  createWidget: (
    input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> },
    options: { slug?: string } = {}
  ) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
  updateWidget: (
    { id, baseVersion, config, title }: { id: string; baseVersion: number; config: Record<string, unknown>; title?: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ baseVersion, config, ...(title === undefined ? {} : { title }) }),
    }),
  trashWidget: (id: string) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}/trash`, { method: "POST" }),
  purgeWidget: ({ id }: { id: string }, options: { force?: boolean } = {}) =>
    request<{ purged: true }>(`/workspaces/${WORKSPACE_ID}/widgets/${encodeURIComponent(id)}/purge${options.force ? "?force=true" : ""}`, { method: "POST" }),

  listWidgetRegions: () => request<{ regions: AdminWidgetRegionBinding[] }>(`/workspaces/${WORKSPACE_ID}/widgets/regions`),
  bindWidgetRegion: (regionKey: string) =>
    request<{ area: AdminWidgetArea }>(`/workspaces/${WORKSPACE_ID}/widgets/regions`, {
      method: "POST",
      body: JSON.stringify({ regionKey }),
    }),
  getWidgetRegion: (regionKey: string) =>
    request<{ area: AdminWidgetArea; placements: AdminWidgetPlacement[] }>(`/workspaces/${WORKSPACE_ID}/widgets/regions/${encodeURIComponent(regionKey)}`),
  mutateWidgetRegionPlacements: (
    {
      regionKey,
      baseVersion,
      placements,
    }: {
      regionKey: string;
      baseVersion: number;
      placements: Array<{ placementId: string; widgetEntryId: string; enabled: boolean }>;
    },
    _options: Record<string, never> = {}
  ) =>
    request<{ area: AdminWidgetArea }>(`/workspaces/${WORKSPACE_ID}/widgets/regions/${encodeURIComponent(regionKey)}`, {
      method: "PUT",
      body: JSON.stringify({ baseVersion, placements }),
    }),

  insertWidgetEmbed: (
    { hostEntryId, baseVersion, widgetEntryId }: { hostEntryId: string; baseVersion: number; widgetEntryId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: { id: string; version: number; bodyJson: unknown }; placementId: string }>(
      `/workspaces/${WORKSPACE_ID}/entries/${encodeURIComponent(hostEntryId)}/widget-embeds`,
      { method: "POST", body: JSON.stringify({ baseVersion, widgetEntryId }) }
    ),
  removeWidgetEmbed: (
    { hostEntryId, placementId, baseVersion }: { hostEntryId: string; placementId: string; baseVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: { id: string; version: number; bodyJson: unknown } }>(
      `/workspaces/${WORKSPACE_ID}/entries/${encodeURIComponent(hostEntryId)}/widget-embeds/${encodeURIComponent(placementId)}`,
      { method: "DELETE", body: JSON.stringify({ baseVersion }) }
    ),

  widgetsToolPlace: (input: { widgetInstanceId: string; target: Record<string, unknown> }) =>
    request<{ tool: "widgets.place"; result: unknown }>(`/workspaces/${WORKSPACE_ID}/widgets/tools/place`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  widgetsToolCreate: (input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown>; target: Record<string, unknown> }) =>
    request<{ tool: "widgets.create"; widget: AdminWidget; result: unknown }>(`/workspaces/${WORKSPACE_ID}/widgets/tools/create`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // SPEC-005 REQ-12..17 (1.1.0 UI amendment) — consumes REQ-10's PLUGINS_LIST/PLUGIN_SET_ENABLED
  // HTTP contract as a black box (ui.spec.md §3.1/§4.2).
  listPlugins: () => request<{ plugins: AdminPlugin[] }>(`/workspaces/${WORKSPACE_ID}/plugins`),
  setPluginEnabled: (pluginId: string, { enabled }: { enabled: boolean }) =>
    request<{ plugin: { id: string; version: string; enabled: boolean; updatedAt: string }; changeSetId: string }>(
      `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}`,
      { method: "PATCH", body: JSON.stringify({ enabled }) }
    ),
  /**
   * PLUGIN_UNINSTALL (Milestone 2, 2026-08-20) — `DELETE /workspaces/:id/plugins/:pluginId`.
   * Deletes a `"site"` plugin's on-disk artifact and every workspace's activation row for it; no
   * `PLUGINS_LIST`/`PLUGIN_SET_ENABLED`-style spec package covers this route at all (see
   * `server/inbound/admin-http/routes/plugins/uninstall.ts`'s own header — new surface, not an
   * implementation of an existing contract). Deliberately NOT `executeCommand`-wrapped server-side
   * (a filesystem delete has no meaningful inverse), so unlike `setPluginEnabled` above there is no
   * `changeSetId` in the response — just the id and which workspaces' activation rows were cleared.
   *
   * Refuses with `PLUGIN_NOT_FOUND` (404, id unknown), `PLUGIN_NOT_UNINSTALLABLE` (422, the
   * discovered record is `"built-in"`), `PLUGIN_ENABLED` (409, still enabled in some workspace), or
   * `PLUGIN_ID_INVALID` (400, path-traversal-shaped id) — see `rules.ts`'s `describeApiError` for
   * the operator-facing text each maps to.
   */
  uninstallPlugin: (pluginId: string) =>
    request<{ pluginId: string; clearedWorkspaceIds: string[] }>(
      `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}`,
      { method: "DELETE" }
    ),
  /** PLUGIN_FILES (2026-09-13) — `GET /workspaces/:id/plugins/:pluginId/files`: the read-only,
   *  server-capped listing of one plugin's own files behind the Plugins screen's package-files
   *  viewer. Refuses `PLUGIN_NOT_FOUND` (404) and `PLUGIN_ID_INVALID` (400). */
  getPluginFiles: (pluginId: string) =>
    request<AdminPluginFiles>(`/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/files`),

  // 2026-09-09 — AGENT_PLUGINS_LIST: the `agent-plugins` screen's read of real installed Agent
  // Plugins (a separate family from listPlugins/setPluginEnabled above — see AdminAgentPlugin's doc).
  listAgentPlugins: () => request<{ agentPlugins: AdminAgentPlugin[] }>(`/workspaces/${WORKSPACE_ID}/agent-plugins`),
  /** AGENT_PLUGIN_FILES (2026-09-13) — `GET /workspaces/:id/agent-plugins/:pluginId/files`: one
   *  installed Agent Plugin's files, switched on or off, behind the Agent Plugins eye button.
   *  Refuses `AGENT_PLUGIN_NOT_FOUND` (404). */
  getAgentPluginFiles: (pluginId: string) =>
    request<AdminAgentPluginFiles>(`/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}/files`),
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
  setAgentPluginEnabled: (pluginId: string, { enabled }: { enabled: boolean }) =>
    request<{ agentPlugin: AdminAgentPlugin }>(`/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),

  // Deployment panel (`src/server/routes/admin/system/deployment-overview.ts` /
  // `dockerfile-source.ts`) — `system.read`-gated, same shape as `getModuleStatus` just above.
  /** Runtime mode, boot-gate/default-password status, agent-daemon known-failure state, db/uploads
   *  paths, and required-env-var presence (never values) — the Deployment panel's Overview tab. */
  getDeploymentOverview: () =>
    request<AdminDeploymentOverview>(`/workspaces/${WORKSPACE_ID}/system/deployment-overview`),

  // Observability panel, Overview tab (`apps/website/src/server/inbound/admin-http/routes/system/
  // observability-status.ts`) — `system.read`-gated, same shape as `getDeploymentOverview` above.
  /** Whether `platform/observability`'s real OTel adapter is on right now, and under what service
   *  name — never the OTLP endpoint value itself. See {@link AdminObservabilityStatus}. */
  getObservabilityStatus: () =>
    request<AdminObservabilityStatus>(`/workspaces/${WORKSPACE_ID}/system/observability-status`),

  // Sites panel (`apps/website/src/server/inbound/admin-http/routes/system/sites.ts`) — list is
  // `system.read`, create/activate are `system.write` AND additionally refused with
  // `SITE_SWITCHING_DISABLED` when the deployment capability flag is off. Same `system.*` split as
  // `getDockerfileSource`/`setDockerfileSource` immediately above.
  /** Every site under `sites/`, plus what this server process is ACTUALLY bound to right now and
   *  any pending activate choice — see {@link AdminSitesSnapshot}. */
  listSites: () => request<AdminSitesSnapshot>(`/workspaces/${WORKSPACE_ID}/system/sites`),
  /** Create `sites/<name>/` through the same `initSite` path `tovu init` uses. `409`
   *  `SITE_ALREADY_EXISTS` when the directory is occupied, `400` `VALIDATION_ERROR` for a name
   *  outside `[a-z0-9-]{1,100}`. */
  createSite: (input: { name: string }) =>
    request<{ site: AdminCreatedSite }>(`/workspaces/${WORKSPACE_ID}/system/sites`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Persist `name` as the site the NEXT boot serves. Writes `TOVU_SITE=<name>` to the repo-root
   *  `.env` and returns restart instructions — it does not kill, signal, or re-exec anything, and
   *  this process keeps serving whatever it booted with. See {@link AdminSiteActivation}. */
  activateSite: (name: string) =>
    request<AdminSiteActivation>(
      `/workspaces/${WORKSPACE_ID}/system/sites/${encodeURIComponent(name)}/activate`,
      { method: "POST" }
    ),
  /** The repo-root `Dockerfile`'s current contents, or `{ exists: false }` when none has been
   *  generated yet, plus its `etag` merged in from the response's own `ETag` header (never the JSON
   *  body — see {@link AdminDockerfileSource.etag}'s own doc). */
  getDockerfileSource: (): Promise<AdminDockerfileSource> => {
    let etag = "";
    return request<{ exists: boolean; contents: string | null }>(
      `/workspaces/${WORKSPACE_ID}/system/dockerfile`,
      {},
      (res) => {
        etag = res.headers.get("ETag") ?? "";
      }
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
  setDockerfileSource: (contents: string, ifMatch: string): Promise<AdminDockerfileSource> => {
    let etag = "";
    return request<{ exists: boolean; contents: string | null }>(
      `/workspaces/${WORKSPACE_ID}/system/dockerfile`,
      {
        method: "PUT",
        headers: { "If-Match": ifMatch },
        body: JSON.stringify({ contents }),
      },
      (res) => {
        etag = res.headers.get("ETag") ?? "";
      }
    ).then((body) => ({ ...body, etag }));
  },

  // Static Site tab (`src/server/routes/admin/system/export-site.ts`) — trigger + poll, not a
  // single synchronous call: a real export can take seconds to minutes, so `triggerSiteExport`
  // returns the moment the run STARTS (202) and a caller polls `getSiteExportStatus` for the
  // outcome. `system.export`-gated on trigger (writes to disk), `system.read` on the poll.
  /** Starts a new static-site export. `409` (surfaced as a thrown error by `request`, same as any
   *  non-2xx) if one is already running — this instance runs at most one export at a time. */
  triggerSiteExport: (options?: { clean?: boolean; basePath?: string }) =>
    request<AdminExportRunSnapshot>(`/workspaces/${WORKSPACE_ID}/system/export`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),
  /** The current/most recent export run's status — poll this after `triggerSiteExport` until
   *  `status` is no longer `"running"`. */
  getSiteExportStatus: () => request<AdminExportRunSnapshot>(`/workspaces/${WORKSPACE_ID}/system/export`),

  // Static Site tab "Getting it online" card (`src/server/routes/admin/system/publish-site.ts`) —
  // publishing the current export straight to GitHub Pages, Vercel, Netlify, or Cloudflare Pages.
  // Same trigger+poll shape as
  // the export pair just above, plus a third pure-read preview route with no run of its own.
  /** Read-only: validates `config`, reports the base path a real publish would use (always
   *  SERVER-derived — see {@link AdminStaticPublishConfig}'s own doc), and whether a credential is
   *  configured for the target (a boolean only, never the credential itself). Never starts a run. */
  getPublishPreview: (config: AdminStaticPublishConfig) => {
    const query = new URLSearchParams({ target: config.target });
    // One branch per target, not an else-fallback — a target with no query params of its own
    // (netlify, cloudflare-pages) gets its own empty branch rather than silently falling through
    // whatever the last `else` happened to check, so a fifth target can never inherit github-pages'
    // or vercel's params by accident.
    switch (config.target) {
      case "github-pages":
        query.set("owner", config.owner);
        query.set("repo", config.repo);
        if (config.branch !== undefined) query.set("branch", config.branch);
        break;
      case "vercel":
        if (config.teamId !== undefined) query.set("teamId", config.teamId);
        break;
      case "netlify":
      case "cloudflare-pages":
        break;
    }
    return request<AdminStaticPublishPreview>(`/workspaces/${WORKSPACE_ID}/system/publish/preview?${query.toString()}`);
  },
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
    request<AdminPublishRunSnapshot>(`/workspaces/${WORKSPACE_ID}/system/publish`, {
      method: "POST",
      body: JSON.stringify({
        ...input.config,
        projectName: input.projectName,
        ...(input.credentialId !== undefined ? { credentialId: input.credentialId } : {}),
      }),
    }),
  /** The current/most recent publish run's status — poll this after `triggerPublish` until `status`
   *  is no longer `"running"`. */
  getPublishStatus: () => request<AdminPublishRunSnapshot>(`/workspaces/${WORKSPACE_ID}/system/publish`),

  // Static Site tab "Getting it online" card → credential management (`src/server/routes/admin/
  // system/publish-credentials.ts`) — named provider connections for `triggerPublish`, stored
  // encrypted server-side and never read back. See `AdminPublishCredentialSummary`'s own doc for
  // exactly what a saved row can and cannot reveal.
  /** Every configured credential for this workspace, plus the server's own `executionMode` — the
   *  ONLY source of truth for whether this instance can drive a CLI locally or needs a stored
   *  credential to publish at all. Never sniffed client-side; see `AdminPublishExecutionMode`'s doc. */
  listPublishCredentials: () =>
    request<AdminPublishCredentialsSnapshot>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials`),
  /** Creates one named connection. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError` with that
   *  `code`) if this workspace already has a credential with the same label — labels are the only
   *  human-facing identifier a reader has for telling two connections apart, so silently allowing a
   *  second row with the same one would make the list ambiguous. `isDefault` is optional — omitted
   *  entirely (not `false`) lets the server apply its own default-assignment rule (e.g. a provider's
   *  first-ever saved connection), rather than this admin guessing at it. */
  createPublishCredential: (input: { label: string; connection: AdminPublishConnectionInput; isDefault?: boolean }) =>
    request<{ credential: AdminPublishCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Updates a credential's label, connection, and/or default status. Omitting `connection` entirely
   *  — never sending it as an empty object or blank fields — is what keeps the stored secret
   *  untouched; see `use-publish-credentials.hooks.ts`'s header for why the form can never send a
   *  half-blank one. `isDefault: true` makes this the default connection for its provider (the server
   *  owns clearing any previous default for that same provider); omitted leaves default status
   *  unchanged. */
  updatePublishCredential: (id: string, input: { label?: string; connection?: AdminPublishConnectionInput; isDefault?: boolean }) =>
    request<{ credential: AdminPublishCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `204`, idempotent — deleting an id that is already gone (a stale list, a double click) still
   *  resolves rather than throwing. */
  deletePublishCredential: (id: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** Re-checks one already-saved credential against its real provider right now — the human-facing
   *  counterpart to the best-effort verify a create/update already runs automatically, for when that
   *  cached result has gone stale (a rotated token) or was lost (a server restart clears the
   *  in-memory verification cache; see `AdminPublishCredentialSummary.accountLabel`'s doc for why the
   *  DB-persisted half of this survives that even though this specific response does not). Never
   *  4xxs for an unreachable or rejected provider — a failed verification is still a `200` carrying
   *  `status: "invalid" | "unreachable"`, only a genuinely missing credential id 404s. */
  verifyPublishCredential: (id: string) =>
    request<{ verification: AdminPublishCredentialVerification }>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials/${encodeURIComponent(id)}/verify`, {
      method: "POST",
    }),

  // Secrets panel → Site Token tab (`src/server/inbound/admin-http/routes/system/site-token.ts`)
  // — status of the TOVU_INTEGRATIONS_ROOT_KEY root key's generated-file fallback, an explicit
  // reveal action, and a create-only generate action. `admin.security.tokens.manage`-gated
  // server-side on every one of the three calls below. See that route file's own header for the
  // 2026-09-09 durability fix (a generated key file now genuinely protects every stored credential
  // in production too, with one disclosed gap: webhook signing/newsletter tokens still need the
  // env var there) and for the accepted security tradeoff of a key file living beside the
  // database it protects.
  /** Never throws for "no key active" — that is `{active: false, source: "none"}`, a normal 200,
   *  not an error. Never carries the key value — see `revealSiteToken` for that. */
  getSiteTokenStatus: () => request<AdminSiteTokenStatus>(`/workspaces/${WORKSPACE_ID}/system/site-token`),
  /** Returns the raw key value (whichever source is active) when one is set — a deliberate,
   *  explicit, separately-clickable action, never fired on page load. Superseded an earlier
   *  fingerprint-only brief (owner: "i want that token to be visible to admins or else when it
   *  breaks they have no idea whats going on"). No audit trail — this codebase has no
   *  general-purpose sensitive-read audit mechanism to hook into (checked; not built here). */
  revealSiteToken: () =>
    request<AdminRevealedSiteToken>(`/workspaces/${WORKSPACE_ID}/system/site-token/reveal`, { method: "POST" }),
  /** `409 ENV_VAR_ACTIVE` if the env var is already set (it always wins over a file, so writing
   *  one would be silently inert), `409 ALREADY_EXISTS` if a key file is already present — both
   *  surfaced as a thrown `ApiError` with that marker on `.code` (or, absent a `code`, on
   *  `.message` — see `rules.ts`'s `classifyAccessTokenSubmitError` for the precedent this
   *  mirrors). Only ever CREATES; there is no rotate/replace call in this file. Works in
   *  production now too (2026-09-09 durability fix) — this is no longer local-only. */
  generateSiteToken: () =>
    request<AdminGeneratedSiteToken>(`/workspaces/${WORKSPACE_ID}/system/site-token/generate`, { method: "POST" }),

  // Source Control page → credential management (`src/server/routes/admin/system/
  // source-control-credentials.ts`) — one saved GitHub/GitLab/Bitbucket identity connection per
  // provider, stored encrypted server-side and never read back. Structurally mirrors the
  // publish-credentials block above; see `AdminSourceControlCredentialSummary`'s own doc for
  // exactly what a saved row can and cannot reveal. `source-control.credentials.write`-gated on
  // every verb server-side — NOT the same permission as the publish-credentials calls above (see
  // that route's own header for why connecting a source-control identity is not a publish
  // trigger).
  /** Every configured source-control credential for this workspace. */
  listSourceControlCredentials: () =>
    request<AdminSourceControlCredentialsSnapshot>(`/workspaces/${WORKSPACE_ID}/system/source-control/credentials`),
  /** Creates one named connection. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError` with that
   *  `code`) if this workspace already has a credential with the same `(providerId, label)`.
   *  `isDefault` is optional — omitted entirely (not `false`) lets the server apply its own
   *  default-assignment rule (a provider's first-ever saved connection), rather than this admin
   *  guessing at it. */
  createSourceControlCredential: (input: { label: string; connection: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    request<{ credential: AdminSourceControlCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/source-control/credentials`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Updates a credential's label, connection, and/or default status. Omitting `connection`
   *  entirely — never sending it as an empty object or blank fields — is what keeps the stored
   *  secret untouched; see `use-source-control-credentials.hooks.ts`'s header for why the form can
   *  never send a half-blank one. */
  updateSourceControlCredential: (id: string, input: { label?: string; connection?: AdminSourceControlConnectionInput; isDefault?: boolean }) =>
    request<{ credential: AdminSourceControlCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/source-control/credentials/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `204`, idempotent — deleting an id that is already gone (a stale list, a double click) still
   *  resolves rather than throwing. Not called anywhere on this page today (there is no delete
   *  affordance in the UI — replacing a token PUTs over the existing row), kept for parity with
   *  the publish-credentials block above. */
  deleteSourceControlCredential: (id: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/system/source-control/credentials/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Access Tokens page → "Add custom provider" (`src/server/routes/admin/system/
  // custom-credentials.ts`) — a user-defined provider (name, base URL, token, optional username,
  // category), stored encrypted server-side and never read back. Structurally mirrors the
  // source-control-credentials block above. `custom-credentials.write`-gated on every verb
  // server-side.
  /** Every configured custom-provider credential for this workspace. */
  listCustomCredentials: () => request<AdminCustomCredentialsSnapshot>(`/workspaces/${WORKSPACE_ID}/system/custom/credentials`),
  /** Creates one custom-provider credential. `409 DUPLICATE_LABEL` (surfaced as a thrown `ApiError`
   *  with that `code`) if this workspace already has one with the same `label`. */
  createCustomCredential: (input: {
    label: string;
    category: AdminCustomCredentialCategoryId;
    baseUrl: string;
    /** Omitted = no extra hosts beyond `baseUrl` (server-side default — see
     *  `validateAdditionalHosts`'s own doc). */
    additionalHosts?: readonly string[];
    connection: AdminCustomConnectionInput;
  }) =>
    request<{ credential: AdminCustomCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/custom/credentials`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Updates a credential's label, category, base URL, additional hosts, username, and/or
   *  connection. Omitting `connection` entirely — never sending it as an empty object or blank
   *  fields — is what keeps the stored secret untouched, same contract every sibling credential
   *  update call documents. Omitting `additionalHosts` leaves it unchanged; supplying it REPLACES
   *  the whole list (never merges), matching `updateCustomCredential`'s own server-side contract.
   *  `username` is independent of `connection` (2026-09-01, `store.ts`'s own precedence doc): omit
   *  it to leave the saved username exactly as `connection` (if sent) would otherwise set it, send
   *  `null` to clear it, or a non-empty string to set it — with NO token retype required either
   *  way. When both `username` and `connection` are sent in the same call, `username` wins for what
   *  gets stored in the plaintext column (server-side precedence, not a client-side rule). */
  updateCustomCredential: (
    id: string,
    input: {
      label?: string;
      category?: AdminCustomCredentialCategoryId;
      baseUrl?: string;
      additionalHosts?: readonly string[];
      username?: string | null;
      connection?: AdminCustomConnectionInput;
    }
  ) =>
    request<{ credential: AdminCustomCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/custom/credentials/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `204`, idempotent. */
  deleteCustomCredential: (id: string) => request<void>(`/workspaces/${WORKSPACE_ID}/system/custom/credentials/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** Full Site tab (`src/server/routes/admin/deployments/list.ts`) — read-only snapshot of the
   *  `deployments` domain's environments/targets/releases/runs. `deployments.read`-gated. */
  getDeployments: () => request<AdminDeploymentsSnapshot>(`/workspaces/${WORKSPACE_ID}/deployments`),

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
    request<{ peers: PublishContentPeerSummary[] }>(`/workspaces/${WORKSPACE_ID}/publish-content/peers`),
  /** Zero-setup connect — reads whether this install already publishes somewhere, and if not, the
   *  candidate pre-filled from the repo's own deploy config
   *  (`routes/publish-content/destination.ts`). Nothing credential-shaped is ever in this response:
   *  see that route's own header for why. */
  getPublishDestination: () => request<AdminPublishDestinationView>(publishContentDestinationPath()),
  /** The one action that turns a fresh install into a connected one — no key is minted, displayed
   *  or copied. `siteUrl` is optional; omitted, the server falls back to its own candidate, which is
   *  the only path the Dashboard's empty-state offer uses. */
  connectPublishDestination: (input: { siteUrl?: string } = {}) =>
    request<AdminPublishDestinationView>(`${publishContentDestinationPath()}/connect`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** `selectedEntityKeys` (the report rows' own `entityType:entityId` keys) narrows the bundle this
   *  push stages on the peer BEFORE it plans — omitted means "everything", which is what an
   *  untouched dialog sends. See `features/publish-content/export-bundle.ts`'s `selectBundleEntities`
   *  for why a selection is applied at stage time rather than carried into execute. */
  planPublishContent: ({ peerId, selectedEntityKeys }: { peerId: string; selectedEntityKeys?: readonly string[] }) =>
    request<PublishContentPlanResult>(`${publishContentPeerPath(peerId)}/push/plan`, {
      method: "POST",
      ...(selectedEntityKeys === undefined ? {} : { body: JSON.stringify({ selectedEntityKeys }) }),
    }),
  confirmPublishContent: (
    { peerId, planId, planHash }: { peerId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentConfirmResult>(`${publishContentPeerPath(peerId)}/push/confirm`, {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    }),
  /** `bundleId` comes from `planPublishContent`'s own response and is required: the peer's
   *  `/import/execute` refuses a confirmation token against any bundle but the one it planned. */
  executePublishContent: (
    { peerId, bundleId, confirmationToken }: { peerId: string; bundleId: string; confirmationToken: string },
    _options: Record<string, never> = {}
  ) =>
    request<PublishContentExecuteResult>(`${publishContentPeerPath(peerId)}/push/execute`, {
      method: "POST",
      body: JSON.stringify({ bundleId, confirmationToken }),
    }),
};
