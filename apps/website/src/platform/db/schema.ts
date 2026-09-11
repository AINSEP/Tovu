import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
 *
 * NOT EVERYTHING IN content.db IS DECLARED HERE, and one omission is deliberate rather than a gap:
 * the posts full-text search index (`post_search_document` + the `post_search_fts` FTS5 virtual
 * table + its three sync triggers) lives only in migration
 * `drizzle/0022_posts_fts_search_index.sql`, because drizzle-orm's sqlite-core has no builder for a
 * virtual table or a trigger. That migration was produced with
 * `drizzle-kit generate --custom`, which wrote its own `_journal.json` entry and
 * `0022_snapshot.json` baseline, so `npm run db:generate` still diffs against a consistent snapshot
 * and will neither re-propose earlier migrations nor try to drop objects it cannot see. If those
 * objects ever need to change, hand-write another `--custom` migration; do not attempt to express
 * them here. See `features/post/search-index.sqlite.ts` for how they are maintained at runtime.
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
    /**
     * SPEC-047/ADR-056 Decision 3 — nullable as of this migration (widened from the original
     * `NOT NULL`). An `"html"`-format row (see `bodyFormat` below) has no TipTap document at all,
     * so it carries `NULL` here instead of a dummy empty doc. This is the one non-purely-additive
     * change in this migration: it WIDENS what is allowed (a pre-existing `NOT NULL` is relaxed),
     * never narrows it, so every pre-existing row — which already has a non-null `body_json` —
     * satisfies the loosened constraint unchanged and needs no backfill. See `posts_body_format_shape`
     * below for the constraint that keeps this column's nullability tied to `bodyFormat`.
     */
    bodyJson: text("body_json"),
    status: text("status").notNull(),
    /** Discriminates the `post` vs `page` admin lens over this one table (see `features/post/post.ts`). */
    kind: text("kind").notNull().default("post"),
    /**
     * SPEC-047/ADR-056 Decision 3 — discriminates which of `bodyJson`/`bodyHtml` this row actually
     * carries. Additive: `NOT NULL DEFAULT 'doc'` means every pre-existing row (Post and Page alike)
     * backfills to `"doc"` with zero migration script, matching what every pre-existing row already
     * is in practice (a TipTap document, never bespoke HTML). `"html"` is Pages-vibecoding's new
     * v1 shape (SPEC-047) — a Post can never carry `"html"` (enforced at the write chokepoint in
     * `features/post/post.ts`, not just here); `"doc"` stays valid for a future non-generated Page
     * (v1 never creates one, but the column keeps that door open with no future migration). See
     * `posts_body_format_shape` below for the DB-level enforcement of "exactly one body populated".
     */
    bodyFormat: text("body_format").notNull().default("doc"),
    /**
     * SPEC-047/ADR-056 Decision 3 — the bespoke HTML body for an `"html"`-format Page (Pages
     * vibecoding, `PagesHtmlDocumentStore`). Nullable, additive: every pre-existing row is `"doc"`
     * format and has no reason to carry one, so this backfills to `NULL` with zero migration script.
     */
    bodyHtml: text("body_html"),
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
    /**
     * Soft-delete (trash) marker — see `features/post/post.ts`'s `PostRecord.deletedAt` for the
     * full rationale. Nullable, additive, no backfill: every pre-existing row reads back as `null`
     * ("live") with zero migration work, mirroring `seo_ext_json`'s identical precedent.
     *
     * NOT part of `posts_workspace_slug_unique` below, deliberately: a trashed row keeps holding
     * its slug, which is what makes `createPost`'s uniqueness check agree with this index instead
     * of passing and then dying on a constraint violation.
     */
    deletedAt: text("deleted_at"),
    /**
     * Post-template-picker feature (2026-08-10) — the `pages/*.html` filename (from the active
     * static theme's `theme.json` `postTemplate` array, e.g. `"blog-post.html"`) this post renders
     * through, or `NULL` when no template has been chosen. Nullable, additive, no backfill: every
     * pre-existing row reads back as `null` ("no template chosen" — `pages.ts`'s post-template
     * render path treats this as a diagnostic state, not a silent fallback to generic rendering; see
     * that file's own doc), mirroring `seo_ext_json`/`deleted_at`'s identical precedent above.
     */
    templateChoice: text("template_choice"),
    /**
     * Slug-collision override (2026-08-10, tri-state 2026-08-15) — when a real post's slug matches
     * one of the active static theme's own page filenames (e.g. a post at slug "about" colliding
     * with `pages/about.html`), one of the two resources must win. `NULL`/absent means *never
     * decided* — the caller applies WHATEVER the current policy default is (as of 2026-08-15, the
     * post wins; see `pages.ts`'s resolver). `true`/`false` are an author's explicit, permanent
     * choice, made after the admin UI warns them about the collision, and always win over the
     * default regardless of what it is set to.
     *
     * Nullable, deliberately NOT `NOT NULL DEFAULT ...`, because the whole point of this shape is
     * that the default lives in the RESOLVER, not in storage: flipping which side wins by default is
     * then a one-line change to `pages.ts` forever after, never another migration. A `NOT NULL
     * DEFAULT` column can only ever encode the default that was true the day it was written — every
     * row action's storage default. (2026-08-15) widened this column from `NOT NULL DEFAULT false`
     * to nullable — see `drizzle/0039_*.sql` — deliberately WITHOUT reinterpreting any existing
     * `false` row: a stored `false` from before this change is indistinguishable in the database
     * alone between "never decided" (this feature's checkbox only ever rendered on an actual
     * collision, so most `false` rows are really "never saw the checkbox") and "explicitly kept the
     * theme page". A separate, explicitly reversible backfill pass reclassifies the former using live
     * theme data no migration can see; this migration touches zero existing values.
     */
    overridesThemePage: integer("overrides_theme_page", { mode: "boolean" }),
    /**
     * Member-gating (2026-09-02 dispatch, ADR-030 §4) — the raw JSON-serialized
     * `MemberContentAccess` (`{visibility: "public"|"members"|"paid"|"tiers", tierIds?}`), or
     * `NULL` when nobody has ever gated this entry. Nullable, additive, no backfill: every
     * pre-existing row reads back as `NULL`, which `features/members/access-resolver.ts`'s
     * `resolvePostMemberAccess` decodes as `{visibility: "public"}` — the exact behavior every row
     * already has today — mirroring `seoExtJson`/`templateChoice`/`overridesThemePage`'s identical
     * nullable-no-backfill precedent above. Deliberately NOT the pre-existing `ext` column: `ext` is
     * the plugin extension-field bag, written ONLY by the `content.entry.beforeSave` hook-merge step
     * (CIC U-004) — `members` is a core Tier-2 feature, not a plugin, so it cannot write there any
     * more than `seo` could (which is why SEO got its own `seoExtJson` column instead of reusing
     * `ext`, the same precedent this column follows). Kept as an opaque string here (not parsed) so
     * `post`/its repo adapters stay ignorant of `members`' value shape, the same "owning feature
     * parses its own ext column" contract `seoExtJson` already establishes (see `post.ts`'s own doc
     * on that field). No admin-facing writer exists yet (2026-09-02) — see `access-resolver.ts`'s
     * module doc for what that follow-up needs.
     */
    memberAccessJson: text("member_access_json"),
    /**
     * Standing-draft autosave (2026-09-06 dispatch) — a raw JSON-serialized `PostAutosaveSnapshot`
     * (`{bodyFormat, bodyJson?, bodyHtml?, slug, baseVersion, savedAt, savedByPrincipalId}`), or
     * `NULL` when no unsaved edit is currently parked for this row. Nullable, additive, no backfill:
     * every pre-existing row reads back as `NULL` ("nothing to recover"), mirroring
     * `seoExtJson`/`templateChoice`/`memberAccessJson`'s identical nullable-no-backfill precedent
     * above. Written ONLY by `features/post-autosave/`'s own targeted
     * `UPDATE posts SET autosave_json = ? WHERE id = ? AND workspace_id = ?` — deliberately NEVER
     * through `createPost`/`updatePost`'s `repo.save()` chokepoint, so an autosave tick never bumps
     * `version`/`updatedAt`, never fires the `content.entry.beforeSave` hook, and never re-indexes
     * search. Deliberately NOT the pre-existing `ext` column: `ext` is the plugin extension-field
     * bag, written ONLY by that same hook-merge step (CIC U-004) — autosave is core product
     * behavior, not a plugin, so it cannot write there any more than `seo`/`members` could (the same
     * reasoning that gave each of those its own column). Deliberately NOT `bodyJson`/`bodyHtml`
     * either: a standing draft for a `published` post must never become the row's live, publicly
     * served content, so it lives in a column neither the public read path nor
     * `posts_body_format_shape` below has any reason to ever look at.
     */
    autosaveJson: text("autosave_json"),
  },
  (table) => [
    uniqueIndex("posts_workspace_slug_unique").on(table.workspaceId, table.slug),
    index("idx_posts_workspace").on(table.workspaceId),
    /**
     * SPEC-047/ADR-056 Decision 3 — "exactly one body column populated per format", expressed with
     * Drizzle's own `check()` table-constraint builder (`drizzle-orm/sqlite-core`, confirmed present
     * in the pinned `drizzle-orm@0.44.7`) rather than hand-written SQL. Unlike the FTS5 virtual table
     * in `drizzle/0022_posts_fts_search_index.sql` — which genuinely has no Drizzle builder at any
     * version — a CHECK on an ordinary table is exactly what this builder exists for, so
     * `drizzle-kit generate` emits it automatically and this file stays the single source of truth
     * for the constraint (see this file's own header for why 0022 is hand-written and this is not).
     */
    check(
      "posts_body_format_shape",
      sql`(${table.bodyFormat} = 'doc' AND ${table.bodyJson} IS NOT NULL AND ${table.bodyHtml} IS NULL) OR (${table.bodyFormat} = 'html' AND ${table.bodyHtml} IS NOT NULL AND ${table.bodyJson} IS NULL)`
    ),
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
    quarantinedAt: text("quarantined_at"),
    quarantineReason: text("quarantine_reason"),
    quarantineFailureCount: integer("quarantine_failure_count"),
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
  (table) => [
    uniqueIndex("member_tiers_workspace_slug_unique").on(table.workspaceId, table.slug),
    /**
     * Commerce (2026-08-12 debate, section 5) — the target half of `commerceProducts`'
     * `grantsMemberTierId` composite FK below. SQLite (and Postgres) require a composite FK's
     * target columns to be a PK or carry a UNIQUE index; `id` alone is already unique (it's the
     * PK) but the pair `(workspace_id, id)` is not, so a same-`id` row can otherwise only be
     * looked up, never enforced as "and it belongs to this workspace" at the DB level. Additive:
     * a new unique index over an already-unique column plus workspace_id can never reject a row
     * that the existing PK already accepted.
     */
    uniqueIndex("member_tiers_workspace_id_unique").on(table.workspaceId, table.id),
  ]
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
 * SPEC-006 REQ-08 (state.spec §1/§2 `ApiKey`) — principal-bound headless credentials, the tenth
 * identity table and the only one whose rows carry a secret.
 *
 * `key_hash` holds a scrypt digest of the key's secret half only; the raw key is returned once by
 * `APIKEY_ISSUE` and never persisted, logged, or re-derivable (INV-05, same rule `identity_users.
 * password_hash` already follows). `prefix` is the deliberately NON-secret half of the same key —
 * it exists so verification is one indexed row lookup plus one hash comparison rather than a scan
 * that hashes every row in the table, which is what makes a real (deliberately slow) KDF
 * affordable on a per-request credential. It is unique per workspace for that reason.
 *
 * `issued_policy_id` points at the `is_frozen` permission snapshot minted for this key at issuance
 * (F-054-01): `REVOKE_API_KEY` retires that policy along with the key, so a revoked key leaves no
 * orphan grant rows behind. Nullable only because the column has to tolerate a row written before
 * its snapshot policy exists; every row this runtime writes sets it.
 */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    principalId: text("principal_id").notNull(),
    label: text("label").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    issuedPolicyId: text("issued_policy_id"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("idx_api_keys_workspace_prefix").on(table.workspaceId, table.prefix),
    index("idx_api_keys_workspace_principal").on(table.workspaceId, table.principalId),
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
// `db/sqlite/storage-journal-repo.ts` already established for `siteId`).
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
 * Gated-mutation confirmation tokens (SPEC-022 durability fix). The plan->confirm->execute
 * ceremony's single-use, time-boxed credential (`contracts/core/gated-mutations/token.ts`'s
 * `ConfirmationTokenRecord`) — previously `InMemoryTokenStore`-only, which made the
 * `gated-mutations` capability-inventory entry `hasDurableAdapter: false` and unconditionally
 * failed the production-readiness gate's `PRODUCTION_CAPABILITY_NOT_DURABLE` check regardless of
 * env vars. No `workspace_id` column: `confirmerPrincipalId`/`scopeId` already identify who/what a
 * token is bound to, matching `ConfirmationTokenRecord`'s own shape exactly (one column per field,
 * no denormalization).
 */
