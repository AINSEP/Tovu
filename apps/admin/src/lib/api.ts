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
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
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

/** Storage — Timeline (ADR-041 §1). Mirrors `features/storage/timeline.ts`'s `LedgerRow`. */
export interface AdminLedgerRow {
  id: string;
  kind: string;
  createdAt: string;
  restorePointId: string | null;
  outcome: string;
}

export type RestorePointCostClass = "cheap" | "expensive" | "unavailable";

/** One persisted `restore_points` row (Storage's and Recovery's shared list source). */
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

export type DegradedBannerActionKind = "deep-link-to-storage-migration" | "unblock-interrupted-migration" | "none";

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
export interface StorageContextEnvelope {
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
 * gateway, wired into the real composition for the first time): taxonomy merge-term, storage
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
  storageTimelineDeepLink?: { v: 1; siteId: string; intent: "view" };
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

export const api = {
  login: (username: string, password: string) =>
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
  updatePost: (id: string, input: Pick<AdminPost, "title" | "slug" | "bodyJson" | "status">) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  listPages: () =>
    request<{ posts: Array<{ post: AdminPost }> }>(`/workspaces/${WORKSPACE_ID}/pages`),
  createPage: (title: string) =>
    request<{ post: AdminPost }>(`/workspaces/${WORKSPACE_ID}/pages`, {
      method: "POST",
      body: JSON.stringify({ title }),
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
  requestMemberMagicLink: (email: string, redirectPath?: string) =>
    request<{ delivered: true }>(`/workspaces/${WORKSPACE_ID}/members/request-magic-link`, {
      method: "POST",
      body: JSON.stringify({ email, redirectPath }),
    }),
  listRecentAnalyticsHits: (limit?: number) =>
    request<{ hits: AdminAnalyticsHit[] }>(
      `/workspaces/${WORKSPACE_ID}/analytics/recent-hits${limit ? `?limit=${limit}` : ""}`
    ),
  listMenus: () =>
    request<{ menus: AdminMenu[] }>(`/workspaces/${WORKSPACE_ID}/menus`),
  getMenu: (id: string) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`),
  createMenu: (input: { title: string; slug: string; items?: AdminMenuItem[] }) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMenuTree: (
    id: string,
    input: { expectedVersion: number; title?: string; slug?: string; items: AdminMenuItem[] }
  ) =>
    request<{ menu: AdminMenu }>(`/workspaces/${WORKSPACE_ID}/menus/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  assignMenuLocation: (id: string, locationKey: string) =>
    request<{
      menu: AdminMenu;
      binding: { locationKey: string; menuId: string; boundAt: string };
      displacedMenu: AdminMenu | null;
    }>(`/workspaces/${WORKSPACE_ID}/menus/${id}/locations`, {
      method: "POST",
      body: JSON.stringify({ locationKey }),
    }),
  deleteMenu: (id: string, force?: boolean) =>
    request<{ menu: AdminMenu | null; purged: boolean }>(
      `/workspaces/${WORKSPACE_ID}/menus/${id}${force ? "?force=true" : ""}`,
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
  pauseIntegrationSubscription: (id: string, paused: boolean) =>
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
  uploadMedia: (input: {
    filename: string;
    contentType: string;
    dataBase64: string;
    alt?: string;
    caption?: string;
    credit?: string;
  }) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMedia: (
    id: string,
    input: { title?: string; alt?: string; caption?: string; credit?: string }
  ) =>
    request<{ media: AdminMedia }>(`/workspaces/${WORKSPACE_ID}/media/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
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
  createUser: (input: { username: string; password: string; email?: string }) =>
    request<{ user: AdminIdentityUser }>(`/workspaces/${WORKSPACE_ID}/users`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  assignRole: (principalId: string, roleId: string) =>
    request<{ assignment: unknown }>(`/workspaces/${WORKSPACE_ID}/users/${principalId}/roles`, {
      method: "POST",
      body: JSON.stringify({ roleId }),
    }),
  attachPolicy: (principalId: string, policyId: string) =>
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
  listPolicies: () => request<{ policies: AdminPolicy[] }>(`/workspaces/${WORKSPACE_ID}/policies`),
  createPolicy: (name: string, description?: string) =>
    request<{ policy: AdminPolicy }>(`/workspaces/${WORKSPACE_ID}/policies`, {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),

  // SPEC-007 Settings (core-only layered ledger) — Phase 6 UI.
  getSettingsEffective: (namespace: string, opts: { principalId?: string } = {}) => {
    const params = new URLSearchParams({ namespace });
    if (opts.principalId) params.set("principalId", opts.principalId);
    return request<{ data: SettingResolvedValue[] }>(
      `/workspaces/${WORKSPACE_ID}/settings/effective?${params.toString()}`
    );
  },
  setSetting: (input: {
    namespace: string;
    key: string;
    scope: SettingScope;
    valueJson: unknown;
    principalId?: string;
  }) =>
    request<SettingValueResponse>(`/workspaces/${WORKSPACE_ID}/settings/value`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  clearSetting: (input: { namespace: string; key: string; scope: SettingScope; principalId?: string }) =>
    request<SettingValueResponse>(`/workspaces/${WORKSPACE_ID}/settings/value`, {
      method: "DELETE",
      body: JSON.stringify(input),
    }),
  resetSettingsNamespace: (input: { namespace: string; scope: SettingScope }) =>
    request<SettingResetResponse>(`/workspaces/${WORKSPACE_ID}/settings/reset`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // SPEC-010 Forms (Tier-1 sample plugin) — admin UI.
  listForms: () => request<{ data: AdminFormDefinition[] }>(`/workspaces/${WORKSPACE_ID}/forms`),
  getForm: (id: string) => request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${id}`),
  createForm: (input: { name: string; slug: string; fields: AdminFormField[]; notify?: AdminFormNotify }) =>
    request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateForm: (
    id: string,
    input: { name?: string; fields?: AdminFormField[]; notify?: AdminFormNotify; status?: "active" | "disabled" }
  ) =>
    request<{ data: AdminFormDefinition }>(`/workspaces/${WORKSPACE_ID}/forms/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  listFormSubmissions: (formId: string, opts: { cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<{ data: AdminFormSubmission[]; nextCursor: string | null }>(
      `/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions${qs ? `?${qs}` : ""}`
    );
  },
  getFormSubmission: (formId: string, submissionId: string) =>
    request<{ data: AdminFormSubmission }>(`/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions/${submissionId}`),
  deleteFormSubmission: (formId: string, submissionId: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/forms/${formId}/submissions/${submissionId}`, {
      method: "DELETE",
    }),
  getSeoSettings: () => request<{ data: SeoSettings }>(`/workspaces/${WORKSPACE_ID}/seo/settings`),
  setSeoSettings: (patch: Partial<SeoSettings>) =>
    request<{ data: SeoSettings }>(`/workspaces/${WORKSPACE_ID}/seo/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
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
  putSeoEntry: (entryId: string, patch: SeoEntryOverridesPatch) =>
    request<{ data: SeoEntryMeta }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${entryId}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  /** GET an entry's SEO score + issues (SPEC-037 REQ-07, read-only). */
  getSeoEntryAnalyze: (entryId: string) =>
    request<{ data: SeoEntryAnalysis }>(`/workspaces/${WORKSPACE_ID}/seo/entries/${entryId}/analyze`),
  listRedirects: () => request<{ data: AdminRedirect[] }>(`/workspaces/${WORKSPACE_ID}/redirects`),
  createRedirect: (input: {
    matchType: string;
    fromPattern: string;
    toTarget: string;
    statusCode: number;
    override?: boolean;
    priority?: number;
  }) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRedirect: (
    id: string,
    patch: Partial<{
      matchType: string;
      fromPattern: string;
      toTarget: string;
      statusCode: number;
      status: string;
      override: boolean;
      priority: number;
    }>
  ) =>
    request<{ data: AdminRedirect }>(`/workspaces/${WORKSPACE_ID}/redirects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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
  // authed principal's session server-side, matching `storage`/`recovery` below.
  listContentTypes: () => request<{ items: AdminContentType[] }>("/content-types"),
  createContentType: (input: { key: string; label: string; fields: ContentTypeFieldDef[] }) =>
    request<{ contentType: AdminContentType }>("/content-types", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateContentTypeFields: (key: string, input: { fields: ContentTypeFieldDef[]; expectedVersion: number }) =>
    request<{ contentType: AdminContentType }>(`/content-types/${key}/fields`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  contentTypeLifecycle: (key: string, op: "deprecate" | "reactivate" | "tombstone", expectedVersion: number) =>
    request<{ contentType: AdminContentType }>(`/content-types/${key}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    }),
  listEntries: (type?: string) =>
    request<{ items: AdminEntry[] }>(`/entries${type ? `?type=${encodeURIComponent(type)}` : ""}`),
  createEntry: (input: { type: string; slug: string; title: string; fieldsJson?: unknown; bodyJson?: unknown }) =>
    request<{ entry: AdminEntry }>("/entries", { method: "POST", body: JSON.stringify(input) }),
  updateEntry: (id: string, input: { title?: string; fieldsJson?: unknown; expectedVersion: number }) =>
    request<{ entry: AdminEntry }>(`/entries/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  entryLifecycle: (id: string, op: "publish" | "unpublish", expectedVersion: number) =>
    request<{ entry: AdminEntry }>(`/entries/${id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ op, expectedVersion }),
    }),

  // Categories & Tags (ADR-044) — taxonomies + terms.
  listTaxonomies: () => request<{ items: AdminTaxonomyWithTerms[] }>("/taxonomy"),
  createTaxonomy: (input: { name: string; hierarchical: boolean }) =>
    request<{ taxonomy: AdminTaxonomy }>("/taxonomy", { method: "POST", body: JSON.stringify(input) }),
  createTerm: (taxonomyId: string, input: { name: string; parentId?: string | null }) =>
    request<{ term: AdminTerm }>(`/taxonomy/${taxonomyId}/terms`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  renameTerm: (termId: string, newName: string) =>
    request<{ term: AdminTerm }>(`/taxonomy/terms/${termId}`, {
      method: "PUT",
      body: JSON.stringify({ newName }),
    }),
  /** Additive: upserts one `entry_terms` row per `termIds` entry (never clears an existing,
   * unselected assignment — there is no remove-assignment route yet). */
  assignTerms: (input: { contentType: string; contentId: string; termIds: string[] }) =>
    request<void>("/taxonomy/assign-terms", { method: "POST", body: JSON.stringify(input) }),

  // Categories & Tags — merge-term ceremony (ADR-044, SPEC-018 C-207). 3-step plan/confirm/execute.
  planMergeTerm: (fromTermId: string, intoTermId: string) =>
    request<GatedPlanResult<MergeTermPlanDetails>>(`/taxonomy/terms/${fromTermId}/merge/plan`, {
      method: "POST",
      body: JSON.stringify({ intoTermId }),
    }),
  confirmMergeTerm: (fromTermId: string, planId: string, planHash: string) =>
    request<GatedConfirmResult>(`/taxonomy/terms/${fromTermId}/merge/confirm`, {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    }),
  executeMergeTerm: (fromTermId: string, intoTermId: string, confirmationToken: string) =>
    request<{ mergedCount: number }>(`/taxonomy/terms/${fromTermId}/merge/execute`, {
      method: "POST",
      body: JSON.stringify({ intoTermId, confirmationToken }),
    }),

  // Storage — Timeline + restore points (ADR-041).
  getStorageTimeline: (opts: {
    kind?: string;
    outcome?: string;
    fromDate?: string;
    toDate?: string;
    cursor?: string;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.outcome) params.set("outcome", opts.outcome);
    if (opts.fromDate) params.set("fromDate", opts.fromDate);
    if (opts.toDate) params.set("toDate", opts.toDate);
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<{ items: AdminLedgerRow[]; nextCursor: string | null }>(
      `/storage/timeline${qs ? `?${qs}` : ""}`
    );
  },
  listStorageRestorePoints: () => request<{ items: AdminRestorePoint[] }>("/storage/restore-points"),
  createStorageRestorePoint: (input: { trigger?: string; costAck?: boolean } = {}) =>
    request<{ restorePoint: AdminRestorePointSummary }>("/storage/restore-points", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Storage — migrate-forward ceremony (ADR-041 §3, SPEC-017 C-103/C-105). Plan takes no body —
  // the plan is computed entirely from the site's current migration/capability state server-side.
  planMigrateForward: () =>
    request<GatedPlanResult>("/storage/migrate-forward/plan", { method: "POST" }),
  confirmMigrateForward: (planId: string, planHash: string) =>
    request<GatedConfirmResult>("/storage/migrate-forward/confirm", {
      method: "POST",
      body: JSON.stringify({ planId, planHash }),
    }),
  executeMigrateForward: (confirmationToken: string) =>
    request<MigrateForwardExecuteResult>("/storage/migrate-forward/execute", {
      method: "POST",
      body: JSON.stringify({ confirmationToken }),
    }),

  // Recovery (ADR-045) — restore-points list (shared with Storage), disclosure, deep-link, status,
  // and the restore ceremony itself (SPEC-019 C-301/C-302/C-303).
  listRecoveryRestorePoints: () => request<{ items: AdminRestorePoint[] }>("/recovery/restore-points"),
  computeRecoveryDisclosure: (restorePointId: string) =>
    request<AdminDisclosureResult>("/recovery/disclosure", {
      method: "POST",
      body: JSON.stringify({ restorePointId }),
    }),
  resolveRecoveryDeepLink: (envelope: StorageContextEnvelope) =>
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
  confirmRestore: (planId: string, planHash: string, disclosureAcknowledged: boolean) =>
    request<GatedConfirmResult>("/recovery/restore/confirm", {
      method: "POST",
      body: JSON.stringify({ planId, planHash, disclosureAcknowledged }),
    }),
  executeRestore: (confirmationToken: string, restorePointId: string) =>
    request<RestoreExecuteResult>("/recovery/restore/execute", {
      method: "POST",
      body: JSON.stringify({ confirmationToken, restorePointId }),
    }),

  // Comments — moderation queue + settings (ADR-031, SPEC-033/035, SPEC-036 frontend). Mirrors
  // `getStorageTimeline`'s query-param-building shape for the paginated queue read, and
  // `getSeoSettings`/`setSeoSettings`'s `{data: ...}` shape for the settings GET/PUT.
  listCommentsQueue: (opts: { status?: CommentStatus; cursor?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request<AdminCommentsQueuePage>(`/workspaces/${WORKSPACE_ID}/comments/queue${qs ? `?${qs}` : ""}`);
  },
  moderateComment: (commentId: string, action: CommentModerationAction, input: { expectedVersion: number; note?: string }) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${commentId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: input.expectedVersion, note: input.note }),
    }),
  purgeComment: (commentId: string, note?: string) =>
    request<void>(`/workspaces/${WORKSPACE_ID}/comments/${commentId}/purge`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  getCommentsSettings: () => request<{ data: CommentsSettings }>(`/workspaces/${WORKSPACE_ID}/comments/settings`),
  putCommentsSettings: (patch: Partial<CommentsSettings>) =>
    request<{ data: CommentsSettings }>(`/workspaces/${WORKSPACE_ID}/comments/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
};
