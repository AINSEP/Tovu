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
    /**
     * SPEC-005 (ADR-005-ARCH) — the plugin extension-field bag (`{ [pluginId]: { ...fields } }`),
     * written ONLY by the `content.entry.beforeSave` hook-merge step immediately before the one
     * `repo.save()` call in `createPost`/`updatePost` (BR-06, same transaction as every other
     * `PostRecord` field). Additive, `NOT NULL DEFAULT '{}'`: every pre-existing row is correctly
     * served as "no plugin has written anything" with zero backfill (Migration Safety).
     */
    ext: text("ext").notNull().default("{}"),
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
 * SPEC-005 (ADR-005-ARCH) — the "active pointer" (ADR-004) recording which installed version of a
 * plugin is enabled per workspace. Mirrors `presentation_settings`'s shape: runtime-mutable state
 * lives in `content.db` behind the gateway, never in the install dir or `config.json`. One row per
 * `(workspace_id, plugin_id)`; `PluginActivationRepoPort.save()` upserts on that pair.
 */
export const pluginActivations = sqliteTable(
  "plugin_activations",
  {
    workspaceId: text("workspace_id").notNull(),
    pluginId: text("plugin_id").notNull(),
    version: text("version").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("pk_plugin_activations").on(table.workspaceId, table.pluginId)]
);

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

/** ADR-036 §2 (ADR-PIPE-015 Phase 2, GAP-05). */
export const webhookSubscriptions = sqliteTable(
  "webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    ownerPrincipalId: text("owner_principal_id").notNull(),
    label: text("label").notNull(),
    targetUrl: text("target_url").notNull(),
    topicsJson: text("topics_json").notNull(),
    secretVersion: integer("secret_version").notNull(),
    previousSecretVersion: integer("previous_secret_version"),
    status: text("status").notNull(),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    createdByPluginId: text("created_by_plugin_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    disabledAt: text("disabled_at"),
  },
  (table) => [index("idx_webhook_subscriptions_workspace").on(table.workspaceId)]
);

/**
 * ADR-036 §2 + ADR-PIPE-015 Phase 2 (GAP-05 + GAP-12, folded as one fix). `payloadJson` carries
 * the original event's envelope payload so a delivery worker running in a later process/tick can
 * rebuild the `WebhookEventEnvelope` without re-reading the core event outbox (GAP-12) — written
 * in the same statement as the row insert, per ADR-PIPE-015 T023. The unique index on
 * `(workspace_id, subscription_id, event_id)` is the idempotency guard `claimPending`'s caller
 * relies on (turns the O(n) pre-check scan `delivery.ts`'s `isAlreadyEnqueued` does into a real,
 * storage-level guarantee against a duplicate row under concurrent enqueues).
 */
export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    eventId: text("event_id").notNull(),
    topic: text("topic").notNull(),
    payloadJson: text("payload_json"),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull(),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lastResponseStatus: integer("last_response_status"),
    lastError: text("last_error"),
    signedWithVersion: integer("signed_with_version"),
    createdAt: text("created_at").notNull(),
    deliveredAt: text("delivered_at"),
    deadAt: text("dead_at"),
  },
  (table) => [
    uniqueIndex("idx_webhook_deliveries_workspace_sub_event").on(
      table.workspaceId,
      table.subscriptionId,
      table.eventId
    ),
    index("idx_webhook_deliveries_status_next_attempt").on(table.status, table.nextAttemptAt),
  ]
);

// ---------------------------------------------------------------------------
// Identity / RBAC (ADR-021 / SPEC-006) — the nine identity repo ports' tables.
// Previously in-memory only (matched the disclosed precedent every other
// feature's SQLite adapter had until built); this is that adapter's schema.
// ---------------------------------------------------------------------------

export const principals = sqliteTable("principals", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(), // "user" | "agent" | "api_key" | "system"
  displayName: text("display_name").notNull(),
  status: text("status").notNull(), // "active" | "disabled"
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull(),
});

