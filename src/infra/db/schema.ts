import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * @file Drizzle schema for the per-site content.db (code-first, ADR-006/ADR-012).
 *
 * Purpose:
 * One shared, typed schema definition. `drizzle-kit generate` turns this into the
 * migration SQL under `drizzle/`; the same tables map cleanly to a future Postgres
 * dialect (the rule-of-two second adapter) — this is Payload's shared-schema shape.
 *
 * Content is stored as normalized columns + JSON text (`body_json`) so it stays
 * portable to Postgres `jsonb` later.
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    bodyJson: text("body_json").notNull(),
    status: text("status").notNull(),
    /** Discriminates the `post` vs `page` admin lens over this one table (see `features/post/post.ts`). */
    kind: text("kind").notNull().default("post"),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
    /**
     * SPEC-008 (ADR-PIPE-008 Decision §4) — the per-entry SEO override bag
     * (`SeoExtFields`, JSON-serialized), written ONLY through
     * `src/seo/write-service.ts`'s `setEntrySeoOverrides` chokepoint (INV-01).
     * Nullable, additive, no backfill: `null` means "derive everything" (SEO
     * Migration Safety — every pre-existing row is correctly served by the
     * derivation rules with zero special-casing).
     */
    seoExtJson: text("seo_ext_json"),
  },
  (table) => [
    uniqueIndex("posts_workspace_slug_unique").on(table.workspaceId, table.slug),
    index("idx_posts_workspace").on(table.workspaceId),
  ]
);

