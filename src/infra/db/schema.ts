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