export const identityUsers = sqliteTable(
  "identity_users",
  {
    principalId: text("principal_id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    username: text("username").notNull(), // pre-normalized (NFC + lowercase) by the caller
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: text("last_login_at"),
  },
  (table) => [uniqueIndex("idx_identity_users_workspace_username").on(table.workspaceId, table.username)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    principalId: text("principal_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [uniqueIndex("idx_sessions_workspace_token_hash").on(table.workspaceId, table.tokenHash)]
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    isBuiltin: integer("is_builtin").notNull(),
  },
  (table) => [uniqueIndex("idx_roles_workspace_name").on(table.workspaceId, table.name)]
);

export const policies = sqliteTable(
  "policies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltin: integer("is_builtin").notNull(),
    isFrozen: integer("is_frozen").notNull(),
  },
  (table) => [uniqueIndex("idx_policies_workspace_name").on(table.workspaceId, table.name)]
);

export const policyPermissions = sqliteTable(
  "policy_permissions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    policyId: text("policy_id").notNull(),
    permission: text("permission").notNull(),
    resourceType: text("resource_type"),
    constraintJson: text("constraint_json"),
  },
  (table) => [index("idx_policy_permissions_workspace_policy").on(table.workspaceId, table.policyId)]
);

export const rolePolicies = sqliteTable(
  "role_policies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    roleId: text("role_id").notNull(),
    policyId: text("policy_id").notNull(),
  },
  (table) => [index("idx_role_policies_workspace_role").on(table.workspaceId, table.roleId)]
);

export const principalRoles = sqliteTable(
  "principal_roles",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    principalId: text("principal_id").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [index("idx_principal_roles_workspace_principal").on(table.workspaceId, table.principalId)]
);

export const principalPolicies = sqliteTable(
  "principal_policies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    principalId: text("principal_id").notNull(),
    policyId: text("policy_id").notNull(),
  },
  (table) => [
    index("idx_principal_policies_workspace_principal").on(table.workspaceId, table.principalId),
  ]
);

/**
 * SPEC-016 (ADR-041 §3, C-004) — the site-wide gated-mutation write watermark. A single
 * singleton row (`id=1`), incremented exactly once per `stampWatermarkTx` call inside the
 * caller's own already-open transaction (same-transaction atomicity, INV-01). Not
 * workspace-scoped: one counter per `content.db` (one site), matching ADR-041's storage-domain
 * boundary. `openContentDb` guarantees the singleton row exists (`INSERT OR IGNORE`) right after
 * migration, so `getCurrentWatermark`/`stampWatermarkTx` never have to special-case "row missing".
 */
export const databaseWriteWatermark = sqliteTable("database_write_watermark", {
  id: integer("id").primaryKey(),
  value: integer("value").notNull().default(0),
  lastStampedAt: text("last_stamped_at"),
});

// ---------------------------------------------------------------------------
// Collections: content-type registry + entries (SPEC-020, ADR-022/ADR-043).
// Closes the disclosed "fakes-only, no real SQLite adapter" gap Sessions 3/5
// of the spec-016-020 workstream left open — see progress-ledger.md. `id` is
// a stable synthetic key (`${workspaceId}::${key}`) since `ContentTypeRecord`
// itself has no surrogate id, only the natural (workspaceId, key) pair.
// ---------------------------------------------------------------------------

export const contentTypes = sqliteTable(
  "content_types",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldsJson: text("fields_json").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull(),
    tombstonedAt: text("tombstoned_at"),
  },
  (table) => [
    uniqueIndex("content_types_workspace_key_unique").on(table.workspaceId, table.key),
    index("idx_content_types_workspace").on(table.workspaceId),
  ]
);

/** Append-only revision ledger for `content_types` (ADR-022 §4a discipline). */
export const contentTypeRevisions = sqliteTable(
  "content_type_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    contentTypeKey: text("content_type_key").notNull(),
    workspaceId: text("workspace_id").notNull(),
    op: text("op").notNull(),
    stateJson: text("state_json").notNull(),
    actorId: text("actor_id").notNull(),
    /**
     * Audit provenance: the actor CLASS behind `actor_id` — `'user'` (a human admin HTTP request),
     * `'agent'` (a write made through the assistant's tool surface), `'api_key'`, or `'system'`.
     * `actor_id` alone cannot answer "human or assistant?": the assistant runs under the very same
     * human principal id, stamped into the run's `contextRef` by `server/modules/assistant.ts`.
     * Nullable and un-backfilled on purpose — rows written before this column existed honestly
     * read as "not recorded" rather than being assigned a fabricated default (Migration Safety).
     */
    principalKind: text("principal_kind"),
    delegatedByWorkspaceId: text("delegated_by_workspace_id"),
    delegatedById: text("delegated_by_id"),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("idx_content_type_revisions_workspace_key").on(table.workspaceId, table.contentTypeKey, table.seq)]
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    type: text("type").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    bodyJson: text("body_json"),
    fieldsJson: text("fields_json").notNull(),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("entries_workspace_type_slug_unique").on(table.workspaceId, table.type, table.slug),
    index("idx_entries_workspace").on(table.workspaceId, table.type),
  ]
);