export const gatedMutationTokens = sqliteTable("gated_mutation_tokens", {
  confirmationToken: text("confirmation_token").primaryKey(),
  planHash: text("plan_hash").notNull(),
  scopeId: text("scope_id").notNull(),
  confirmerPrincipalId: text("confirmer_principal_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

/**
 * Origin settings (ADR-040, ADR-046 Phase 1). One row per workspace: the verified canonical
 * origin plus its two allowlists (redirect targets, egress targets), each stored as a JSON text
 * array (small, bounded exact-match host lists — not worth a child table). `OriginSettingRepoPort`
 * (`origin/ports.ts`) is READ-ONLY by design (no admin route or write flow exists yet to verify a
 * real production origin) — this table's only writer today is the composition-root dev-capability
 * seed (`db/sqlite/origin-repo.sqlite.ts`'s `seedDevCapabilityOrigin`), mirroring exactly what
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
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    /**
     * Human-memorable lookup key (owner-directed, 2026-09-07) — ADDITIONAL to `id`, never a
     * replacement: every existing embed/reference resolves by `id` first and foremost, and `slug`
     * only gives operators a second, typeable way to reach the same row (`findMediaByIdOrSlug`
     * tries slug first, `id` second — same order `posts_workspace_slug_unique`'s own `post.ts`
     * lookup already establishes for the identical id-vs-slug duality).
     *
     * Nullable, additive, NO on-write backfill here: every pre-existing row reads back as `NULL`
     * until `development/scripts/backfill-media-slugs.ts` is run once (see that script's own
     * header) — mirroring `asset_blobs.content_type`'s identical "nullable cache column, backfilled
     * out of band" precedent in this same table family, not `posts.slug`'s (which never needed a
     * backfill because every post has always had one from creation). The uniqueness index below is
     * safe to add in the SAME migration as this column specifically because SQL treats every NULL
     * as distinct from every other NULL for uniqueness purposes — a table full of NULL slugs cannot
     * violate this constraint, so the constraint and the column land together and the backfill runs
     * as a separate, explicit, re-runnable step afterward.
     */
    slug: text("slug"),
    alt: text("alt").notNull(),
    caption: text("caption").notNull(),
    credit: text("credit").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
    /** Quick-and-dirty public-render sizing fields (owner-directed skip-the-ADR fix, 2026-08-05):
     * an operator-set width/height/CSS class for THIS asset, threaded through to the public `<img>`
     * tag by `render.ts`'s `image` node case so an inserted image no longer renders at full native
     * pixel width with nothing constraining it. All three are nullable — `null` means "no override
     * set", which the renderer treats as "omit the attribute entirely", not "render 0×0". */
    width: integer("width"),
    height: integer("height"),
    cssClass: text("css_class"),
    /**
     * Owner-directed (2026-09-07) free-text HTML attributes threaded onto this asset's public
     * `<img>`/`<video>` tag (stated uses: animations, custom WebMCP hooks) — same nullable,
     * no-backfill-needed shape `cssClass` above already establishes (every pre-existing row reads
     * back as `NULL`, "no extra attributes", with zero migration work). This is a stored-XSS
     * boundary: `@jini-ai/cms/media`'s `updateMediaMetadata` validates it against
     * `html-attributes.ts`'s allowlist before ever writing it, and the render path re-validates
     * before emitting it onto a real tag — see that column's own `MediaRecord.htmlAttributes` doc
     * for the full rationale. This column stores the raw, ALREADY-VALIDATED source text verbatim.
     */
    htmlAttributes: text("html_attributes"),
  },
  (table) => [uniqueIndex("idx_media_workspace_slug").on(table.workspaceId, table.slug)]
);

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
    /**
     * The blob's real media type, as `sniffContentType(bytes)` (`@jini-ai/cms/media`'s
     * `content-type-sniffer.ts`) reports it — NEVER the client's upload-time `contentType` string.
     * `uploadMedia` validates that string against an advisory allowlist and then discards it, and
     * `routes/admin/media/original.ts` already refuses to trust it when setting a response's
     * `Content-Type`; storing the declared string here would let the admin's "Images"/"Videos"
     * filter disagree with the bytes the browser is actually served.
     *
     * Lives on THIS table, not on `media`: the type is a property of the BYTES, and this is the
     * sha256-keyed table, so blob dedup makes two library entries sharing one blob share one
     * recorded type for free.
     *
     * Nullable, and `null` means exactly "not sniffed yet", never "unknown format" — an
     * unrecognized blob records the sniffer's own `application/octet-stream`, which is a real
     * answer. The column is a CACHE of a pure function of bytes we already store, so a `null`
     * (a row written before this column existed) is always recoverable by re-sniffing rather than
     * lost data — `routes/admin/media/list.ts` backfills them on read.
     *
     * WRITE PATH WARNING: `db/sqlite/media-repo.sqlite.ts`'s `SqliteAssetBlobRepo.save()` builds an
     * explicit `values` object and `.set()`s all of it on update. This column is deliberately
     * EXCLUDED from that update object — `AssetBlobRecord` (the frozen upstream port type) has no
     * field for it, so including it would write `null` back on every blob resurrect. See that
     * method's own comment.
     */
    contentType: text("content_type"),
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

/**
 * The SITE's provider credential for the public visitor assistant (ADR-058) — one row per
 * workspace, single-row-per-workspace shape matching `originSettings`/`presentationSettings` above
 * (`workspace_id` as the primary key, no surrogate id, upsert semantics).
 *
 * Deliberately NOT a `core.execution.*` settings-ledger row: ADR-028 §6 blocks `secret:true`
 * registration outright, and a non-secret registration would put a live provider key in the
 * append-only, exportable `setting_revisions` history with no redaction path. This table holds only
 * ciphertext — the `sealed*` columns are `AesGcmSecretSealer`'s output (`SecretSealerPort`,
 * `src/webhooks/ports.ts`), never plaintext, and the write-only API (`site-credential.ts` routes)
 * never reads them back out to a client. `masked` is the one exception: computed once from the
 * plaintext at write time and stored as its own plain column, so a GET can answer "is a key set, and
 * what does it end in" as a pure DB read with zero decrypt/crypto involvement (ADR-058 §3).
 *
 * The CHECK makes "half a sealed secret" unrepresentable — all five `sealed*`/`masked` columns are
 * NULL together (no key stored) or non-NULL together (a key is stored), the same totality discipline
 * ADR-028 applies to its own value shapes.
 */
export const siteAssistantCredentials = sqliteTable(
  "site_assistant_credentials",
  {
    workspaceId: text("workspace_id").primaryKey(),
    provider: text("provider").notNull().default("google"),
    baseUrl: text("base_url"),
    model: text("model"),
    /** `SealedSecret.keyId` — names the root-key generation the value was wrapped under. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded so a future algorithm change is
     *  data, not a silent reinterpretation of old rows. */
    sealedAlg: text("sealed_alg"),
    /** `••••<last 4 chars>` — precomputed at write time, matching `@jini-ai/ui`'s existing
     *  `maskedKeyLabel` convention (`features/media-providers/rules.js`). */
    masked: text("masked"),
    /**
     * Migration `0055` (2026-09-02, AAD-gap closure). `0` = `sealed_ciphertext` was sealed with NO
     * additional authenticated data (every row written before this migration) and MUST be opened
     * with no `aad` either, or auth-tag verification fails; `1` = sealed under
     * `site-credential-aad.ts`'s `buildSiteAssistantCredentialAad`, and open MUST supply the
     * byte-identical string. Meaningless when `sealed_ciphertext` is `NULL` (no key stored) —
     * defaults to `0` there and nothing ever reads it in that state.
     *
     * Exists because AAD is authenticated but never stored (`secret-sealer.aesgcm.ts`'s own header):
     * a legacy row's ciphertext auth tag only verifies under NO aad, so open() cannot simply start
     * passing one — it must know, per row, which lineage that row's ciphertext belongs to. New
     * writes always seal with `aad` and set this to `1`; `development/scripts/backfill-site-
     * assistant-credential-aad.ts` flips existing `0` rows to `1` by opening under no aad and
     * re-sealing the same plaintext under the derived aad — see that script's own header.
     */
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "site_assistant_credentials_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL AND ${table.masked} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL AND ${table.masked} IS NOT NULL)`
    ),
  ]
);

/**
 * The ADMIN's own BYOK credential (design: `ADS-memory/reports/analysis/2026-08-05-admin-byok-
 * keystore-design.md`, owner-approved) — one row per `(workspace_id, principal_id)`, powering the
 * admin assistant dock's "API · BYOK" execution mode (ADR-049, `server/modules/assistant-byok.ts`).
 * NOT `siteAssistantCredentials` above — that one is per-WORKSPACE and backs the PUBLIC visitor
 * assistant; this one is per-admin and backs that admin's own dock. Different scope, different
 * consumer, on purpose — see that table's own header for why the two must never merge.
 *
 * Scoped to `(workspace_id, principal_id)` rather than `workspace_id` alone because the credential
 * it replaces (`apps/admin/src/lib/execution-settings.ts`'s browser-`localStorage` key) is
 * per-BROWSER today: two admins on the same install already carry independent keys, and collapsing
 * to one shared workspace key would let one admin's save silently overwrite another's. The
 * `(workspaceId, principalId)` composite-key shape mirrors `settingValuesUser` above — the existing
 * precedent for "belongs to one admin, in one workspace" data — minus a `settingId` column, since
 * (like `siteAssistantCredentials`) this is a single-row-per-scope shape, not a per-key ledger.
 *
 * Unlike `settingValuesUser`'s `principal_id` (whose comment says identity has no SQL table to
 * reference), `principals` below IS a real SQL table with a real adapter today — that comment
 * predates it — so `principal_id` here carries a genuine FK.
 *
 * Sealed via the SAME `AesGcmSecretSealer`/`KeyringPort` instances ADR-058 wires (reused, not
 * re-derived — `SecretSealerPort` is a generic seal/open primitive; it does not need a second
 * domain-separation boundary per table). Sealed-shape CHECK copied verbatim from
 * `site_assistant_credentials_sealed_shape`.
 */