export const presentationSettings = sqliteTable("presentation_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  activeThemeId: text("active_theme_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Settings (SPEC-007, core-only subset of ADR-028 §2). Schemas-as-data
 * definition registry: one active/alias/deprecated/tombstone row per version,
 * keyed by the stable `setting_id` (ULID) so renames never move value rows.
 */
export const settingDefinitions = sqliteTable(
  "setting_definitions",
  {
    settingId: text("setting_id").notNull(),
    version: integer("version").notNull().default(1),
    /** NULL = platform def (core/theme); non-null = site-owned (ADR-028 §2 CHECK). */
    workspaceId: text("workspace_id"),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    ownerKind: text("owner_kind").notNull(),
    ownerId: text("owner_id"),
    schemaJson: text("schema_json").notNull(),
    defaultJson: text("default_json"),
    /** Bitmask: global=1, workspace=2, user=4 (1..7). */
    scopes: integer("scopes").notNull(),
    secret: integer("secret").notNull().default(0),
    status: text("status").notNull(),
    aliasOfKey: text("alias_of_key"),
    aliasOfNs: text("alias_of_ns"),
    coercionJson: text("coercion_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("pk_setting_definitions").on(table.settingId, table.version),
    // ADR-028 §2 ux_def_active: one active-or-alias row per (ns,key) per tenant
    // partition. SQLite doesn't support a partial-unique WHERE clause through
    // Drizzle's builder here, so this app-level uniqueness is additionally
    // enforced by write-service.ts before insert (write-chokepoint discipline).
    index("idx_def_namespace_key_workspace").on(table.namespace, table.key, table.workspaceId),
  ]
);

export const settingValuesGlobal = sqliteTable("setting_values_global", {
  settingId: text("setting_id").primaryKey(),
  valueJson: text("value_json"),
  state: text("state").notNull().default("set"),
  defVersion: integer("def_version").notNull(),
  seq: integer("seq").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  originPluginId: text("origin_plugin_id"),
});

export const settingValuesWorkspace = sqliteTable(
  "setting_values_workspace",
  {
    settingId: text("setting_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    valueJson: text("value_json"),
    state: text("state").notNull().default("set"),
    defVersion: integer("def_version").notNull(),
    seq: integer("seq").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    originPluginId: text("origin_plugin_id"),
  },
  (table) => [uniqueIndex("pk_setting_values_workspace").on(table.workspaceId, table.settingId)]
);

/**
 * `workspace_id`/`principal_id` deliberately carry NO SQL foreign key to a
 * `principals` table: `identity` has no SQLite adapter yet (principals are
 * in-memory only, see `src/identity/repo.memory.ts`) — there is no SQL table
 * to reference. REQ-13's target-principal existence/workspace-match check is
 * therefore enforced at the application layer in `write-service.ts` via
 * `identity.PrincipalRepoPort.findById`, not a DB constraint. `workspace_id`
 * still carries a real FK to `workspaces`, which does exist as a SQL table.
 */
export const settingValuesUser = sqliteTable(
  "setting_values_user",
  {
    settingId: text("setting_id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    principalId: text("principal_id").notNull(),
    valueJson: text("value_json"),
    state: text("state").notNull().default("set"),
    defVersion: integer("def_version").notNull(),
    seq: integer("seq").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
    originPluginId: text("origin_plugin_id"),
  },
  (table) => [
    uniqueIndex("pk_setting_values_user").on(table.workspaceId, table.principalId, table.settingId),
  ]
);

/**
 * Menus (ADR-PIPE-012 D-5 — rule-of-two SQLite adapter for `MenuRepoPort`).
 * Mirrors the `posts` table shape: id/workspaceId/slug/title/status +
 * JSON-text columns for the tree (`docJson`) and location assignments
 * (`locationsJson`), + updatedAt/version for OCC. `SqliteMenuRepo`
 * (`src/navigation/repo.sqlite.ts`) is the adapter that reads/writes this
 * table; the in-memory adapter (`InMemoryMenuRepo`, `repo.memory.ts`) is the
 * other rule-of-two half, unchanged by this table's existence.
 */
export const menus = sqliteTable(
  "menus",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    docJson: text("doc_json").notNull(),
    locationsJson: text("locations_json").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("menus_workspace_slug_unique").on(table.workspaceId, table.slug),
    index("idx_menus_workspace").on(table.workspaceId),
  ]
);

/**
 * The derived `nav_location_bindings` index (ADR-029 §Decision-3, ADR-PIPE-012
 * D-5/D-8). `UNIQUE(workspace_id, location_key)` is the DB-level enforcement
 * of INV-02 (never two menus bound to the same location) — a genuine
 * strengthening over the in-memory adapter's single-threaded-only guarantee
 * (see `SqliteNavLocationBindingRepo.upsert`'s `onConflictDoUpdate`).
 */
export const navLocationBindings = sqliteTable(
  "nav_location_bindings",
  {
    workspaceId: text("workspace_id").notNull(),
    locationKey: text("location_key").notNull(),
    menuId: text("menu_id").notNull(),
    boundAt: text("bound_at").notNull(),
  },
  (table) => [
    uniqueIndex("nav_location_bindings_workspace_location_unique").on(
      table.workspaceId,
      table.locationKey
    ),
    index("idx_nav_location_bindings_menu").on(table.workspaceId, table.menuId),
  ]
);

/** Append-only ledger (ADR-028 §2) — never cascade-deleted, never updated in place. */
export const settingRevisions = sqliteTable(
  "setting_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    entityKind: text("entity_kind").notNull(),
    settingId: text("setting_id").notNull(),
    scope: text("scope"),
    workspaceId: text("workspace_id"),
    principalId: text("principal_id"),
    op: text("op").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    defVersion: integer("def_version").notNull(),
    actor: text("actor").notNull(),
    originPluginId: text("origin_plugin_id"),
    changeSetId: text("change_set_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_rev_setting").on(table.settingId, table.seq)]
);

/**
 * Forms (SPEC-010, ADR-PIPE-010, state.spec.md §0/§1.1). Core-owned tables — same precedent as
 * `settingDefinitions`/`assetBlobs`/`webhookSubscriptions`, not the generic ADR-022 `entries`
 * model (which doesn't exist in this repo). `slug` is unique per workspace via a real DB unique
 * index (behavior.spec.md §6.1 — the tie-break mechanism, not an app-level check-then-insert),
 * mirroring `posts_workspace_slug_unique`.
 */
export const formDefinitions = sqliteTable(
  "form_definitions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    fieldsJson: text("fields_json").notNull(),
    notifyJson: text("notify_json").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("form_definitions_workspace_slug_unique").on(table.workspaceId, table.slug),
    index("idx_form_definitions_workspace").on(table.workspaceId),
  ]
);

/**
 * `form_submissions` (state.spec.md §1.2) — immutable except for permanent delete (REQ-14, INV-08
 * carve-out). FK to `form_definitions.id` per the ADR's Module Boundaries.
 */
export const formSubmissions = sqliteTable(
  "form_submissions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    formDefinitionId: text("form_definition_id")
      .notNull()
      .references(() => formDefinitions.id, { onDelete: "restrict" }),
    dataJson: text("data_json").notNull(),
    sourceIp: text("source_ip").notNull(),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("idx_form_submissions_definition").on(table.formDefinitionId, table.submittedAt),
    index("idx_form_submissions_workspace").on(table.workspaceId),
  ]
);