/** Append-only revision ledger for `entries` (ADR-022 §4a discipline). */
export const entryRevisions = sqliteTable(
  "entry_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    entryId: text("entry_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    op: text("op").notNull(),
    stateJson: text("state_json").notNull(),
    actorId: text("actor_id").notNull(),
    delegatedByWorkspaceId: text("delegated_by_workspace_id"),
    delegatedById: text("delegated_by_id"),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("idx_entry_revisions_workspace_entry").on(table.workspaceId, table.entryId, table.seq)]
);

// ---------------------------------------------------------------------------
// Taxonomy: categories & tags (SPEC-018, ADR-044). `workspace_id` is a real
// scoping column added by the SQLite adapter layer even though the certified
// `TaxonomyRepoPort`/`TermRepoPort`/`EntryTermRepoPort` interfaces (deliberately,
// per that package's own write-service.ts header) never thread a workspaceId
// through their method signatures — the adapter classes are constructed
// workspace-scoped instead (same "scoped at construction" precedent
// `infra/sqlite/storage-journal-repo.ts` already established for `siteId`).
// ---------------------------------------------------------------------------

export const taxonomies = sqliteTable(
  "taxonomies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    hierarchical: integer("hierarchical").notNull(),
    status: text("status").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [index("idx_taxonomies_workspace").on(table.workspaceId)]
);

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    taxonomyId: text("taxonomy_id").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    status: text("status").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [index("idx_terms_workspace_taxonomy").on(table.workspaceId, table.taxonomyId)]
);

/** `entry_terms_unique` (ADR-044) — the idempotent-upsert dedup key `assignTerms` relies on. */
export const entryTerms = sqliteTable(
  "entry_terms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    contentType: text("content_type").notNull(),
    contentId: text("content_id").notNull(),
    termId: text("term_id").notNull(),
    addedAt: text("added_at").notNull(),
  },
  (table) => [
    uniqueIndex("entry_terms_unique").on(table.workspaceId, table.contentType, table.contentId, table.termId),
  ]
);

export const taxonomyRevisions = sqliteTable(
  "taxonomy_revisions",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    taxonomyId: text("taxonomy_id").notNull(),
    op: text("op").notNull(),
    previousStateJson: text("previous_state_json"),
    actorId: text("actor_id").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("idx_taxonomy_revisions_workspace_taxonomy").on(table.workspaceId, table.taxonomyId, table.seq)]
);

/**
 * Change sets (ADR-008, ADR-046 Phase 1) — the durable header row `core/commands/change-set.ts`'s
 * `ChangeSetRepoPort` persists. `idempotency_key` gets a real unique index (not just an
 * application-level check) so `findByIdempotencyKey`'s guarantee holds even under concurrent
 * requests racing the same key.
 */
export const changeSets = sqliteTable(
  "change_sets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id"),
    status: text("status").notNull(),
    summary: text("summary").notNull(),
    idempotencyKey: text("idempotency_key"),
    intentRef: text("intent_ref"),
    createdAt: text("created_at").notNull(),
    appliedAt: text("applied_at"),
    revertedAt: text("reverted_at"),
  },
  (table) => [
    index("idx_change_sets_workspace").on(table.workspaceId, table.createdAt),
    uniqueIndex("idx_change_sets_idempotency").on(table.workspaceId, table.idempotencyKey),
  ]
);

/** One entity mutation inside a change set (ADR-008 §items). `inverse_payload_json` stores
 * `ChangeSetItemRecord.inversePayload` — the only way a non-revisioned entity type can be
 * reverted. */
export const changeSetItems = sqliteTable(
  "change_set_items",
  {
    id: text("id").primaryKey(),
    changeSetId: text("change_set_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(),
    beforeRevisionId: text("before_revision_id"),
    afterRevisionId: text("after_revision_id"),
    inversePayloadJson: text("inverse_payload_json"),
    entityVersionAtApply: integer("entity_version_at_apply"),
    position: integer("position").notNull(),
  },
  (table) => [index("idx_change_set_items_change_set").on(table.changeSetId, table.position)]
);

/**
 * Outbox events (ADR-009, ADR-046 Phase 1, BR-04 resolution). The full `DomainEvent` envelope is
 * stored as one JSON blob (`event_json`) rather than normalized columns — the envelope's shape
 * (`id`/`name`/`occurredAt`/`aggregateId`/`workspaceId`/`actorId`/`changeSetId`/`payload`/
 * `metadata`) is owned by `core/ports.ts`, not this schema; storing it whole means a new optional
 * `DomainEvent` field never needs a migration here. `workspace_id` is denormalized into its own
 * column (duplicating what's inside `event_json`) purely so it can be indexed/filtered without a
 * JSON extract.
 */
export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    eventJson: text("event_json").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull(),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_outbox_events_claim").on(table.status, table.nextAttemptAt)]
);