export const adminExecutionCredentials = sqliteTable(
  "admin_execution_credentials",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    principalId: text("principal_id")
      .notNull()
      .references(() => principals.id, { onDelete: "cascade" }),
    /** "anthropic" | "openai" | "azure" | "google" — matches `ResolvedByokCredential.protocol`. */
    protocol: text("protocol").notNull().default("anthropic"),
    /** Preset id (e.g. `"anthropic"`); NULL = a custom endpoint. Mirrors `ByokConfig.providerId`. */
    providerId: text("provider_id"),
    baseUrl: text("base_url"),
    model: text("model"),
    maxTokens: integer("max_tokens"),
    /** `SealedSecret.keyId`; NULL iff no key stored. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today. */
    sealedAlg: text("sealed_alg"),
    /** `••••<last 4 chars>`, precomputed at write time — same convention as ADR-058 §3. */
    masked: text("masked"),
    /** Migration `0055` (2026-09-02, AAD-gap closure) — same `0`=legacy-no-aad /
     *  `1`=`buildExecutionCredentialAad`-bound contract as `site_assistant_credentials.aad_version`
     *  above; see that column's own doc for the full reasoning this one shares verbatim. Backfilled
     *  by `development/scripts/backfill-execution-credential-aad.ts`. */
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.principalId] }),
    check(
      "admin_execution_credentials_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL AND ${table.masked} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL AND ${table.masked} IS NOT NULL)`
    ),
  ]
);

/**
 * Named, workspace-scoped provider connections for static-site publishing (GitHub Pages / Vercel /
 * Netlify / Cloudflare Pages) — what the admin's Static Site tab "Advanced: publish with server-side
 * provider credentials" form persists (`features/deployments/publish-credentials/`). Design:
 * `ADS-memory/reports/external-audit/runs/2026-08-15-terra-xhigh-publish-credentials-design.md`.
 *
 * Composite PK `(workspace_id, id)`, NOT `workspace_id` alone like `siteAssistantCredentials`/
 * `adminExecutionCredentials` above — those are single-row-per-scope settings rows; this table is a
 * per-scope LEDGER, because a workspace can hold more than one named connection to the SAME provider
 * (e.g. two GitHub tokens for two different repos). `id` is a caller-supplied UUID, not an
 * autoincrement surrogate, matching every other UUID-keyed content row in this schema (`posts.id`
 * etc.) rather than `agentToolAttempts`' autoincrement (that table has no natural key to reuse; this
 * one does — `(workspace_id, provider_id, label)` is the human-meaningful identity, `id` exists only
 * so PUT/DELETE has a stable target across a label rename). UNIQUE `(workspace_id, provider_id,
 * label)` enforces the human-meaningful identity is actually unique per workspace.
 *
 * Sealed via the SAME shared `AesGcmSecretSealer`/`KeyringPort` instances the two tables above reuse
 * (one sealing capability app-wide — see `secret-sealer.aesgcm.ts`'s own header) — but UNLIKE those
 * two tables, every `sealed*` column here is `NOT NULL`, not nullable-together-via-CHECK. Those two
 * precedent tables model a single settings row that can exist BEFORE any key is ever saved (rendering
 * `isSet: false`); a row in THIS table cannot exist before a connection is saved — `POST .../publish/
 * credentials` requires a `connection` in its very own request body (see
 * `publish-credentials/store.ts`'s `createPublishCredential`), so "a row with no sealed payload" is
 * not a state this table's writers can ever produce, and giving it a nullable CHECK it can never
 * legitimately satisfy in the NULL branch would just be dead schema surface.
 *
 * Every `sealed*` payload is sealed with an `aad` (`SecretSealerPort`'s new optional parameter, this
 * same 2026-08-15 change) bound to `workspaceId + providerId + id` — see
 * `publish-credentials/aad.ts`'s `buildPublishCredentialAad` for the one place that string format is
 * defined. This is what makes a row's ciphertext non-transplantable to a different workspace, a
 * different provider, or a different credential set even though the underlying AES key is shared
 * app-wide (Terra's 2026-08-15 finding: at the time, the two tables above sealed with no AAD at all
 * and did not have this property, and retrofitting them was out of scope for this table's own
 * dispatch — that retrofit is `site_assistant_credentials.aad_version`/
 * `admin_execution_credentials.aad_version` above, closed 2026-09-02).
 *
 * Deliberately NO `masked` column — a divergence from BOTH tables above, made on Terra's explicit
 * recommendation: label + `updatedAt` already identify a connection well enough for a human to
 * recognize it, and not even storing a last-4 keeps zero token-derived material outside the sealed
 * blob (`site_assistant_credentials`/`admin_execution_credentials`'s `masked` column, by contrast,
 * stores plaintext-derived characters unencrypted specifically so a GET can answer "what does it end
 * in" with no decrypt — a tradeoff this design consciously declines to repeat for a deployment
 * secret with WRITE access to a real external account).
 *
 * The sealed payload itself is the WHOLE `PublishConnectionInput` connection object serialized as one
 * JSON blob (token AND its provider-specific companion fields — `owner`/`repo` for github-pages,
 * `teamId` for vercel, `siteId` for netlify, `accountId`/`projectName` for cloudflare-pages), not a
 * bare token — see `publish-credentials/types.ts`'s own header for why a single `sealed_ciphertext`
 * column per row is correct here and no per-field encrypted columns are needed.
 */
