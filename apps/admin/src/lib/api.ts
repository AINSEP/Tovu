import { siteUrl } from "./site-url";

export const WORKSPACE_ID = "workspace-local";

const BASE = "/api/admin/v1";

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
export interface AdminExternalMcpServer {
  serverId: string;
  label: string;
  transport: string;
  enabled: boolean;
  command: string;
  args: string[];
  allowedToolNames: string[];
  envNames: string[];
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
  args: string;
  allowedToolNames: string;
  /** Omit to keep stored credentials; `""` to clear them. The distinction is load-bearing. */
  env?: string;
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

/** Mirrors `DockerfileSourceSnapshot` in `src/server/routes/admin/system/dockerfile-source.ts`. */
export interface AdminDockerfileSource {
  exists: boolean;
  contents: string | null;
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

/**
 * Whether this workspace has a Composio API key. Mirrors `src/connectors/composio-config-store.ts`'s
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
 *  `src/server/routes/admin/assistant/detect-agents.ts`'s `toExecutionTabAgent`. */
export interface AdminExecutionDetectedAgent {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  path?: string;
  models?: Array<{ id: string; label: string }>;
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

/** Mirrors `src/seo/types.ts`'s `SeoExtFields` — the partial override bag `putSeoEntry` accepts. */
export interface SeoEntryOverridesPatch {
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
 * ADR-020 capability tier, mirrored client-side from `#src/headless`'s `HeadlessThemeTier` —
 * same decoupling precedent as every other client-side type in this file that mirrors a wire
 * contract rather than importing server internals.
 */
export type ThemeTier = "declarative" | "templated" | "handlebars" | "static" | "code";

/** Themes admin screen (2026-08-10) — one available theme's id plus its capability tier. */
export interface AdminThemeSummary {
  id: string;
  tier: ThemeTier;
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

export interface AdminMenuItem {
  id: string;
  label?: string;
  target: AdminMenuTarget;
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
export const CONTENT_TYPE_FIELD_KINDS = ["text", "integer", "real", "boolean", "datetime"] as const;
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
async function fetchOrThrowUnreachable(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    if (!(cause instanceof TypeError)) throw cause;
    throw new ApiError(unreachableApiMessage(), 0, API_UNREACHABLE_CODE, {
      cause: cause.message,
    });
  }
}

/**
 * The single fetch seam every `api.*` call goes through: sends JSON, parses JSON, and turns any
 * non-2xx into an {@link ApiError}.
 *
 * ## Why the error message is not just the status
 *
 * Three different failures can leave the operator staring at this function's error, and they need
 * different actions:
 *
 * 1. **An application answered and reported a failure** — the body is JSON with an `error`/`code`
 *    envelope. Its own message wins, unchanged.
 * 2. **Nothing was listening upstream.** In dev, Vite's `/api` proxy answers an unreachable target
 *    with a bare `500`, `Content-Type: text/plain`, and a zero-length body (verified live against
 *    this repo's own proxy config, 2026-08-06); a production reverse proxy answers the same shape
 *    with 502/503/504. `fetch` resolves normally in this case — the proxy IS reachable — so this is
 *    the branch that must not report a plain "500".
 * 3. **The origin itself was unreachable**, so `fetch` rejected — handled one level down in
 *    {@link fetchOrThrowUnreachable}, and never reaches the code below.
 *
 * Cases 2 and 3 are the ones the old message got wrong. Note the limit of what case 2 can prove: an
 * unparseable 5xx is *also* what a genuine server-side crash looks like when it escapes to Express's
 * default (HTML) error handler rather than this codebase's JSON envelopes — the wire shape is the
 * same, so this cannot distinguish them, and the message deliberately does not claim to. It names
 * the likeliest cause, keeps the status for the other one, and points at the server either way,
 * which is the correct first action for both. Parseable JSON is the discriminator that IS reliable:
 * it proves an application, not a proxy, composed the response, so those keep `request failed (n)`.
 *
 * @complexity O(1) plus the request and body parse.
 * @overallScore 100
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchOrThrowUnreachable(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const parsed = await res.json().catch(() => UNPARSEABLE_BODY);
  const body = parsed === UNPARSEABLE_BODY ? {} : parsed;
  if (!res.ok) {
    const noAppEnvelope = parsed === UNPARSEABLE_BODY && res.status >= 500;
    throw new ApiError(
      String(body?.error ?? (noAppEnvelope ? unreachableApiMessage(res.status) : `request failed (${res.status})`)),
      res.status,
      noAppEnvelope ? API_UNREACHABLE_CODE : typeof body?.code === "string" ? body.code : undefined,
      body
    );
  }
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
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`),
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
  updatePost: (
    { id }: { id: string },
    options: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status" | "templateChoice" | "overridesThemePage">> = {}
  ) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  // Soft delete (server/routes/admin/posts/delete.ts): trashes the row rather than removing it,
  // revertible server-side via POST /change-sets/:id/revert. Kind-blind like getPost/updatePost —
  // deletes whatever row has this id regardless of whether it is a post or a page, which is why
  // PostEditor (shared between both) calls this rather than deletePage.
  deletePost: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`, {
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
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${id}`),
  // SPEC-047 — writes the bespoke-HTML body, and births the html row on first call. A DIFFERENT
  // endpoint from `updatePost` on purpose: the body and the title/slug/status go through two
  // separate server-side write paths, and only this one offers compare-and-set (a 409 rather than a
  // silent overwrite when someone else edited the page since this editor loaded it).
  updatePageHtml: (id: string, html: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${id}/html`, {
      method: "PUT",
      body: JSON.stringify({ html }),
    }),
  // Soft delete (server/routes/admin/pages/delete.ts): same trash marker as deletePost, but
  // kind-guarded — 404s if the id's row is not actually kind:"page" (indistinguishable from
  // not-found, matching the rest of the pages/* routes' disclosed asymmetry).
  deletePage: (id: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages/${id}`, {
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
      }>;
      lineage: { from?: string; tier?: string; version?: string; catalog?: string } | null;
      /** True when an untouched original of this theme exists in the catalog to reset back to. */
      hasOriginal: boolean;
    }>(`/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}`),
  /**
   * Restore one file to the pristine copy in the originals catalog. DESTRUCTIVE — overwrites the
   * working copy with no backup, so the caller must confirm with the operator first.
   */
  resetThemeFile: (themeId: string, path: string) =>
    request<{ path: string; bytes: number; content: string }>(
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
      renamedFrom: string;
    }>(`/workspaces/${WORKSPACE_ID}/themes/${encodeURIComponent(themeId)}/file/rename`, {
      method: "POST",
      body: JSON.stringify({ path, name }),
    }),
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
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${id}`),
  disableMember: (id: string) =>
    request<{ member: AdminMember }>(`/workspaces/${WORKSPACE_ID}/members/${id}/disable`, {
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
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`),
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
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`, {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, items, title: options.title, slug: options.slug }),
    }),
  deleteMenu: ({ id }: { id: string }, options: { force?: boolean } = {}) =>
    request<{ menu: AdminMenu | null; purged: boolean }>(
      `/workspaces/${WORKSPACE_ID}/menus/${id}${options.force ? "?force=true" : ""}`,
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
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${id}/pause`,
      { method: "POST", body: JSON.stringify({ paused }) }
    ),
  deleteIntegrationSubscription: (id: string) =>
    request<{ subscription: AdminWebhookSubscription }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${id}`,
      { method: "DELETE" }
    ),
  listIntegrationDeliveries: (subscriptionId: string) =>
    request<{ deliveries: AdminWebhookDelivery[] }>(
      `/workspaces/${WORKSPACE_ID}/integrations/subscriptions/${subscriptionId}/deliveries`
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
  mediaOriginalUrl: (id: string) => `${BASE}/workspaces/${WORKSPACE_ID}/media/${id}/original`,
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
      alt?: string;
      caption?: string;
      credit?: string;
      width?: number | null;
      height?: number | null;
      cssClass?: string | null;
    } = {}
  ) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${id}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  trashMedia: (id: string) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${id}/trash`, {
      method: "POST",
    }),
  deleteMedia: (id: string) =>
    request<{ purged: boolean }>(`/workspaces/${WORKSPACE_ID}/media/${id}`, {
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
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  disableUser: (principalId: string) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/disable`, {
      method: "POST",
    }),
  enableUser: (principalId: string) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/enable`, {
      method: "POST",
    }),
  resetUserPassword: (
    { principalId, password }: { principalId: string; password: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  assignRole: (
    { principalId, roleId }: { principalId: string; roleId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ assignment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleId }),
    }),
  attachPolicy: (
    { principalId, policyId }: { principalId: string; policyId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ attachment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/policies`, {
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
    request<{ role: AdminRole }>(`/workspaces/${WORKSPACE_ID}/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteRole: (roleId: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/roles/${roleId}`, { method: "DELETE" }),
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
    request<{ policy: AdminPolicy }>(`/workspaces/${WORKSPACE_ID}/policies/${policyId}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  deletePolicy: (policyId: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/policies/${policyId}`, { method: "DELETE" }),
  writePolicyPermission: (
    { policyId, permission }: { policyId: string; permission: string },
    options: { resourceType?: string } = {}
  ) =>
    request<{ policyPermission: unknown }>(`/workspaces/${WORKSPACE_ID}/policies/${policyId}/permissions`, {
      method: "POST",
      body: JSON.stringify({ permission, resourceType: options.resourceType || undefined }),
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
  // `useStoredCredential` opts a probe into the workspace's encrypted server-side site credential
  // when `apiKey` is empty — for the AI Assistant tab, whose key is write-only and so genuinely
  // absent from the browser. Opt-in per request, never implicit: Settings → Execution mode sends a
  // DIFFERENT (browser-local) key and must never fall through to the site's.
  testExecutionConnection: (input: {
    protocol: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    apiVersion?: string;
    useStoredCredential?: boolean;
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
  }) =>
    request<{ ok: boolean; models: string[]; message?: string }>(`/workspaces/${WORKSPACE_ID}/assistant/execution/models`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // SPEC-010 Forms (Tier-1 sample plugin) — admin UI.
  listForms: () => request<{ data: AdminFormDefinition[] }>(`/workspaces/${WORKSPACE_ID}/forms`),
  getForm: (id: string) => request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${id}`),
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
    request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${id}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  listFormSubmissions: ({ formId }: { formId: string }, options: { cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return request<{ data: AdminFormSubmission[]; nextCursor: string | null }>(
      `/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions${qs ? `?${qs}` : ""}`
    );
  },
  getFormSubmission: (
    { formId, submissionId }: { formId: string; submissionId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ data: AdminFormSubmission }>(`/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions/${submissionId}`),
  deleteFormSubmission: (
    { formId, submissionId }: { formId: string; submissionId: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions/${submissionId}`, {
      method: "DELETE",
    }),
  // AI Assistant — the visitor-facing assistant's master switch. Same `{ data }` envelope and same
  // partial-PUT shape as the SEO settings pair below, because the two routes are deliberately
  // identical in contract (see `server/routes/admin/assistant/put-settings.ts`).
  getAssistantSettings: () => request<{ data: PublicAssistantSettings }>(`/workspaces/${WORKSPACE_ID}/assistant/settings`),
  setAssistantSettings: (patch: Partial<PublicAssistantSettings>) =>
    request<{ data: PublicAssistantSettings }>(`/workspaces/${WORKSPACE_ID}/assistant/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
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
  setSeoSettings: (options: Partial<SeoSettings> = {}) =>
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
    request<{ data: SeoEntryMeta }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${entryId}`),
  /** PUT partial SEO overrides for an entry; a `409`-shaped body never occurs here (this route has
   * no optimistic-concurrency field) — failures are `400` field/canonical-URL validation errors,
   * surfaced via `ApiError.message` (SPEC-037 REQ-08). Returns the same resolved shape as
   * `getSeoEntry`, reflecting the merged overrides. */
  putSeoEntry: ({ entryId }: { entryId: string }, options: SeoEntryOverridesPatch = {}) =>
    request<{ data: SeoEntryMeta }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${entryId}`, {
      method: "PUT",
      body: JSON.stringify(options),
    }),
  /** GET an entry's SEO score + issues (SPEC-037 REQ-07, read-only). */
  getSeoEntryAnalyze: (entryId: string) =>
    request<{ data: SeoEntryAnalysis }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${entryId}/analyze`),
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
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(options),
    }),
  tombstoneRedirect: (id: string) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects/${id}`, {
      method: "DELETE",
    }),
  getRedirectHits: (id: string) =>
    request<{ data: AdminRedirectHitStats }>(`/workspaces/${WORKSPACE_ID}/redirects/${id}/hits`),
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
    request<{ contentType: AdminContentType }>(`/content-types/${key}/fields`, {
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
    request<{ contentType: AdminContentType }>(`/content-types/${key}/lifecycle`, {
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
    request<{ entry: AdminEntry }>(`/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify({ expectedVersion, ...options }),
    }),
  entryLifecycle: (
    { id, op, expectedVersion }: { id: string; op: "publish" | "unpublish"; expectedVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: AdminEntry }>(`/entries/${id}/lifecycle`, {
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
    request<{ term: AdminTerm }>(`/taxonomy/${taxonomyId}/terms`, {
      method: "POST",
      body: JSON.stringify({ name, parentId: options.parentId }),
    }),
  renameTerm: (
    { termId, newName }: { termId: string; newName: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ term: AdminTerm }>(`/taxonomy/terms/${termId}`, {
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
    request<{ deletedTermId: string }>(`/taxonomy/terms/${termId}`, { method: "DELETE" }),
  /** `deletedTermIds` lists any (unassigned) member terms cascade-deleted along with the taxonomy —
   *  the taxonomy delete is refused (409 `TAXONOMY_HAS_ASSIGNMENTS`) before any of this happens if
   *  even one member term is still assigned, so this list is never a surprise loss of live content. */
  deleteTaxonomy: (taxonomyId: string) =>
    request<{ deletedTaxonomyId: string; deletedTermIds: string[] }>(`/taxonomy/${taxonomyId}`, {
      method: "DELETE",
    }),

  // Categories & Tags — merge-term ceremony (ADR-044, SPEC-018 C-207). 3-step plan/confirm/execute.
  planMergeTerm: (
    { fromTermId, intoTermId }: { fromTermId: string; intoTermId: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedPlanResult<MergeTermPlanDetails>>(`/taxonomy/terms/${fromTermId}/merge/plan`, {
      method: "POST",
      body: JSON.stringify({ intoTermId }),
    }),
  confirmMergeTerm: (
    { fromTermId, planId, planHash }: { fromTermId: string; planId: string; planHash: string },
    _options: Record<string, never> = {}
  ) =>
    request<GatedConfirmResult>(`/taxonomy/terms/${fromTermId}/merge/confirm`, {
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
    request<{ mergedCount: number }>(`/taxonomy/terms/${fromTermId}/merge/execute`, {
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
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${commentId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion, note: options.note }),
    }),
  purgeComment: ({ commentId }: { commentId: string }, options: { note?: string } = {}) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${commentId}/purge`, {
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
    request<{ widget: AdminWidget; whereUsed: AdminWidgetWhereUsed }>(`/workspaces/${WORKSPACE_ID}/widgets/${id}`),
  createWidget: (
    input: { widgetType: AdminWidgetType; title: string; config: Record<string, unknown> },
    options: { slug?: string } = {}
  ) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets`, {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    }),
  updateWidget: (
    { id, baseVersion, config }: { id: string; baseVersion: number; config: Record<string, unknown> },
    _options: Record<string, never> = {}
  ) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets/${id}`, {
      method: "PUT",
      body: JSON.stringify({ baseVersion, config }),
    }),
  trashWidget: (id: string) =>
    request<{ widget: AdminWidget }>(`/workspaces/${WORKSPACE_ID}/widgets/${id}/trash`, { method: "POST" }),
  purgeWidget: ({ id }: { id: string }, options: { force?: boolean } = {}) =>
    request<{ purged: true }>(`/workspaces/${WORKSPACE_ID}/widgets/${id}/purge${options.force ? "?force=true" : ""}`, { method: "POST" }),

  listWidgetRegions: () => request<{ regions: AdminWidgetRegionBinding[] }>(`/workspaces/${WORKSPACE_ID}/widgets/regions`),
  bindWidgetRegion: (regionKey: string) =>
    request<{ area: AdminWidgetArea }>(`/workspaces/${WORKSPACE_ID}/widgets/regions`, {
      method: "POST",
      body: JSON.stringify({ regionKey }),
    }),
  getWidgetRegion: (regionKey: string) =>
    request<{ area: AdminWidgetArea; placements: AdminWidgetPlacement[] }>(`/workspaces/${WORKSPACE_ID}/widgets/regions/${regionKey}`),
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
    request<{ area: AdminWidgetArea }>(`/workspaces/${WORKSPACE_ID}/widgets/regions/${regionKey}`, {
      method: "PUT",
      body: JSON.stringify({ baseVersion, placements }),
    }),

  insertWidgetEmbed: (
    { hostEntryId, baseVersion, widgetEntryId }: { hostEntryId: string; baseVersion: number; widgetEntryId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: { id: string; version: number; bodyJson: unknown }; placementId: string }>(
      `/workspaces/${WORKSPACE_ID}/entries/${hostEntryId}/widget-embeds`,
      { method: "POST", body: JSON.stringify({ baseVersion, widgetEntryId }) }
    ),
  removeWidgetEmbed: (
    { hostEntryId, placementId, baseVersion }: { hostEntryId: string; placementId: string; baseVersion: number },
    _options: Record<string, never> = {}
  ) =>
    request<{ entry: { id: string; version: number; bodyJson: unknown } }>(
      `/workspaces/${WORKSPACE_ID}/entries/${hostEntryId}/widget-embeds/${placementId}`,
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
      `/workspaces/${WORKSPACE_ID}/plugins/${pluginId}`,
      { method: "PATCH", body: JSON.stringify({ enabled }) }
    ),

  // Deployment panel (`src/server/routes/admin/system/deployment-overview.ts` /
  // `dockerfile-source.ts`) — `system.read`-gated, same shape as `getModuleStatus` just above.
  /** Runtime mode, boot-gate/default-password status, agent-daemon known-failure state, db/uploads
   *  paths, and required-env-var presence (never values) — the Deployment panel's Overview tab. */
  getDeploymentOverview: () =>
    request<AdminDeploymentOverview>(`/workspaces/${WORKSPACE_ID}/system/deployment-overview`),
  /** The repo-root `Dockerfile`'s current contents, or `{ exists: false }` when none has been
   *  generated yet. */
  getDockerfileSource: () =>
    request<AdminDockerfileSource>(`/workspaces/${WORKSPACE_ID}/system/dockerfile`),
  /** 2026-08-15 — `PUT` half of the Dockerfile tab, `system.write`-gated (distinct from the `GET`
   *  above's `system.read`, mirroring `triggerSiteExport`'s own `system.export` vs `system.read`
   *  split below). Overwrites the repo-root Dockerfile with `contents` and returns the snapshot it
   *  now has — this only writes bytes to disk, it never builds or deploys anything. */
  setDockerfileSource: (contents: string) =>
    request<AdminDockerfileSource>(`/workspaces/${WORKSPACE_ID}/system/dockerfile`, {
      method: "PUT",
      body: JSON.stringify({ contents }),
    }),

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
   *  running — this instance runs at most one publish at a time, independent of a plain export. */
  triggerPublish: (input: { config: AdminStaticPublishConfig; projectName: string }) =>
    request<AdminPublishRunSnapshot>(`/workspaces/${WORKSPACE_ID}/system/publish`, {
      method: "POST",
      body: JSON.stringify({ ...input.config, projectName: input.projectName }),
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
    request<{ credential: AdminPublishCredentialSummary }>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** `204`, idempotent — deleting an id that is already gone (a stale list, a double click) still
   *  resolves rather than throwing. */
  deletePublishCredential: (id: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/system/publish/credentials/${id}`, { method: "DELETE" }),

  /** Full Site tab (`src/server/routes/admin/deployments/list.ts`) — read-only snapshot of the
   *  `deployments` domain's environments/targets/releases/runs. `deployments.read`-gated. */
  getDeployments: () => request<AdminDeploymentsSnapshot>(`/workspaces/${WORKSPACE_ID}/deployments`),
};