/**
 * Origin settings (ADR-040, ADR-046 Phase 1). One row per workspace: the verified canonical
 * origin plus its two allowlists (redirect targets, egress targets), each stored as a JSON text
 * array (small, bounded exact-match host lists — not worth a child table). `OriginSettingRepoPort`
 * (`origin/ports.ts`) is READ-ONLY by design (no admin route or write flow exists yet to verify a
 * real production origin) — this table's only writer today is the composition-root dev-capability
 * seed (`infra/sqlite/origin-repo.sqlite.ts`'s `seedDevCapabilityOrigin`), mirroring exactly what
 * the in-memory adapter's constructor-seed did, just durable instead of recreated every restart.
 */
export const originSettings = sqliteTable("origin_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  scheme: text("scheme").notNull(),
  host: text("host").notNull(),
  port: integer("port"),
  basePath: text("base_path"),
  verifiedAt: text("verified_at").notNull(),
  source: text("source").notNull(),
  redirectAllowlistJson: text("redirect_allowlist_json").notNull().default("[]"),
  egressAllowlistJson: text("egress_allowlist_json").notNull().default("[]"),
});

/**
 * Media (ADR-027 §2, ADR-046 Phase 1). The bespoke media row — deliberately not the generic
 * ADR-022 entries model (media predates it and has its own lifecycle, per `media/types.ts`'s file
 * header). `source_sha256` is `MediaSource.sha256`, write-once by application-layer contract
 * (`media-service.ts` enforces the immutability guard — this table has no DB-level constraint for
 * it, matching every other write-once field in this schema).
 */
export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  alt: text("alt").notNull(),
  caption: text("caption").notNull(),
  credit: text("credit").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull(),
});

/** `asset_blobs` sidecar (ADR-027 §2) — one row per unique blob (content-addressed by sha256,
 * deduplicated within a workspace). */
export const assetBlobs = sqliteTable(
  "asset_blobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    createdByPrincipal: text("created_by_principal").notNull(),
    createdAt: text("created_at").notNull(),
    status: text("status").notNull(),
    tombstonedAt: text("tombstoned_at"),
  },
  (table) => [uniqueIndex("idx_asset_blobs_workspace_sha256").on(table.workspaceId, table.sha256)]
);

/** `asset_renditions` sidecar (ADR-027 §4) — the frozen public URL contract's lookup key is
 * `(assetId, transformName, version)` exactly (`slug`/`ext` are cosmetic, never part of any
 * lookup — see `AssetRenditionRepoPort.findOne`'s doc). */
export const assetRenditions = sqliteTable(
  "asset_renditions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    assetId: text("asset_id").notNull(),
    transformName: text("transform_name").notNull(),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_asset_renditions_asset").on(table.workspaceId, table.assetId),
    uniqueIndex("idx_asset_renditions_lookup").on(table.workspaceId, table.assetId, table.transformName, table.version),
  ]
);

/** `transform_registry` sidecar (ADR-027 §4) — append-only: a row, once inserted, is never
 * updated or removed (`TransformDefinitionRepoPort.insert`'s contract; the unique index below is
 * what makes a duplicate `(workspaceId, name, version)` insert fail at the storage layer, not just
 * by application-level convention). */
export const transformDefinitions = sqliteTable(
  "transform_registry",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    paramsJson: text("params_json").notNull(),
    owner: text("owner").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_transform_registry_lookup").on(table.workspaceId, table.name, table.version)]
);