export const publishCredentialSets = sqliteTable(
  "publish_credential_sets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** `"github-pages" | "vercel" | "netlify" | "cloudflare-pages"` — see
     *  `publish-credentials/types.ts`'s `PublishProviderId`. */
    providerId: text("provider_id").notNull(),
    /** Human-chosen label, unique per `(workspace_id, provider_id)` — the identity a human picks a
     *  connection by, since this table (unlike the two above) holds more than one row per provider. */
    label: text("label").notNull(),
    /** `SealedSecret.keyId`. */
    sealedKeyId: text("sealed_key_id").notNull(),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag` of the whole serialized connection object. */
    sealedCiphertext: text("sealed_ciphertext").notNull(),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce").notNull(),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded for the same future-algorithm
     *  reason the two precedent tables above give. */
    sealedAlg: text("sealed_alg").notNull(),
    /**
     * Migration `0041` addition (2026-08-15, Contract v2 Correction B) — replaces the original
     * design's "reject a publish when 2+ credentials exist for one provider, ambiguous" rule, which
     * broke the whole point of named connections the first time a workspace saved a second one.
     * `resolveForPublish`'s provider-scoped resolution now reads the row with `is_default = 1`
     * instead. The write path (`publish-credentials/store.ts`) maintains the invariant "at most one
     * `TRUE` per `(workspace_id, provider_id)`" — a provider's first-ever saved connection becomes
     * default automatically, setting a new default clears the old one in the same transaction, and
     * deleting the default promotes the group's most-recently-updated remaining row. No DB-level
     * CHECK/partial-unique-index enforces this (SQLite partial indexes can't express "at most one
     * TRUE per group" without excluding legitimate `0` rows too) — the write path is the sole
     * chokepoint, same trust model this table's `sealed*` columns already rely on for the AAD
     * binding above. */
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    /**
     * The verified credential's own public account login/username (GitHub's `login`, Vercel's
     * `username`) — same "held in the clear because a decrypt-on-read would put an AEAD open on a
     * cheap path" reasoning `composioConnectorCredentials.accountLabel` documents for its own column
     * (see that table's own doc comment above): this value already appears, unencrypted, in a PUBLIC
     * URL a real publish prints (`https://<login>.github.io/<repo>/`), so sealing it here would
     * protect nothing while forcing `deployment_get_static_publish_capabilities` to decrypt (or stay
     * blind) just to answer "whose account is this."
     *
     * `NULL` until the first successful identity check — `publish-credentials/store.ts`'s create/
     * update paths never populate this themselves (see that file's own header for why: this table's
     * write path is shared with an agent-facing caller for the s3-compatible provider, and a network
     * probe does not belong on that path); it is written ONLY by a human-gated verify
     * (`static-publish/verify.ts`'s `verifyPublishCredentialById`, via the admin route's
     * `healAccountLabel` call — 2026-08-16, the fix for "verification lived in
     * `InMemoryPublishCredentialVerificationCache` only, so a routine server restart silently reverted
     * a working, previously-verified credential back to no known account"). Reset to `NULL` whenever
     * `updatePublishCredential` reseals a NEW connection (`store.ts`'s own reasoning: a label naming
     * the OLD token's account is worse than no label once the token itself has changed) — never simply
     * carried over, and never left stale by a failed re-verify (`verify.ts`'s `"invalid"`/
     * `"unreachable"` results carry no `accountLabel` at all, so a failed check cannot overwrite a
     * previously-healed value with nothing).
     */
    accountLabel: text("account_label"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("publish_credential_sets_workspace_provider_label_unique").on(table.workspaceId, table.providerId, table.label),
  ]
);

/**
 * Append-only publish-history ledger (2026-08-16, owner-requested rework of the original
 * flat-JSON-file design — see `static-publish/publish-history.ts`'s own header for the full
 * before/after story). One row per publish that actually produced an outcome (`ok: true` or
 * `ok: "partial"` — never `ok: false`, see that same header), never updated or deleted after
 * insert — unlike `publishCredentialSets` above, "the last publish" is a query over this table
 * (`ORDER BY id DESC LIMIT 1`, scoped by `workspace_id` + `target`), not a row this table
 * overwrites, so a future deploy-history UI has real rows to list rather than only ever seeing
 * the single most recent one. `id` is a plain surrogate autoincrement key (mirrors
 * `redirectRevisions`' own `id` — no natural per-target sequence is needed here the way
 * `redirectRevisions.seq` needs one per `redirect_id`, since nothing else in this feature ever
 * references a specific publish-history row by number).
 *
 * `owner`/`repo`/`branch`/`commit_sha` are populated for `github-pages` only — every other target
 * leaves them NULL, the same per-target-optional shape `publishCredentialSets`' sibling
 * `StaticPublishConfig` already uses for `owner`/`repo`. `commit_sha` specifically: NOT a
 * caller-supplied value — `static-publish/publish-run.ts`'s `toHistoryEntry` reads it off
 * `StaticPublishOutcome.deploymentId`, which is genuinely a commit SHA ONLY for `github-pages`
 * (verified directly against `@jini-ai/devops`'s `github-pages.ts`: `deploymentId: commitSha` on
 * its `publish()` return — the ONLY target whose `deploymentId` means "a git commit"; Vercel's is a
 * Vercel deployment id, Netlify's a deploy id, Cloudflare Pages' a deployment id, and s3-compatible
 * has no `deploymentId` at all). Never populated for any other target, so this column is honestly
 * NULL rather than a field that quietly always reads null everywhere.
 *
 * `triggered_by` records WHICH of this feature's two entry points produced the row —
 * `'admin_ui'` (the admin route's `startPublishRun`) or `'agent_tool'` (the assistant's
 * `runPublishAndAwait`) — see `publish-run.ts`'s own header for why this is free to derive (each
 * function hardcodes its own literal; no caller has to supply it).
 */
export const publishHistory = sqliteTable(
  "publish_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** `StaticPublishTargetId` — `"github-pages" | "vercel" | "netlify" | "cloudflare-pages" |
     *  "s3-compatible"`. */
    target: text("target").notNull(),
    url: text("url").notNull(),
    /** `false` only for the s3-compatible "uploaded, not yet confirmed reachable" partial outcome
     *  — see this table's own doc and `PublishHistoryEntry`'s doc in `publish-history.ts` for why a
     *  fully failed (`ok: false`) publish is never a row here at all, so this is never "the publish
     *  failed". */
    reachable: integer("reachable", { mode: "boolean" }).notNull(),
    status: text("status").notNull(),
    projectName: text("project_name").notNull(),
    publishedAt: text("published_at").notNull(),
    owner: text("owner"),
    repo: text("repo"),
    basePath: text("base_path"),
    /** The provider's own opaque identifier for this publish (a Vercel/Netlify/Cloudflare deploy
     *  id, or — for github-pages — the commit sha, same value as `commit_sha` below for that one
     *  target). `StaticPublishOutcome.deploymentId`, verbatim. */
    deploymentId: text("deployment_id"),
    /** github-pages only — see this table's own doc for why this is a genuine, verified value and
     *  not a column that is always null. */
    commitSha: text("commit_sha"),
    /** github-pages only — the branch actually published to, defaulted to `'gh-pages'` the same
     *  way `GitHubPagesDeployTarget` itself defaults an omitted `config.branch` (`types.ts`'s
     *  `GitHubPagesPublishConfig` doc). */
    branch: text("branch"),
    /** `'admin_ui' | 'agent_tool'` — see this table's own doc. */
    triggeredBy: text("triggered_by").notNull(),
  },
  (table) => [
    index("idx_publish_history_workspace_id").on(table.workspaceId, table.id),
    index("idx_publish_history_workspace_target_id").on(table.workspaceId, table.target, table.id),
  ]
);

/**
 * Per-workspace saved connections for the admin Source Control page (2026-08-15) — "I have a
 * GitHub/GitLab/Bitbucket personal access token" as its own concept, deliberately NOT a row in
 * `publishCredentialSets` above even though the column shape is identical. `PublishProviderId` is
 * aliased onto `AdminStaticPublishTargetId` on purpose (see that type's own header) so the provider
 * set a credential can be saved for and the provider set a publish can target can never drift apart;
 * widening it with `"github"`/`"gitlab"`/`"bitbucket"` would corrupt that guarantee by making one
 * value simultaneously mean "a saved source-control identity" and "a legal `triggerPublish` target",
 * neither of which GitLab or Bitbucket (not deploy targets) or a *source* GitHub account (a
 * different credential than `github-pages`) actually is. A second table with the same shape is the
 * correct fix, not a wider union on the first one.
 *
 * Every column below is a structural copy of `publishCredentialSets`' own (see that table's own doc
 * comment for the full reasoning this one inherits verbatim): the same composite
 * `(workspace_id, id)` primary key, the same `(workspace_id, provider_id, label)` UNIQUE identity,
 * the same four `sealed*` columns (all `NOT NULL` — a row cannot exist before a connection is saved,
 * same reasoning), the same deliberate absence of a `masked` column, and the same write-path-owned
 * `is_default` group invariant (at most one `TRUE` per `(workspace_id, provider_id)`, no DB-level
 * CHECK). Sealed via the SAME shared `AesGcmSecretSealer`/`KeyringPort` instances every other sealed
 * table in this file reuses, under an AAD bound to `workspaceId + providerId + id`
 * (`features/source-control/aad.ts`'s `buildSourceControlCredentialAad`) so a row's ciphertext is
 * not transplantable to a different workspace, provider, or credential set.
 *
 * The sealed payload is the whole `SourceControlConnectionInput` object (token, plus Bitbucket's
 * paired `username` — Bitbucket's own API authenticates the pair, not the token alone), not a bare
 * token — same one-ciphertext-per-row reasoning `publishCredentialSets` gives for its own multi-field
 * providers.
 */
export const sourceControlCredentialSets = sqliteTable(
  "source_control_credential_sets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** `"github" | "gitlab" | "bitbucket"` — see `features/source-control/types.ts`'s
     *  `SourceControlProviderId`. */
    providerId: text("provider_id").notNull(),
    /** Human-chosen label, unique per `(workspace_id, provider_id)` — always
     *  `SOURCE_CONTROL_CREDENTIAL_ROW_LABEL` (`"default"`) today, since the admin page's flat
     *  one-row-per-provider UI never asks an operator to type one, but the column stays free-text
     *  (not an enum) for the same future-multi-connection-per-provider reason `publishCredentialSets`
     *  keeps its own `label` free-text. */
    label: text("label").notNull(),
    /** `SealedSecret.keyId`. */
    sealedKeyId: text("sealed_key_id").notNull(),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag` of the whole serialized connection object. */
    sealedCiphertext: text("sealed_ciphertext").notNull(),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce").notNull(),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded for the same future-algorithm
     *  reason `publishCredentialSets` gives. */
    sealedAlg: text("sealed_alg").notNull(),
    /** At most one `TRUE` per `(workspace_id, provider_id)`, maintained by
     *  `features/source-control/store.ts`'s write path — same invariant, same "no DB-level CHECK"
     *  reasoning `publishCredentialSets.isDefault` documents. */
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    /**
     * The verified account's public login (GitHub's `login` only, today) — same "held in the clear,
     * not sealed" reasoning `composioConnectorCredentials.accountLabel` and this table's own sibling
     * `publishCredentialSets.accountLabel` both document (see either doc comment for the full case).
     *
     * `NULL` until populated. Unlike `publishCredentialSets`, this table has no shared agent-facing
     * write path to protect (nothing under `features/source-control/`'s own tool catalog ever calls
     * `createSourceControlCredential`/`updateSourceControlCredential` — see `store.ts`'s own header)
     * and no existing verify concept to piggyback on, so `store.ts`'s create/update paths populate this
     * column directly, inline, at save time — a best-effort identity probe against the SAME plaintext
     * token they are about to seal, reusing `static-publish/verify.ts`'s reviewed, single-field GitHub
     * `/user` -> `login` extractor (`extractGitHubLogin`) rather than a second, independently-reviewed
     * one. `gitlab`/`bitbucket` connections always leave this `NULL`: neither provider has a reviewed
     * single-field identity extractor the way GitHub's `login` does (see `verify.ts`'s header on why
     * s3-compatible gets the identical "no reviewed field" treatment on the publish side) — guessing at
     * an unreviewed response shape here would violate this codebase's own "never email/plan/billing/org,
     * one field only" discipline for account-identity reads.
     */
    accountLabel: text("account_label"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("source_control_credential_sets_workspace_provider_label_unique").on(table.workspaceId, table.providerId, table.label),
  ]
);

/**
 * User-defined provider credentials for the admin Access Tokens page's "Add custom provider"
 * capability (`apps/admin/src/features/security/`, 2026-08-17) — a workspace-typed name (e.g.
 * "name.com", "GoDaddy") plus an API base URL, an access token, and an optional username, filed
 * under one of the page's own category buckets. Deliberately a THIRD, separate table from
 * `publishCredentialSets`/`sourceControlCredentialSets` above rather than a widened provider-id
 * union on either: both of those are CLOSED discriminated unions over a small, reviewed set of
 * named providers with their own per-provider semantics (a publish target, a source-control
 * identity) — a custom row has no fixed provider identity at all (the operator types the name),
 * so it has no closed union to join. Structurally closest to `sourceControlCredentialSets`
 * (composite `(workspace_id, id)` PK, one sealed blob per row) but with no `provider_id`/
 * `is_default`/`account_label` — none of those concepts apply when every row is already its own,
 * independent, standalone credential rather than one of several named connections under a shared
 * provider.
 *
 * `category`/`base_url` are held in the clear (not sealed), same "the read model must be able to
 * group/filter/link without decrypting" reasoning `AccessTokenProviderInfo.category`/`tokenPageUrl`
 * already rely on for the page's seven built-in providers — the admin list route never decrypts
 * (mirrors `listSourceControlCredentials`'s own "never touches the sealer" contract), so anything
 * the list/filter UI needs to read must already be plaintext on the row. `token` is the only
 * genuinely secret field, sealed as this table's own one connection-object ciphertext, same
 * one-ciphertext-per-row discipline every sibling credential table here documents. `username` used
 * to be sealed alongside it and is now its own plaintext column (2026-09-01) — see that column's
 * own doc below for why an account identifier never belonged inside the ciphertext, and for the
 * two-pass migration that is still mid-flight (it is written to BOTH places until Pass 2 lands).
 */
export const customCredentialSets = sqliteTable(
  "custom_credential_sets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Operator-typed display name (e.g. "name.com") — unique per workspace, since a custom row has
     *  no other provider identity to disambiguate by. */
    label: text("label").notNull(),
    /** One of the Access Tokens page's own category-filter ids (`"source-control" | "hosting" |
     *  "media" | "ai" | "ops" | "general"`) — see `apps/admin/src/features/security/rules.ts`'s
     *  `AccessTokenRowCategoryId`. Validated against that same closed set server-side
     *  (`features/custom-credentials/store.ts`'s `validateCategory`), not DB-enforced (SQLite has no
     *  portable enum CHECK across this repo's dialect-parity story — same reasoning every other
     *  string-typed id column here already accepts). */
    category: text("category").notNull(),
    /** The vendor's API base URL (e.g. `https://api.vercel.com`) — plaintext, not a secret. This is
     *  the credential's PRIMARY allowed host; see `additionalHostsJson` below for the rest. */
    baseUrl: text("base_url").notNull(),
    /**
     * 2026-08-31 (owner-driven: a single fly.io credential needs BOTH `api.fly.io` (GraphQL) and
     * `api.machines.dev` (Machines REST) — one saved `base_url` cannot cover a real provider with
     * more than one API host). A JSON array of EXTRA origin strings this credential's token may be
     * sent to, beyond `base_url` — e.g. `["https://api.machines.dev"]`. `NULL`/absent means "no
     * extra hosts", not "unconfigured" — same "plain text, no Drizzle json-mode column" convention
     * every JSON-shaped column in this schema uses (`manifest.ts`'s own `isJsonColumnName` doc);
     * manually (de)serialized at `custom-credential-repo.sqlite.ts`'s adapter boundary. Plaintext,
     * not sealed — same "the read model must read it without decrypting" reasoning `base_url` above
     * already documents; a host is not a secret. This is a SECURITY column in the identical sense
     * `external_mcp_servers.allowed_tool_names` is (`this file's own doc on that column):
     * `features/custom-credentials/credentialed-request.ts`'s per-request host-binding check is
     * derived from `base_url` + this column and NOTHING else — it is the full allowlist a request's
     * resolved URL origin is checked against, never widened by tool input.
     */
    additionalHostsJson: text("additional_hosts_json"),
    /**
     * 2026-09-01 (owner-driven). The credential's own account login — the optional second half of
     * `{token, username?}` for a provider whose API authenticates a PAIR rather than a bare bearer
     * token. Plaintext, deliberately: a username is an account IDENTIFIER, not a secret, and it is
     * already rendered on screen in the Access Tokens edit form. Same "held in the clear because a
     * decrypt-on-read would put an AEAD open on a cheap path" reasoning
     * `vendorCredentialSets.accountLabel` and `publishCredentialSets.accountLabel` above each
     * document for their own column — and this table's own `category`/`base_url` doc above already
     * establishes the governing rule: the admin list route and `custom_credential_list` never
     * decrypt, so anything the read model must return has to be plaintext on the row.
     *
     * Before this column, `username` lived INSIDE `sealed_ciphertext` beside the token, which cost
     * two real bugs: the admin edit form rendered a saved username as blank on every load (it had no
     * non-decrypting source to read it from), and `custom_credential_list` had to omit it entirely.
     *
     * `NULL` means "this credential has no username", not "not yet migrated" — the two are
     * indistinguishable on the row by design, and nothing branches on the difference. Existing rows
     * are populated by `development/scripts/backfill-custom-credential-usernames.ts` (Pass 1), which
     * decrypts each row once and copies the value out WITHOUT rewriting the ciphertext; until a
     * later Pass 2 stops sealing it, `username` is written to BOTH this column and the sealed
     * connection object, so every existing decrypting reader keeps working unchanged.
     */
    username: text("username"),
    /** `SealedSecret.keyId`. */
    sealedKeyId: text("sealed_key_id").notNull(),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag` of the serialized `{token, username?}`
     *  connection object. */
    sealedCiphertext: text("sealed_ciphertext").notNull(),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce").notNull(),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded for the same future-algorithm
     *  reason every sibling credential table here gives. */
    sealedAlg: text("sealed_alg").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("custom_credential_sets_workspace_label_unique").on(table.workspaceId, table.label),
  ]
);

/**
 * Migration `0045` (2026-08-16, owner-decided redesign) — the vendor-scoped replacement for the two
 * tables directly above. `publishCredentialSets`/`sourceControlCredentialSets` each key a row on a
 * DESTINATION id (`"github-pages"`, `"github"`) even when the underlying secret authenticates the
 * SAME company — a GitHub personal access token had to be typed and sealed twice, once per table,
 * with no way for either save to know the other existed. This table keys on `vendor_id` instead — a
 * company/protocol identity (`"github" | "gitlab" | "bitbucket" | "vercel" | "netlify" |
 * "cloudflare" | "s3-compatible"`, `../features/vendor-credentials/types.ts`'s `VendorId`) — so
 * Source Control and the Static Site publish tab both read from, and both save into, the SAME
 * roster of GitHub tokens.
 *
 * `publish_credential_sets`/`source_control_credential_sets` are NOT dropped by this migration and
 * keep serving every existing route/tool/store unchanged — this table is additive-only. A separate,
 * explicitly-run backfill (`development/scripts/backfill-vendor-credentials.ts`, modeled on
 * `backfill-slug-collision-defaults.ts`'s dry-run-by-default / `--apply` / restore-point-first
 * shape) copies each existing row across, decrypting under its OLD table's AAD and re-sealing the
 * SAME plaintext bytes under THIS table's own AAD (`buildVendorCredentialAad`,
 * `../features/vendor-credentials/aad.ts`) — never a bare re-wrap, and never a plaintext rewrite:
 * see that script's own header for why the connection JSON itself is copied verbatim rather than
 * having its embedded `providerId` field renamed to a vendor id as part of this pass (deferred to
 * whichever slice builds the real `VendorConnectionInput` union). The cutover that points routes/
 * tools/UI at this table instead of the two above, and the migration that drops them, are later
 * work — see the backfill script's own header for exactly what remains before that is safe.
 *
 * Column shape mirrors the two tables above almost exactly (same composite `(workspace_id, id)`
 * primary key, same four `sealed*` columns, same write-path-owned `is_default` group invariant, same
 * deliberately-unsealed `account_label`) with two differences:
 *
 * - `vendor_id` replaces `provider_id` — see this table's own header above for what changed and why.
 * - `label` is UNIQUE per `(workspace_id, vendor_id)` same as before, but is now a REAL user-typed
 *   name rather than a hardcoded literal: both predecessor tables' admin UIs wrote the same constant
 *   string on every save (`PUBLISH_CREDENTIAL_ROW_LABEL`/`SOURCE_CONTROL_CREDENTIAL_ROW_LABEL`,
 *   `apps/admin/src/features/source-control/rules.ts`) even though the column itself has always
 *   supported a real one — the schema was ahead of the UI. The backfill script disambiguates any
 *   label collision this causes (both predecessor rows for one workspace+vendor pair literally
 *   named `"default"` is the expected common case, not an edge case) — see that script's own header.
 *
 * `token_tail` is new: the LAST FOUR CHARACTERS of the connection's primary secret
 * (`connection.token` for every vendor except `s3-compatible`, whose bearer-token-shaped field is
 * `secretAccessKey` instead — see `VendorConnectionInput`'s own doc once it exists), stored
 * unencrypted beside `sealed*` for the same reason `accountLabel` documents on the tables above: a
 * cheap, no-decrypt read the picker UI needs on every render (`"Github Access Token ••••MPWg"`), and
 * four characters of a ~40-90 character token is not meaningful secret material on its own — the
 * same judgment call `deployment_get_static_publish_capabilities`'s rewritten contract makes
 * explicit (`../features/deployments/publish-agent-tools.ts`'s own header) for why an agent may see
 * it too. Unlike `accountLabel`, `token_tail` is `NOT NULL`: it is always derivable at seal time from
 * the very same plaintext being sealed, so there is no "not yet verified" state to model with NULL —
 * see `sourceControlCredentialSets.accountLabel`'s own doc for how THAT column's NULL vs. populated
 * split is a genuine two-state fact this one does not share.
 */
export const vendorCredentialSets = sqliteTable(
  "vendor_credential_sets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** `"github" | "gitlab" | "bitbucket" | "vercel" | "netlify" | "cloudflare" | "s3-compatible"` —
     *  see `../features/vendor-credentials/types.ts`'s `VendorId`. */
    vendorId: text("vendor_id").notNull(),
    /** Human-chosen label, unique per `(workspace_id, vendor_id)` — see this table's own doc for why
     *  this is now genuinely user-typed rather than a hardcoded literal. */
    label: text("label").notNull(),
    /** `SealedSecret.keyId`. */
    sealedKeyId: text("sealed_key_id").notNull(),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag` of the whole serialized connection object. */
    sealedCiphertext: text("sealed_ciphertext").notNull(),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce").notNull(),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded for the same future-algorithm
     *  reason the two predecessor tables give. */
    sealedAlg: text("sealed_alg").notNull(),
    /** Last 4 characters of the connection's primary secret, plaintext — see this table's own doc
     *  for the full reasoning and which field counts as "primary" per vendor. */
    tokenTail: text("token_tail").notNull(),
    /** At most one `TRUE` per `(workspace_id, vendor_id)`, maintained by the write path that owns
     *  this table — same invariant, same "no DB-level CHECK" reasoning the two predecessor tables'
     *  own `isDefault` columns document. */
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    /** The verified account's public login/username, held in the clear — same reasoning the two
     *  predecessor tables' own `accountLabel` columns document. `NULL` until populated. */
    accountLabel: text("account_label"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("vendor_credential_sets_workspace_vendor_label_unique").on(table.workspaceId, table.vendorId, table.label),
  ]
);

/**
 * Per-workspace media-generation vendor credentials, one row per `(workspace_id, provider_id)` —
 * what the admin's Media → "Media providers" tab persists (`media/provider-credential-store.ts`).
 *
 * Workspace-scoped, NOT per-principal like `adminExecutionCredentials` above: generation spends
 * real money and produces assets published to the whole site, so the install has one roster of
 * vendor keys rather than one per admin. That is the opposite call from the BYOK table, and
 * deliberately so — see that table's header for the per-admin reasoning it does not share.
 *
 * `provider_id` holds an ENGINE-CANONICAL id from `@jini-ai/integrations/media-providers`'
 * `MEDIA_PROVIDERS` (`grok`, `nanobanana`, `fal`, `custom-image`, …) — NOT the differently-spelled
 * ids in `@jini-ai/ui`'s own `DEFAULT_MEDIA_PROVIDER_CATALOG` (`xai-grok-imagine`, `nano-banana`,
 * `fal-ai`, `custom-image-api`, …). The dispatch engine looks credentials up by the former, so
 * storing the latter would persist keys that silently never resolve. The store validates every id
 * against that catalogue on write, which is what keeps the two from drifting apart again.
 *
 * Multi-row per workspace, so `sealed*`/`masked` follow the same all-null-or-all-set CHECK as the
 * two credential tables above: a provider row may legitimately carry only `base_url`/`model` with
 * no key yet.
 */
export const mediaProviderCredentials = sqliteTable(
  "media_provider_credentials",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Engine-canonical provider id — see this table's header for why the spelling matters. */
    providerId: text("provider_id").notNull(),
    baseUrl: text("base_url"),
    model: text("model"),
    /** `SealedSecret.keyId` — names the root-key generation the value was wrapped under. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today; stored rather than hardcoded so a future algorithm change is
     *  data, not a silent reinterpretation of old rows. */
    sealedAlg: text("sealed_alg"),
    /** Last 4 characters of the key, precomputed at write time — feeds `@jini-ai/ui`'s
     *  `maskedKeyLabel` as its `apiKeyTail`. Stored as the bare tail, not the `••••`-prefixed
     *  label, because that package clamps and renders the prefix itself. */
    keyTail: text("key_tail"),
    /** Migration `0055` (2026-09-02, AAD-gap closure) — same `0`=legacy-no-aad /
     *  `1`=`buildMediaProviderCredentialAad`-bound contract as `site_assistant_credentials.aad_version`
     *  documents in full; per `(workspace_id, provider_id)` row, not per workspace. Backfilled by
     *  `development/scripts/backfill-media-provider-credential-aad.ts`. */
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.providerId] }),
    check(
      "media_provider_credentials_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL AND ${table.keyTail} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL AND ${table.keyTail} IS NOT NULL)`
    ),
  ]
);

