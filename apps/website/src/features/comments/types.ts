/**
 * @file Core type definitions for the Comments bundled plugin (ADR-031).
 *
 * Purpose:
 * The row/schema and domain types the Comments moderation queue introduces. Comments is a
 * Tier-3 *bundled* plugin (ships first-party, runs in-process today) authored to the Tier-2 SDK
 * contract on purpose — it is the deliberate SDK stress test of §3.5 (own tables, hooks, admin
 * surface, moderation queue) and the concrete demand plugin ADR-023 §12 asks the dataModule
 * engine to be built against.
 *
 * Architectural role:
 * - Comment tables are plugin-owned relational tables under the reserved `p_comments__*`
 *   namespace (ADR-023 §5), declared as data that CORE alone executes (ADR-023 §2).
 * - Every row carries `workspaceId` (ADR-007) and moves through the typed core-owned write
 *   chokepoint (ADR-023 §7 / ADR-022 §4a) — no side-door SQL, revision/attribution preserved.
 * - Payloads that cross the SDK seam (submissions, spam verdicts, hook/event bodies) are
 *   serializable-only, no live core objects (ADR-024 §3, ADR-025 §2).
 *
 * INTERFACES + TYPES ONLY — no feature logic lives here.
 */
import type { ISODateTime, JsonObject, UUID } from "@jini-ai/cms/core";
import type { ColumnType, DataModuleDecl } from "../plugins/index.js";

/**
 * Moderation lifecycle of a comment. The brief's three states (`pending`/`approved`/`spam`)
 * plus `trash` — a soft-delete tier so deletion is recoverable (never-brick; purge is a
 * separate, explicit, `comments.delete.force`-gated act, mirroring ADR-027's trash→purge ladder).
 */
export type CommentStatus = "pending" | "approved" | "spam" | "trash";

/** The moderation transitions recorded, append-only, in the moderation log. */
export type ModerationAction =
  | "submit"
  | "approve"
  | "mark_spam"
  | "unspam"
  | "trash"
  | "restore"
  | "purge";

/**
 * A stored comment row — the shape of `p_comments__comments`.
 *
 * Referential integrity to core `entries` (`entryId`) and to a parent comment (`parentId`) is
 * validated at the write chokepoint, NOT by a DB foreign key: the v1 dataModule seam materializes
 * columns only (no FK/index declaration yet — see ADR-031 Open OQ-1). `workspaceId` is on every
 * row so the composite `(workspace_id, id)` isolation discipline (ADR-021 §4) is buildable once
 * the seam grows FK support.
 */
export interface CommentRecord {
  /** ULID (ADR-022 stable identity). */
  id: UUID;
  /** Tenancy boundary — required on every row (ADR-007). */
  workspaceId: UUID;
  /** The core `entries` row this comment is attached to (validated at the chokepoint). */
  entryId: UUID;
  /** Parent comment for threading; `null` at the top level. Same `entryId` + `workspaceId`. */
  parentId: UUID | null;
  /** Top-of-thread comment id (self for a root) — cheap subtree fetch + stable thread ordering. */
  threadRootId: UUID;
  /** Nesting depth, 0 at the root; bounded by `CommentsSettings.maxDepth`. */
  depth: number;
  /** Moderation state. */
  status: CommentStatus;
  /** Logged-in commenter principal (ADR-021), or `null` for an anonymous public submission. */
  authorPrincipalId: UUID | null;
  /** Display name (required even for anonymous). */
  authorName: string;
  /** Contact email for moderation/notify; PII-tagged, nullable. */
  authorEmail: string | null;
  /** Optional author URL (sanitized, link-capped by the ingress policy). */
  authorUrl: string | null;
  /** Salted hash of the submitter IP — for rate-limit/spam only; the raw IP is never stored. */
  authorIpHash: string | null;
  /** Comment body, already sanitized by the core `text` library (kses-equivalent, §3.5). */
  bodyText: string;
  /** Last spam verdict score in [0,1], or `null` if never checked. */
  spamScore: number | null;
  /** Provider that produced `spamScore` (`heuristic`, `akismet`, …), or `null`. */
  spamProvider: string | null;
  /** ISO creation timestamp. */
  createdAt: ISODateTime;
  /** ISO last-mutation timestamp. */
  updatedAt: ISODateTime;
  /** Optimistic-concurrency version, bumped on every write (mirrors `posts.version`). */
  version: number;
}