/**
 * `analytics_events` (ADR-046 Phase 1, final slice) — the raw ingest-buffer half of the
 * `analytics` library's `AnalyticsSinkPort` WRITE seam only. This is NOT the Tier-3
 * aggregate/time-series store (`AnalyticsRepoPort`'s `analytics_aggregate`/`analytics_session`
 * tables) — that storage/rollup/dashboard surface remains a separate, later, deliberately
 * deferred concern (see `analytics/INFO.md`'s "Future direction"). `id` is a surrogate
 * autoincrement used purely for newest-first ordering in `list()` — `NormalizedHit` itself has
 * no id field. `utm`/`eventProps` are flattened/JSON-encoded since `NormalizedHit` carries them
 * as nested objects.
 */
/**
 * SPEC-043 (Widgets, ADR-047 Debate Fold-In Amendment 3) — the derived, rebuildable `entry_refs`
 * reference-integrity index (ADR-022 §5). Confirmed absent as running code before this feature
 * (`src/navigation/resolver.ts`'s own comment names the gap) — this is its first real table.
 * `id` is a surrogate autoincrement row key since `EntryRefRow` (the domain shape) carries no id of
 * its own — the whole row set for a given `(workspaceId, sourceEntryId)` is replaced atomically by
 * `EntryRefsRepoPort.replaceForSource`, never patched row-by-row (mirrors `widget_region_bindings`'s
 * "derived, rebuildable, single writer" discipline).
 */
export const entryRefs = sqliteTable(
  "entry_refs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    sourceEntryId: text("source_entry_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    fieldPath: text("field_path").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
  },
  (table) => [
    index("idx_entry_refs_source").on(table.workspaceId, table.sourceEntryId),
    index("idx_entry_refs_target").on(table.workspaceId, table.targetKind, table.targetId),
  ]
);

/**
 * SPEC-043 (Widgets, ADR-047 Debate Fold-In Amendment 1) — the derived, rebuildable
 * `widget_region_bindings` index, mirroring `nav_location_bindings` exactly:
 * `UNIQUE(workspace_id, region_key)` is the DB-level enforcement of INV-02 (a region has at most
 * one bound `widget_area` entry). Reconciled ONLY by `region-area-service.ts`'s
 * `reconcileWidgetRegionBindings` — never hand-authored.
 */
export const widgetRegionBindings = sqliteTable(
  "widget_region_bindings",
  {
    workspaceId: text("workspace_id").notNull(),
    regionKey: text("region_key").notNull(),
    areaEntryId: text("area_entry_id").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("widget_region_bindings_workspace_region_unique").on(table.workspaceId, table.regionKey),
    index("idx_widget_region_bindings_area").on(table.workspaceId, table.areaEntryId),
  ]
);

/**
 * Durable per-phase history of every agent tool-execution ATTEMPT, including the ones that never
 * reach a handler.
 *
 * Distinct from `content_type_revisions` and deliberately not a replacement for it: a revision is
 * the authoritative record of a successful mutation and stays that way. This table records the
 * surrounding execution history — requested / denied / completed / failed — which `@jini-ai/daemon`'s
 * `ToolExecutor` keeps only in an in-process `Map`, and which it does not record at all for an
 * unknown tool or a throwing authorization (it mints its `executionId` and its first audit row only
 * *after* authorization resolves). A denied or misrouted call therefore left no trace of any kind
 * before this table existed.
 *
 * `executionId` is nullable precisely for that case: it holds Jini's id when there is one, and NULL
 * when the attempt failed before Jini minted one. `attemptId` is Tovu's own correlation id and is
 * always present, so every row belongs to an identifiable attempt either way.
 */
export const agentToolAttempts = sqliteTable(
  "agent_tool_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    attemptId: text("attempt_id").notNull(),
    executionId: text("execution_id"),
    workspaceId: text("workspace_id").notNull(),
    runId: text("run_id").notNull(),
    toolId: text("tool_id").notNull(),
    principalId: text("principal_id").notNull(),
    phase: text("phase").notNull(),
    at: text("at").notNull(),
    detail: text("detail"),
  },
  (table) => [
    index("idx_agent_tool_attempts_workspace_list").on(table.workspaceId, table.id),
    index("idx_agent_tool_attempts_attempt").on(table.workspaceId, table.attemptId),
  ]
);

export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    kind: text("kind").notNull(),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    country: text("country"),
    region: text("region"),
    deviceClass: text("device_class").notNull(),
    browserFamily: text("browser_family"),
    osFamily: text("os_family"),
    visitorHash: text("visitor_hash").notNull(),
    sessionId: text("session_id").notNull(),
    eventName: text("event_name"),
    eventPropsJson: text("event_props_json"),
  },
  (table) => [index("idx_analytics_events_workspace_list").on(table.workspaceId, table.id)]
);