/**
 * The workspace's Composio project credentials — one row per workspace, backing the admin's
 * Settings → Connectors tab (`connectors/composio-config-store.ts`).
 *
 * Workspace-scoped rather than per-principal, for the same reason as `mediaProviderCredentials`
 * above and the opposite of `adminExecutionCredentials`: a Composio project key authorizes
 * third-party accounts on behalf of the whole install, so one roster per workspace is the honest
 * scope. Two admins do not each hold their own Composio project.
 *
 * Single-row-per-workspace, so `workspace_id` is the bare primary key rather than half of a
 * composite — `siteAssistantCredentials`' shape, not `mediaProviderCredentials`'.
 *
 * `auth_config_ids` holds `ComposioConfig.authConfigIds`: a JSON object mapping connector id →
 * Composio auth-config id. NOT secret (they are opaque Composio resource ids, not credentials),
 * so it is a plain column while the API key beside it is sealed. It is persisted rather than
 * rederived because `ComposioConnectorProvider.prepareAuthConfig` CREATES an auth config on
 * Composio's side the first time a connector is used; losing the id would orphan that remote
 * resource and silently provision a duplicate on the next attempt.
 *
 * Sealed via the SAME ADR-058 `AesGcmSecretSealer`/`KeyringPort` instances the tables above reuse,
 * with the sealed-shape CHECK copied from `media_provider_credentials_sealed_shape`. A row may
 * legitimately exist with no key at all — `auth_config_ids` alone is a valid state after a key is
 * cleared, which is why every sealed column is nullable.
 */