/**
 * Redirects (SPEC-009, ADR-033 §2). Core-owned tables reusing ADR-022's write-
 * chokepoint discipline (single write chokepoint, append-only revisions, ULIDs)
 * WITHOUT modelling rules as `entries` (they are operational routing state, not
 * editorial content — see `src/redirects/types.ts`'s file header).
 *
 * `(workspace_id, from_pattern)` exact-match uniqueness is a PARTIAL constraint
 * (only `matchType='exact' AND status='active'` rows, behavior.spec.md §5.1) —
 * SQLite/Drizzle can't express a partial-unique index through the builder here
 * (same documented limitation `settingDefinitions`' `ux_def_active` comment
 * already carries), so this is a plain lookup index only; true uniqueness is
 * enforced at the application layer in `redirects/repo.sqlite.ts`.
 */
export const redirects = sqliteTable(
  "redirects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    matchType: text("match_type").notNull(),
    fromPattern: text("from_pattern").notNull(),
    toTarget: text("to_target").notNull(),
    statusCode: integer("status_code").notNull(),
    status: text("status").notNull(),
    override: integer("override").notNull(),
    priority: integer("priority").notNull(),
    source: text("source").notNull(),
    sourceEntryId: text("source_entry_id"),
    fromPathAtCapture: text("from_path_at_capture"),
    toPathAtCapture: text("to_path_at_capture"),
    createdByPrincipal: text("created_by_principal").notNull(),
    createdByPluginId: text("created_by_plugin_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    index("idx_redirects_workspace_frompattern").on(table.workspaceId, table.fromPattern),
    index("idx_redirects_workspace_status").on(table.workspaceId, table.status),
  ]
);

/**
 * Append-only revision ledger for `redirects` (ADR-022 §4b discipline, ADR-033
 * §2) — never updated or deleted after insert. `seq` is monotonic PER
 * `redirect_id` (mirrors `RedirectRecord.version`), unlike `setting_revisions`'
 * globally-autoincrementing `seq`; `id` is a surrogate row key.
 */
export const redirectRevisions = sqliteTable(
  "redirect_revisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    redirectId: text("redirect_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    seq: integer("seq").notNull(),
    stateJson: text("state_json").notNull(),
    tombstoned: integer("tombstoned").notNull(),
    actorId: text("actor_id").notNull(),
    pluginId: text("plugin_id"),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_redirect_revisions_redirect_seq").on(table.redirectId, table.seq),
  ]
);

/**
 * Operational hit telemetry sidecar (ADR-033 §2) — DELIBERATELY non-revisioned
 * (narrows ADR-022 INV-3, matching `asset_renditions`' ADR-027 precedent): one
 * row per redirect, updated async off the request hot path.
 */
