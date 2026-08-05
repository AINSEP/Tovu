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
}

export interface PresentationSettings {
  workspaceId: string;
  activeThemeId: string;
  updatedAt: string;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      String(body?.error ?? `request failed (${res.status})`),
      res.status,
      typeof body?.code === "string" ? body.code : undefined,
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
  updatePost: (
    { id }: { id: string },
    options: Partial<Pick<AdminPost, "title" | "slug" | "bodyJson" | "status">> = {}
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
    request<{ settings: PresentationSettings; availableThemeIds: string[] }>(
      `/workspaces/${WORKSPACE_ID}/presentation`
    ),
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
  assignMenuLocation: (
    { id, locationKey }: { id: string; locationKey: string },
    _options: Record<string, never> = {}
  ) =>
    request<{
      menu: AdminMenu;
      binding: { locationKey: string; menuId: string; boundAt: string };
      displacedMenu: AdminMenu | null;
    }>(`/workspaces/${WORKSPACE_ID}/menus/${id}/locations`, {
      method: "POST",
      body: JSON.stringify({ locationKey }),
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
};