export const composioConfig = sqliteTable(
  "composio_config",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** `SealedSecret.keyId`; NULL iff no Composio API key is stored. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today; stored so a future algorithm change is data, not a silent
     *  reinterpretation of old rows. */
    sealedAlg: text("sealed_alg"),
    /** Last 4 characters of the key, precomputed at write time — feeds the tab's masked label.
     *  Bare tail, no `••••` prefix, matching `media_provider_credentials.key_tail`. */
    keyTail: text("key_tail"),
    /** JSON object: connector id → Composio auth-config id. See this table's header. */
    authConfigIds: text("auth_config_ids"),
    /**
     * Monotonic counter bumped every time the stored key's IDENTITY changes — a different key saved,
     * or the key cleared. Re-saving the same key does not bump it, because nothing about the row's
     * Composio project changed.
     *
     * It exists so `auth_config_ids` can be written with a compare-and-swap. Those ids are
     * provisioned asynchronously during a connect handshake and persisted fire-and-forget, so a
     * rotation can commit between the read that fetched the row and the write that stores the ids.
     * Without this counter that late write would blind-overwrite the whole row, reverting the
     * rotation AND attaching ids scoped to the previous Composio project to the new key. Comparing
     * `sealed`/`key_tail` instead is not sufficient: those can coincide across keys, and the check
     * needed is "did this change since I read it", not "does it equal what I remember".
     *
     * Defaulted rather than backfilled: every pre-existing row starts at 0 and is immediately valid.
     */
    keyGeneration: integer("key_generation").notNull().default(0),
    /** Migration `0055` (2026-09-02, AAD-gap closure) — same `0`=legacy-no-aad /
     *  `1`=`buildComposioConfigAad`-bound contract as `site_assistant_credentials.aad_version`
     *  documents in full. Backfilled by `development/scripts/backfill-composio-config-aad.ts`. */
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "composio_config_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL AND ${table.keyTail} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL AND ${table.keyTail} IS NOT NULL)`
    ),
  ]
);

/**
 * Per-workspace external MCP server connections — what the admin's Settings → External MCP tab
 * persists, and what the agent daemon reads at boot to decide which third-party MCP servers to
 * federate (`assistant/mcp-federation/`).
 *
 * Multi-row per workspace and keyed by an operator-chosen id, so this follows
 * `mediaProviderCredentials`' composite-PK shape rather than the single-row `composioConfig`.
 *
 * `server_id` becomes part of every federated tool id the model sees (`mcp__<server_id>__<tool>`),
 * which is why `mcp-federation/trust.ts` restricts it to `[a-z0-9-]` — a `_` would blur that
 * namespace separator. The trust tier re-validates on read rather than trusting the column.
 *
 * `allowed_tool_names` is a SECURITY column, not a convenience. Federation is default-deny
 * (trust.ts R2): a server contributes only the remote tools this JSON array names, and an empty
 * array correctly yields zero tools. It is operator-authored on purpose — a remote server
 * classifying its own tools as safe is precisely what R2 exists to refuse, so this must never be
 * backfilled from what a server advertises about itself.
 *
 * `write_allowed_tool_names` is a SECOND security column with the identical status and the
 * identical rule — never backfilled from anything a server advertises about itself. It is
 * `trust.ts` R3's override: a tool declaring `readOnlyHint: false` is admitted only when it appears
 * in BOTH this list AND `allowed_tool_names`. Deliberately a second list rather than a flag on the
 * first — "available to the model" and "allowed to write" are independent operator decisions, and a
 * single list conflating them cannot express "readable but not writable" for the same tool. See
 * `mcp-federation/ports.ts`'s `FederatedMcpConnectionConfig.writeAllowedToolNames` for the full
 * argument. `write_grants_updated_by_principal_id` and `write_grants_updated_at` attribute the last
 * change to that list — WHO authorized which writes, and WHEN — written only when the list's
 * contents actually change, so a rename or an enable-toggle leaves them untouched. Both are nullable:
 * a pre-existing row, or one whose write list has never been touched, has no author to name.
 *
 * The env block is sealed as ONE blob rather than per-variable: it routinely carries live tokens,
 * and the whole block is handed to the child process together, so no read path wants one variable
 * without the others. `env_names` holds just the variable NAMES in plaintext so the tab can show
 * which are set without unsealing — the same split the UI's `secret-textarea` field kind makes
 * (names visible, values masked).
 *
 * Sealed via the SAME ADR-058 `AesGcmSecretSealer`/`KeyringPort` instances the three credential
 * tables above reuse. The all-null-or-all-set CHECK covers only the four `sealed_*` columns: a row
 * may legitimately hold no env at all (a server launched with no credentials is normal), and
 * `env_names` varies independently of whether a blob is present.
 */