export const redirectHits = sqliteTable("redirect_hits", {
  redirectId: text("redirect_id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  lastHitAt: text("last_hit_at"),
});

/**
 * Members (ADR-030, ADR-PIPE-013 Decision §5 — rule-of-two SQLite adapter for
 * all 6 `members` repo ports). 7 tables mirror `SqlitePostRepo`'s/
 * `src/features/settings/repo.sqlite.ts`'s exact shape: typed columns +
 * JSON-text bags for nested/optional fields. NOT wired into `server/app.ts`'s
 * boot path this pass (ADR-PIPE-013 Decision §5 — the in-memory adapters
 * remain the only ones actually receiving traffic; no feature in this repo
 * has flipped that switch yet, matching `SqlitePostRepo`'s own precedent).
 */
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    emailVerifiedAt: text("email_verified_at"),
    status: text("status").notNull(),
    note: text("note"),
    fieldsJson: text("fields_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [uniqueIndex("members_workspace_email_unique").on(table.workspaceId, table.email)]
);

export const memberTiers = sqliteTable(
  "member_tiers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    description: text("description"),
    welcomePagePath: text("welcome_page_path"),
    visibleInPortal: integer("visible_in_portal").notNull().default(0),
    monthlyPriceCents: integer("monthly_price_cents"),
    yearlyPriceCents: integer("yearly_price_cents"),
    currency: text("currency"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [uniqueIndex("member_tiers_workspace_slug_unique").on(table.workspaceId, table.slug)]
);

export const memberSubscriptions = sqliteTable(
  "member_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    tierId: text("tier_id").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    externalRef: text("external_ref"),
    startedAt: text("started_at").notNull(),
    currentPeriodEnd: text("current_period_end"),
    canceledAt: text("canceled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [index("idx_member_subscriptions_workspace_member").on(table.workspaceId, table.memberId)]
);

export const memberSessions = sqliteTable(
  "member_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at"),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (table) => [
    uniqueIndex("member_sessions_workspace_tokenhash_unique").on(table.workspaceId, table.tokenHash),
    index("idx_member_sessions_workspace_member").on(table.workspaceId, table.memberId),
  ]
);

export const memberMagicTokens = sqliteTable(
  "member_magic_tokens",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
  },
  (table) => [
    uniqueIndex("member_magic_tokens_workspace_tokenhash_unique").on(table.workspaceId, table.tokenHash),
  ]
);

/**
 * D1c consent value table (ADR-PIPE-013 Decision §4). `(workspace_id,
 * member_id, purpose)` uniqueness mirrors the app-level natural key
 * `consent-service.ts` always looks up by; `save()` still upserts by `id`
 * (matching every other repo port's shape), so this unique index is a
 * DB-level strengthening (belt-and-braces), not the primary access path.
 */
export const memberConsents = sqliteTable(
  "member_consents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    grantedAt: text("granted_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("member_consents_workspace_member_purpose_unique").on(
      table.workspaceId,
      table.memberId,
      table.purpose
    ),
  ]
);

/**
 * Append-only ledger for the `members` domain (ADR-030 §6 "planned"; ADR-
 * PIPE-013 Decision §5 widens `entity_kind` to include `'consent'`).
 * `consent-service.ts` is the first real writer of this ledger this pass —
 * the originally-planned `member`/`tier`/`subscription` entity kinds remain
 * unwritten by any shipping caller (a disclosed, pre-existing gap this
 * remediation does not retrofit; see ADR-PIPE-013 Data And Side-Effect
 * Boundaries). `purpose`/`origin_module` are consent-specific columns,
 * nullable so the table shape stays forward-compatible with the other
 * entity kinds if/when they start writing here too.
 */
export const memberRevisions = sqliteTable(
  "member_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    entityKind: text("entity_kind").notNull(),
    entityId: text("entity_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    memberId: text("member_id").notNull(),
    purpose: text("purpose"),
    op: text("op").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    originModule: text("origin_module"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_member_revisions_workspace_member").on(table.workspaceId, table.memberId)]
);

/**
 * Newsletter (SPEC-011, ADR-PIPE-011 Decision §2). The campaign editorial row is a BESPOKE Drizzle
 * table pair (not the ADR-023 `dataModule` path) — the 5 relational `p_newsletter__*` tables (lists/
 * subscriptions/audience_snapshots/sends/confirmation_tokens) are `declareDataModule()`-owned instead
 * (see `src/newsletter/data-module-manifest.ts`), NOT declared here. `countersJson`/`stateJson` are
 * JSON-serialized text columns, mirroring `settingRevisions`/`redirectRevisions`'s convention.
 */
export const newsletterCampaigns = sqliteTable(
  "newsletter_campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    status: text("status").notNull(),
    subject: text("subject").notNull(),
    preheader: text("preheader"),
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to").notNull(),
    listId: text("list_id").notNull(),
    scheduledAt: text("scheduled_at"),
    sendStartedAt: text("send_started_at"),
    audienceSnapshotId: text("audience_snapshot_id"),
    countersJson: text("counters_json").notNull(),
    version: integer("version").notNull(),
    createdByPrincipal: text("created_by_principal").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_newsletter_campaigns_workspace").on(table.workspaceId)]
);

/** INV-01: a campaign row must never exist without a same-tx revision row (`campaign-write-service.ts`). */
export const newsletterCampaignRevisions = sqliteTable(
  "newsletter_campaign_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    stateJson: text("state_json").notNull(),
    actorId: text("actor_id").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("idx_newsletter_campaign_revisions_campaign").on(table.campaignId, table.seq)]
);