/**
 * An append-only moderation audit row — the shape of `p_comments__moderation_log`.
 * Comment status flips are operational (not editorial), so they log here rather than minting an
 * entry revision — the same "narrow the revision-per-write discipline for machine/operational
 * writes, but keep attribution" move ADR-027 §2 makes for media sidecars.
 */
export interface ModerationLogEntry {
  id: UUID;
  workspaceId: UUID;
  commentId: UUID;
  /** Principal that performed the action (ADR-021); `system` for ingress-time auto-classification. */
  actorPrincipalId: UUID;
  action: ModerationAction;
  fromStatus: CommentStatus | null;
  toStatus: CommentStatus;
  at: ISODateTime;
  /** Optional moderator note. */
  note: string | null;
}

/**
 * A public comment submission as it enters the core-mediated ingress — serializable-only
 * (ADR-024 §3). Anonymous submission does NOT fit `authorize()` RBAC, so it flows through a
 * rate-limited, spam-checked `CommentIngressPolicy` (ADR-031 §5), mirroring ADR-027's
 * `MediaIngressPolicy`, rather than the operator gateway.
 */
export interface CommentSubmission {
  workspaceId: UUID;
  entryId: UUID;
  parentId: UUID | null;
  authorName: string;
  authorEmail: string | null;
  authorUrl: string | null;
  /** Raw, un-sanitized body as typed by the visitor; core sanitizes before persisting. */
  bodyRaw: string;
  /** Logged-in commenter principal if present; `null` for anonymous. */
  authorPrincipalId: UUID | null;
  /** Opaque per-request signal bag for the ingress (honeypot value, IP hash, UA hash, …). */
  ingressContext: JsonObject;
}

/** The verdict a `SpamCheckPort` returns — serializable, no live objects (ADR-024 §3). */
export interface SpamVerdict {
  isSpam: boolean;
  /** Confidence in [0,1]. */
  score: number;
  /** Identifier of the classifier that produced this verdict. */
  provider: string;
}

/** One node of a threaded read projection returned to the widget/admin. */
export interface CommentThreadNode {
  comment: CommentRecord;
  replies: CommentThreadNode[];
}

/** A page of the moderation queue (keyset-paginated, ADR-022 §3 query shape). */
export interface ModerationQueuePage {
  items: CommentRecord[];
  /** Opaque keyset cursor for the next page, or `null` at the end. */
  nextCursor: string | null;
}

/**
 * Declarative, per-workspace Comments settings. Stored via the Settings Layered Ledger
 * (ADR-028) under the `comments.*` namespace once the plugin settings path lands — NOT as a
 * comment table. Typed here so the moderation logic and ingress policy share one shape.
 */
export interface CommentsSettings {
  /** Master on/off — comments can be disabled per site (Ghost dropped them entirely; §3.5). */
  enabled: boolean;
  /** New comments start `pending` (moderated) vs `approved` (open). */
  requireModeration: boolean;
  /** Max threading depth; replies deeper than this are flattened to this level. */
  maxDepth: number;
  /** Close submissions on entries older than N days; `null` = never close. */
  closeAfterDays: number | null;
  /** Above this spam score the ingress files a comment straight to `spam`. */
  spamAutoRejectScore: number;
  /** Max submissions per IP-hash per rolling window (rate-limit seam). */
  maxPerIpPerHour: number;
}