export const externalMcpServers = sqliteTable(
  "external_mcp_servers",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Operator-chosen `[a-z0-9-]` id — see this table's header for why the charset is load-bearing. */
    serverId: text("server_id").notNull(),
    label: text("label"),
    /**
     * The Agent Plugin id that auto-provisioned this row (`features/agent-plugins/federate-mcp.ts`),
     * or NULL for a row an operator created by hand through Settings → External MCP / the
     * `external_mcp_save` tool. Lets the admin UI, and a future uninstall flow, tell the two apart.
     *
     * Set ONLY at row creation, by `federate-mcp.ts`'s own `saveExternalMcpServer` call — every other
     * caller (the PUT route, the assistant tool) omits it, and `saveExternalMcpServer` PRESERVES an
     * existing value when the field is absent, the same tri-state rule every other system-owned
     * column here follows (`oauth_client_id`'s `clientAuth` is the precedent). A row a plugin
     * provisions is never overwritten by a later provisioning attempt in the first place (Owner
     * decision 2026-09-10: "the existing row wins" — see `federate-mcp.ts`'s header), so this column
     * is written exactly once, at INSERT, for a plugin-provisioned row's entire lifetime.
     */
    provisionedByPluginId: text("provisioned_by_plugin_id"),
    /** `'stdio'` or `'streamable_http'` — see `assistant/external-mcp-store.ts`'s
     *  `SUPPORTED_EXTERNAL_MCP_TRANSPORTS`. Both are federatable. ORTHOGONAL to `auth_mode`: a
     *  stdio server can use OAuth, and an HTTP one can use a static token. */
    transport: text("transport").notNull(),
    /**
     * `'none' | 'static_env' | 'oauth'` — how credentials are obtained, independent of `transport`.
     * Defaulted to `'static_env'` rather than `'none'` so rows written before this column existed
     * keep their meaning: the only credential mechanism that existed then was the env block, and a
     * row with an empty block behaves identically under either value.
     */
    authMode: text("auth_mode").notNull().default("static_env"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    command: text("command"),
    /** Endpoint for a remote transport. NULL for stdio, where `command` is used instead. */
    url: text("url"),
    /** JSON array of argv strings. Secrets never belong here — argv is world-readable via `ps`. */
    args: text("args"),
    /** JSON array of admissible remote tool names. See this table's header. */
    allowedToolNames: text("allowed_tool_names"),
    /** JSON array of remote tool names separately authorized to write. See this table's header. */
    writeAllowedToolNames: text("write_allowed_tool_names"),
    /** Principal who last CHANGED `write_allowed_tool_names`. NULL until that list is ever touched. */
    writeGrantsUpdatedByPrincipalId: text("write_grants_updated_by_principal_id"),
    /** When `write_allowed_tool_names` was last changed. NULL under the same condition. */
    writeGrantsUpdatedAt: text("write_grants_updated_at"),
    /** JSON array of env variable NAMES, plaintext. Values live in the sealed columns below. */
    envNames: text("env_names"),
    /** `SealedSecret.keyId`; NULL iff no env block is stored. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today; stored so a future algorithm change is data. */
    sealedAlg: text("sealed_alg"),
    /** Registered `src/platform/oauth/` provider id this connection authorizes against, when it names one. */
    oauthProviderId: text("oauth_provider_id"),
    /** `'authorization_code' | 'device_code'`. Device grant is first-class: a self-hosted install
     *  often has no publicly reachable callback URL, which is the only thing the other grant needs. */
    oauthGrant: text("oauth_grant"),
    /** Plaintext. A client id is not a secret — it travels in the authorization URL by design. */
    oauthClientId: text("oauth_client_id"),
    /** JSON object of operator-typed endpoints, for a connection that defines its own provider. */
    oauthEndpointsJson: text("oauth_endpoints_json"),
    /** JSON array of requested scopes. Non-secret. */
    oauthScopesJson: text("oauth_scopes_json"),
    /** `'disconnected' | 'pending' | 'connected' | 'needs_reauth'`. `needs_reauth` is a RUNTIME
     *  lifecycle state, deliberately distinct from the boot-time "sealed blob will not decrypt"
     *  path — one is operator-actionable, the other is a storage failure. */
    oauthStatus: text("oauth_status"),
    /**
     * PLAINTEXT absolute expiry of the sealed access token, stored BESIDE the blob rather than
     * inside it — the same split `env_names` makes beside the sealed env values, and load-bearing
     * for the same kind of reason: expiry must be checkable by a scheduler and displayable in the
     * admin tab without a keyring round trip, and answering "when does this die" must not be a code
     * path that decrypts a live token.
     */
    oauthExpiresAt: text("oauth_expires_at"),
    /** For stdio + OAuth: which child-process env variable receives the access token. A NAME, so
     *  plaintext, exactly as `env_names` is. */
    oauthTokenEnvName: text("oauth_token_env_name"),
    /** Cross-process refresh lease. The admin server and the agent daemon are separate processes
     *  with separate DB handles; without a compare-and-set here both can redeem the same single-use
     *  rotating refresh token and kill the connection. Time-bounded so a crash cannot wedge it. */
    oauthRefreshLeaseUntil: text("oauth_refresh_lease_until"),
    /** Sealed `{ clientSecret?, tokens? }`. `SealedSecret.keyId`; NULL iff nothing is stored. */
    oauthSealedKeyId: text("oauth_sealed_key_id"),
    oauthSealedCiphertext: text("oauth_sealed_ciphertext"),
    oauthSealedNonce: text("oauth_sealed_nonce"),
    oauthSealedAlg: text("oauth_sealed_alg"),
    /**
     * AAD lineage of `sealed_*` (the env block). `0` = sealed before this table had AAD at all;
     * `1` = bound to `assistant/external-mcp-aad.ts`'s `buildExternalMcpEnvAad`. Defaults to `0` so
     * existing rows keep their meaning and stay openable through the legacy path until backfilled.
     */
    aadVersion: integer("aad_version").notNull().default(0),
    /**
     * AAD lineage of `oauth_sealed_*`, tracked SEPARATELY from `aad_version`: the two blobs are
     * written by different flows (operator edit vs. token refresh), so one can be re-sealed under
     * AAD while the other has not been. One shared counter would make a half-migrated row
     * indistinguishable from a fully-migrated one and brick whichever blob it lied about.
     */
    oauthAadVersion: integer("oauth_aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.serverId] }),
    check(
      "external_mcp_servers_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL)`
    ),
    check(
      "external_mcp_servers_oauth_sealed_shape",
      sql`(${table.oauthSealedKeyId} IS NULL AND ${table.oauthSealedCiphertext} IS NULL AND ${table.oauthSealedNonce} IS NULL AND ${table.oauthSealedAlg} IS NULL) OR (${table.oauthSealedKeyId} IS NOT NULL AND ${table.oauthSealedCiphertext} IS NOT NULL AND ${table.oauthSealedNonce} IS NOT NULL AND ${table.oauthSealedAlg} IS NOT NULL)`
    ),
  ]
);

/**
 * One connected third-party ACCOUNT per `(workspace_id, connector_id)` — what survives an OAuth
 * handshake, and what `connectors/connector-credential-store.ts` seals.
 *
 * Distinct from `composioConfig` above, which holds the one PROJECT key that authorizes talking to
 * Composio at all. This table holds the per-connector material Composio hands back after a user
 * authorizes an account (`ConnectorCredentialRecord.credentials`). Losing the project key means
 * nothing works; losing a row here means one connector needs reconnecting.
 *
 * Workspace-scoped for the same reason the project key is: an authorized GitHub or Notion account
 * acts on behalf of the whole install, and both are gated by the same `admin.integrations.manage`
 * permission. Cascade-deleted with the workspace.
 *
 * `credentials` is an opaque JSON object whose shape Composio owns, so it is sealed WHOLE rather
 * than decomposed into columns — Tovu never interprets it, and a schema that mirrored today's
 * fields would silently drop anything the provider adds. `account_label` is the only part held in
 * the clear, because the admin grid renders it on every card and decrypting the roster just to
 * paint labels would put an AEAD open on the page-load path.
 *
 * Sealed columns are nullable with the same all-null-or-all-set CHECK as every sibling credential
 * table, even though a row without credentials has no meaning today: the invariant belongs in the
 * CHECK, not in a NOT NULL that a later "record the account before the token arrives" flow would
 * have to migrate away from.
 */
export const composioConnectorCredentials = sqliteTable(
  "composio_connector_credentials",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Connector id from `@jini-ai/integrations/composio`'s catalog (`github`, `notion`, …). */
    connectorId: text("connector_id").notNull(),
    /** Human-facing account name shown on the connector card. Not secret. */
    accountLabel: text("account_label"),
    /** `SealedSecret.keyId` — names the root-key generation the credentials were wrapped under. */
    sealedKeyId: text("sealed_key_id"),
    /** Base64 `AEAD ciphertext || 16-byte GCM auth tag` over `JSON.stringify(credentials)`. */
    sealedCiphertext: text("sealed_ciphertext"),
    /** Base64 12-byte AES-GCM IV. */
    sealedNonce: text("sealed_nonce"),
    /** Always `'aes-256-gcm'` today; stored so a future algorithm change is data. */
    sealedAlg: text("sealed_alg"),
    /** Migration `0055` (2026-09-02, AAD-gap closure) — same `0`=legacy-no-aad /
     *  `1`=`buildConnectorCredentialAad`-bound contract as `site_assistant_credentials.aad_version`
     *  documents in full; per `(workspace_id, connector_id)` row. Backfilled by
     *  `development/scripts/backfill-connector-credential-aad.ts`. */
    aadVersion: integer("aad_version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.connectorId] }),
    check(
      "composio_connector_credentials_sealed_shape",
      sql`(${table.sealedKeyId} IS NULL AND ${table.sealedCiphertext} IS NULL AND ${table.sealedNonce} IS NULL AND ${table.sealedAlg} IS NULL) OR (${table.sealedKeyId} IS NOT NULL AND ${table.sealedCiphertext} IS NOT NULL AND ${table.sealedNonce} IS NOT NULL AND ${table.sealedAlg} IS NOT NULL)`
    ),
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

// ---------------------------------------------------------------------------
// Commerce (2026-08-12 swarm-consensus debate, section 5 — "Commerce and the tri-dialect data
// model"). First vertical slice only: catalog (products/prices), orders/order_items, and the
// webhook inbox that makes provider event ingestion idempotent AND ordered. Refunds, proration,
// carts, and multi-provider reconciliation are explicitly next-slice work — see each table's doc.
//
// Column-vs-document rule applied throughout (converged unanimously across the debate): if a
// query, index, constraint, join, or sort ever touches a field, it is a column; if it is read
// back whole by id and only ever rendered, it is JSON, never indexed. The only JSON column in
// this slice is `commerceWebhookEvents.payloadJson` — a provider-owned payload Tovu never
// queries into. Every other field the debate looked at (currency, amounts, status, timestamps,
// the ordering cursor) is a real column, per that rule.
//
// SQLite JSON storage stays `text("*_json")`, matching every other JSON column in this file
// (see this file's own module doc: "portable to Postgres `jsonb` later"). This is a TOOLING
// decision, not a durability or contract one — persisting SQLite's binary JSONB is safe
// (sqlite.org/jsonb.html commits to backward compatibility across versions) and its JSON
// functions (`json()`, `json_extract()`, `jsonb_extract()`, `json_type()`) work directly against
// a `jsonb()`-written BLOB. The actual blocker is that `jsonb()` is NOT a `drizzle-orm/
// sqlite-core` column builder (verified against the installed package: `integer`, `real`,
// `text`, `blob`, `numeric` is the complete list) and Drizzle's `customType.fromDriver` cannot
// rewrite a SELECT to wrap the column in `json(...)`, so binary storage would mean hand-written
// `sql` fragments at every call site. What would change this: a Drizzle `jsonb` column builder,
// or a codegen layer that rewrites SELECTs. See `src/platform/db/sqlite/jsonb-column.ts` for the
// (deliberately unwired) reference material this decision is grounded in.
// ---------------------------------------------------------------------------

/**
 * Commerce products — the sellable thing. Deliberately NOT folded into `memberTiers` above:
 * that table carries `welcomePagePath`/`visibleInPortal` (portal-presentation fields, meaningless
 * for a one-time digital good) and locks pricing to exactly two recurring slots
 * (`monthlyPriceCents`/`yearlyPriceCents`, no one-time representation at all). `grantsMemberTierId`
 * is the one bridge column: set only when purchasing this product is how a member obtains a tier.
 * Commerce owns financial truth; `memberSubscriptions` stays the access-entitlement projection —
 * this slice does not yet derive one from an order (see the commerce feature's own README/report
 * for what remains).
 */
export const commerceProducts = sqliteTable(
  "commerce_products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** Open string, not a DB enum — matches this file's existing convention (e.g. `posts.status`). */
    kind: text("kind").notNull(), // 'one_time' | 'membership' | 'digital' ...
    status: text("status").notNull(), // 'active' | 'archived'
    description: text("description"),
    /**
     * Set only when this product's purchase grants a `memberTiers` row. The composite FK below
     * targets `(memberTiers.workspaceId, memberTiers.id)`, not just `.id` — a plain single-column
     * FK to `memberTiers.id` would accept a tier id that belongs to a DIFFERENT workspace, which
     * is exactly the cross-tenant mistake C2 (every table workspace-scoped) exists to prevent.
     * NULL is exempt from FK enforcement by SQL's ordinary MATCH SIMPLE semantics, so a product
     * with no tier bridge needs no special-casing here.
     */
    grantsMemberTierId: text("grants_member_tier_id"),
    /**
     * Migration 0038 — variable-key, per-product display attributes (theme example: "Material" ->
     * "Thick premium weight combed cotton", "Care" -> "...", "Warranty" -> "..."; different
     * products use different keys). Column-vs-document call, made explicitly rather than by
     * silently stretching this file's "provider-owned payload" JSON scope: this data is
     * author-owned, not provider-owned, so that framing doesn't literally apply — but the
     * decisive property under the underlying rule still holds. Nothing today queries, filters, or
     * sorts on a spec label, so it is a document.
     *
     * PROMOTION TRIGGER, recorded so it isn't re-litigated from scratch later: the day someone
     * wants "filter by material: cotton", this is NOT an index-the-JSON-path fix — SQLite and
     * MySQL only index a NAMED EXTRACTED SCALAR, not an arbitrary JSON path per row, so there is
     * no way to index "whichever key happens to be present." It needs
     * `product_attribute_definitions` (a controlled label vocabulary) + `product_attribute_values`
     * (typed value, FK to definition) — a migration, not a follow-up index.
     */
    specsJson: text("specs_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("commerce_products_workspace_slug_unique").on(table.workspaceId, table.slug),
    foreignKey({
      name: "commerce_products_grants_member_tier_fk",
      columns: [table.workspaceId, table.grantsMemberTierId],
      foreignColumns: [memberTiers.workspaceId, memberTiers.id],
    }).onDelete("restrict"),
    check("commerce_products_status_check", sql`${table.status} IN ('active', 'archived')`),
  ]
);

/**
 * Migration 0038 — ordered product image gallery. Deliberately a thin join over the EXISTING
 * `media`/`assetBlobs` system (content-addressed storage, alt/title/caption already modeled
 * there) rather than a parallel media table — this table carries only the product<->media
 * relationship and its display position, nothing about the image asset itself.
 */
export const commerceProductImages = sqliteTable(
  "commerce_product_images",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    /** Gallery display order, ascending. Ties broken by `id` (insertion order) at read time. */
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("commerce_product_images_product_media_unique").on(table.productId, table.mediaId),
    index("idx_commerce_product_images_product_position").on(table.productId, table.position),
  ]
);

/**
 * Commerce prices — one or more price points per product. Rows are never mutated once referenced
 * by an order: `commerceOrderItems` snapshots `unitAmountCents`/`currency`/`description` at
 * purchase time instead of joining live (Stripe's own Invoice Line Item object does the same —
 * verified against `docs.stripe.com/api/invoice-line-item/object` during the 2026-08-12 debate),
 * so a later price change never rewrites history. `status: 'archived'` retires a price without
 * deleting it; `onDelete: "restrict"` on `commerceOrderItems.priceId` enforces that a referenced
 * price can never be hard-deleted out from under a historical order.
 */
export const commercePrices = sqliteTable(
  "commerce_prices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "restrict" }),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    /**
     * Migration 0038 — the struck-through "was" price shown next to `unitAmountCents`'s "now"
     * price (a static list-price display, not a time-boxed promotion or coupon — those are a
     * separate, genuinely temporal/conditional concern this column deliberately does not model).
     * A column, not a document: it is the same class of fact as `unitAmountCents` itself (a
     * typed, filterable/sortable money figure), and money is never JSON under this file's own
     * convention. NULL means "not on sale." The CHECK below prevents a data-entry error from
     * displaying a fake discount (a compare-at price that isn't actually higher than the real one).
     */
    compareAtAmountCents: integer("compare_at_amount_cents"),
    /** Lowercase ISO-4217, matching Stripe's own convention — enforced by the CHECK below. */
    currency: text("currency").notNull(),
    /** NULL = one-time. 'month' | 'year' = recurring, mirroring `memberTiers`' monthly/yearly split. */
    billingInterval: text("billing_interval"),
    status: text("status").notNull(), // 'active' | 'archived'
    createdAt: text("created_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    index("idx_commerce_prices_product").on(table.productId),
    check("commerce_prices_unit_amount_cents_check", sql`${table.unitAmountCents} >= 0`),
    check(
      "commerce_prices_compare_at_amount_cents_check",
      sql`${table.compareAtAmountCents} IS NULL OR ${table.compareAtAmountCents} > ${table.unitAmountCents}`
    ),
    check(
      "commerce_prices_currency_check",
      sql`length(${table.currency}) = 3 AND ${table.currency} = lower(${table.currency})`
    ),
    check("commerce_prices_status_check", sql`${table.status} IN ('active', 'archived')`),
    check(
      "commerce_prices_billing_interval_check",
      sql`${table.billingInterval} IS NULL OR ${table.billingInterval} IN ('month', 'year')`
    ),
  ]
);

/**
 * Orders — the financial-truth header row for one checkout. `providerEventAt` is the ordering
 * cursor: the provider's own event timestamp for the last webhook event actually applied to this
 * row, compared — never blindly overwritten — on every subsequent delivery by
 * `features/commerce/webhook-inbox.ts`'s single atomic `UPDATE ... WHERE`. `totalAmountCents` is
 * denormalized from `commerceOrderItems` (computed once at checkout, not DB-enforced — SQLite
 * CHECK cannot aggregate across rows): the column-vs-document rule makes it a column anyway
 * because it is reported/sorted on, the same reasoning this file already applies denormalizing
 * `workspaceId` into `outboxEvents` above.
 */
export const commerceOrders = sqliteTable(
  "commerce_orders",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    status: text("status").notNull(), // 'pending' | 'paid' | 'failed' | 'canceled'
    currency: text("currency").notNull(),
    totalAmountCents: integer("total_amount_cents").notNull(),
    provider: text("provider").notNull(),
    providerCustomerRef: text("provider_customer_ref"),
    providerPaymentRef: text("provider_payment_ref"),
    /** Ordering cursor — see table header. NULL until the first webhook event is applied. */
    providerEventAt: text("provider_event_at"),
    placedAt: text("placed_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    index("idx_commerce_orders_workspace_member").on(table.workspaceId, table.memberId),
    check("commerce_orders_total_amount_cents_check", sql`${table.totalAmountCents} >= 0`),
    check(
      "commerce_orders_currency_check",
      sql`length(${table.currency}) = 3 AND ${table.currency} = lower(${table.currency})`
    ),
    check(
      "commerce_orders_status_check",
      sql`${table.status} IN ('pending', 'paid', 'failed', 'canceled')`
    ),
  ]
);

/**
 * Order line items — one row per priced item, snapshotted (see `commercePrices`' header).
 * `productId` is denormalized off `priceId` for reporting without a join, same pattern as
 * `outboxEvents.workspaceId` above. `orderId` cascades with its parent order; `priceId`/
 * `productId` are `onDelete: "restrict"` so a historical line item can never be orphaned by
 * deleting the catalog row it snapshot from.
 */
export const commerceOrderItems = sqliteTable(
  "commerce_order_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "cascade" }),
    priceId: text("price_id")
      .notNull()
      .references(() => commercePrices.id, { onDelete: "restrict" }),
    productId: text("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    unitAmountCents: integer("unit_amount_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    currency: text("currency").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_commerce_order_items_order").on(table.orderId),
    check("commerce_order_items_unit_amount_cents_check", sql`${table.unitAmountCents} >= 0`),
    check("commerce_order_items_quantity_check", sql`${table.quantity} > 0`),
  ]
);

/**
 * Webhook inbox — idempotency AND the audit trail for provider events (2026-08-12 debate: "these
 * are different problems"). `payloadJson` stores the full, opaque provider payload whole,
 * unindexed — the one legitimate JSON-document field in this slice (see file-level note above);
 * every field a query/constraint touches (`workspaceId`, `provider`, `eventId`, `status`,
 * `receivedAt`) is a real column instead.
 *
 * `UNIQUE(provider, eventId)` — deliberately NOT scoped by `workspaceId` — is the replay guard: a
 * provider's `eventId` is already globally unique per provider, and narrowing the constraint by
 * workspace would let the same event double-process if a provider ever misrouted it across
 * workspaces. That constraint stops replay; it does NOT stop out-of-order delivery by itself —
 * `features/commerce/webhook-inbox.ts`'s single atomic `UPDATE ... WHERE providerEventAt < ?`
 * against `commerceOrders` is the ordering half.
 */
export const commerceWebhookEvents = sqliteTable(
  "commerce_webhook_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    /** The provider's own event timestamp (e.g. Stripe's `event.created`), NOT `receivedAt`. */
    eventOccurredAt: text("event_occurred_at").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull(), // 'received' | 'applied' | 'ignored' | 'failed'
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("commerce_webhook_events_provider_event_unique").on(table.provider, table.eventId),
    index("idx_commerce_webhook_events_claim").on(table.status, table.receivedAt),
    check(
      "commerce_webhook_events_status_check",
      sql`${table.status} IN ('received', 'applied', 'ignored', 'failed')`
    ),
  ]
);

// ---------------------------------------------------------------------------
// Deployments (ADS-memory swarm-consensus debate 6, 2026-08-12) — FIRST VERTICAL SLICE.
// `src/features/deployments/` domain types map 1:1 to these five tables. No repository or route
// wiring reads/writes them yet (see that feature's `index.ts` header for what remains).
// ---------------------------------------------------------------------------

/** A named promotion slot within a workspace — "staging", "production". Holds no content of its
 * own; a `deploymentTargets` row is what points one at a provider. */
export const deploymentEnvironments = sqliteTable(
  "deployment_environments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isProduction: integer("is_production").notNull(),
    createdAt: text("created_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_deployment_environments_workspace_slug").on(table.workspaceId, table.slug),
    check("deployment_environments_is_production_check", sql`${table.isProduction} IN (0, 1)`),
  ]
);

/** One provider connection, scoped to a single environment. `configJson` carries non-secret
 * provider config only (repo owner/name, GitHub environment name) — credential storage is not
 * wired up in this slice. */
export const deploymentTargets = sqliteTable(
  "deployment_targets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    environmentId: text("environment_id")
      .notNull()
      .references(() => deploymentEnvironments.id, { onDelete: "restrict" }),
    providerId: text("provider_id").notNull(),
    label: text("label").notNull(),
    configJson: text("config_json").notNull(),
    enabled: integer("enabled").notNull(),
    createdAt: text("created_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_deployment_targets_workspace_env").on(table.workspaceId, table.environmentId),
    check("deployment_targets_enabled_check", sql`${table.enabled} IN (0, 1)`),
  ]
);