/**
 * The `p_comments__*` schema-as-data declaration (ADR-023 §2/§5). This is DATA, not logic: core
 * alone executes the DDL (snapshot→CREATE, `data-module.ts`). It compiles against the real
 * `DataModuleDecl` seam, which is the point of the exercise.
 *
 * OQ-1 RESOLVED (SPEC-033): the dataModule seam now supports declared composite indexes
 * (`TableDecl.indexes`, `data-module.ts`) — the `moderation_queue`/`thread`/`by_comment` indexes
 * below are the concrete demand that grew the grammar (ADR-023 §12's own "build the engine
 * against real demand"). `parentId`'s self-reference and the `(workspaceId,id)` FK to `entries`
 * remain chokepoint-validated, not DB-enforced — ADR-031 §2 itself says this is the intended v1
 * shape ("chokepoint-validated, not FK-enforced"), not a remaining gap.
 */
export const COMMENTS_PLUGIN_ID = "comments";

/**
 * ADR-031 round-2 sweep-crosscutting fold (OQ-3 resolution, SPEC-035): "Pin the anonymous-ingress
 * `system` actor as a seeded principal ULID." A fixed, well-known id (not per-boot-generated) —
 * mirrors `identity/seed.ts`'s `LEGACY_USER_LOCAL_PRINCIPAL_ID` shape (a stable, non-interactive
 * `kind: "system"` principal referenced by id, not resolved dynamically) and `server/seed.ts`'s
 * `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID` convention (a composition-root-seeded constant scoped
 * to one subsystem's boot-time attribution, so it doesn't need to wait on `identity`'s own
 * first-boot `seedIdentity()` seed — which ALSO mints its own separate, dynamically-generated
 * `system` principal for unrelated purposes; deliberately not reused here to avoid coupling
 * `comments/`'s ingress-time attribution to `identity`'s async seed-completion ordering).
 *
 * The composition roots (`server/app.ts`/`server/deps.ts`) seed the actual principal row for this
 * id (chained after `identityReady`, fire-and-forget, logged-and-swallowed on failure — mirrors
 * `menuBindingsReady`'s established pattern) so a human browsing the Users/Principals admin screen
 * sees a real "Comments Ingress (system)" row, not a dangling id. `moderation_log.actor_principal_id`
 * is chokepoint-validated, not FK-enforced (this file's own header), so `ingress.ts#submit()`'s
 * `submit` log row is valid even in the narrow boot window before that seed completes.
 */
export const COMMENTS_INGRESS_SYSTEM_PRINCIPAL_ID = "system-comments-ingress";

const T = (name: string, notNull = false): { name: string; type: ColumnType; notNull?: boolean } => ({
  name,
  type: "TEXT",
  notNull,
});

export const COMMENTS_DATA_MODULE = {
  pluginId: COMMENTS_PLUGIN_ID,
  pluginTier: "tier-2",
  provenance: { sourceUrl: "builtin://comments", publisher: "tovu-core" },
  tables: [
    {
      name: "comments",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T("workspace_id", true),
        T("entry_id", true),
        T("parent_id"),
        T("thread_root_id", true),
        { name: "depth", type: "INTEGER", notNull: true },
        T("status", true),
        T("author_principal_id"),
        T("author_name", true),
        T("author_email"),
        T("author_url"),
        T("author_ip_hash"),
        T("body_text", true),
        { name: "spam_score", type: "REAL" },
        T("spam_provider"),
        T("created_at", true),
        T("updated_at", true),
        { name: "version", type: "INTEGER", notNull: true },
      ],
      // ADR-031 OQ-1 (resolved, SPEC-033): the moderation queue's own query pattern.
      indexes: [
        { name: "moderation_queue", columns: ["workspace_id", "status", "created_at"] },
        { name: "thread", columns: ["workspace_id", "entry_id", "thread_root_id"] },
      ],
    },
    {
      name: "moderation_log",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        T("workspace_id", true),
        T("comment_id", true),
        T("actor_principal_id", true),
        T("action", true),
        T("from_status"),
        T("to_status", true),
        T("at", true),
        T("note"),
      ],
      indexes: [{ name: "by_comment", columns: ["workspace_id", "comment_id"] }],
    },
  ],
} satisfies DataModuleDecl;