/** An immutable, workspace-scoped artifact IDENTITY — "this is the thing that gets promoted". It
 * records a reference to an artifact that already exists; Tovu's CLI (`init`/`serve`/`introspect`
 * only) has no build or export command, so this table never represents something Tovu constructed. */
export const releases = sqliteTable(
  "releases",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceRepoUrl: text("source_repo_url"),
    sourceCommitSha: text("source_commit_sha"),
    sourceUri: text("source_uri"),
    sourceChecksum: text("source_checksum"),
    createdByPrincipalId: text("created_by_principal_id").notNull(),
    createdAt: text("created_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    index("idx_releases_workspace_created").on(table.workspaceId, table.createdAt),
    check("releases_source_kind_check", sql`${table.sourceKind} IN ('git-revision', 'external-artifact')`),
  ]
);

/**
 * One attempt to promote a `releases` row to a `deploymentEnvironments` row through a
 * `deploymentTargets` row — the durable execution record. `system/module-status.ts` is a
 * boot-readiness snapshot (one row, overwritten every boot), not a per-run table; this is not that.
 *
 * `providerId` is MATERIALIZED here rather than resolved by joining through `targetId` — the
 * busiest lookup path (an inbound provider callback, or a poll-worker pass) must resolve
 * `(providerId, providerRunRef)` to a row in one indexed lookup, without depending on
 * `deploymentTargets`'s current state.
 *
 * `targetId`/`environmentId`/`releaseId` ARE foreign-keyed, but with `ON DELETE SET NULL` rather
 * than the `restrict` used everywhere else in this file — deliberately, not an oversight.
 * `restrict` would block deleting a target/environment/release for as long as any run references
 * it, which is the opposite of what a run history needs (a run is a standalone historical record
 * of what was requested and what happened, and must remain queryable even after the thing it
 * targeted is gone). No FK at all would lose the one guarantee worth keeping: that a run can never
 * be created pointing at a target/environment/release that never existed. `SET NULL` gives both —
 * creation is validated, deletion is permitted, and the row survives with `providerId` +
 * `providerRunRef` intact, which is exactly what the callback/poll path needs. `workspaceId` stays
 * a hard `restrict` FK — workspace deletion is an intentional, cascading admin operation, not
 * something a run needs to survive.
 */
export const deploymentRuns = sqliteTable(
  "deployment_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    providerId: text("provider_id").notNull(),
    targetId: text("target_id").references(() => deploymentTargets.id, { onDelete: "set null" }),
    environmentId: text("environment_id").references(() => deploymentEnvironments.id, { onDelete: "set null" }),
    releaseId: text("release_id").references(() => releases.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    /** The provider's own identifier for this run. `NULL` until the provider accepts it. The ONLY
     * key an inbound callback or poll pass may use to find this row — never a caller-supplied
     * `workspaceId` (a webhook payload has no notion of a Tovu workspace). */
    providerRunRef: text("provider_run_ref"),
    reconciliation: text("reconciliation").notNull(),
    requestedByPrincipalId: text("requested_by_principal_id").notNull(),
    requestedAt: text("requested_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    /** Sanitized only — never raw provider response text (may contain reflected request fragments). */
    errorSummary: text("error_summary"),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    // SQLite treats each NULL as distinct in a UNIQUE index, so multiple not-yet-submitted runs
    // (providerRunRef IS NULL) never collide here.
    uniqueIndex("idx_deployment_runs_provider_ref").on(table.providerId, table.providerRunRef),
    index("idx_deployment_runs_workspace").on(table.workspaceId, table.requestedAt),
    check(
      "deployment_runs_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')`
    ),
    check("deployment_runs_reconciliation_check", sql`${table.reconciliation} IN ('poll', 'callback', 'manual')`),
  ]
);

/** One log line on a `deploymentRuns` row, for a future run-detail view. */
export const deploymentRunEvents = sqliteTable(
  "deployment_run_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    runId: text("run_id")
      .notNull()
      .references(() => deploymentRuns.id, { onDelete: "restrict" }),
    at: text("at").notNull(),
    level: text("level").notNull(),
    /** Sanitized before insert — same discipline as `deploymentRuns.errorSummary`. */
    message: text("message").notNull(),
  },
  (table) => [
    index("idx_deployment_run_events_run").on(table.runId, table.at),
    check("deployment_run_events_level_check", sql`${table.level} IN ('info', 'warning', 'error')`),
  ]
);
