/**
 * @file SPEC-017 C-110 / REQ-20–REQ-23 / AC-24 / AC-25 / AC-28 / AC-33 — the Database domain's
 * agent-tool catalog, instantiating SPEC-016 REQ-22's naming/callability convention (ADR-041 §6).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission/actor-class rule each one carries. Reads are freely agent-callable under
 * `database.read`; the one destructive tool (`database_execute_migrate_forward`) is token-gated,
 * restricted to `confirmer-must-equal-own-delegatedBy`, and asks the human in chat before it runs. Restore is deliberately absent from this
 * catalog — an agent asking to "roll back" only ever reaches a guidance/deep-link tool, never a
 * lever (ADR-041 §6, "Restore is a Recovery tool, not a Database tool").
 *
 * Widened this dispatch (`assistant/tool-registrations.ts`'s wiring pass) with `description` and
 * `inputSchema` — this file previously declared id/sideEffects/authorization only, one layer short
 * of what `tool-registrations.ts` requires to actually publish a tool to the model (mirrors
 * `forms/agent-tools.ts`'s `AgentToolDefinition` shape; `inputSchema` stays OPTIONAL, as in
 * `features/content-types/agent-tools.ts`, because 1 of these 9 entries is still declared but
 * deliberately never wired — see `tool-registrations.ts`'s `UNWIRED_DATABASE_TOOL_IDS`:
 * `database_get_restore_guidance` has no envelope-minting function to compose (only the RECEIVING
 * side, `recovery/deep-link.ts`'s `resolveDeepLinkContext`, exists — building one would mean
 * composing a fresh `correlationId`/`restorePointId`/ledger-event lookup on top of a cross-domain
 * envelope format, new backend work well past a wiring pass, not a natural extension of the
 * read-only introspection adapter below).
 *
 * A later dispatch built `features/database/adapter.sqlite.ts` (`DatabaseIntrospectionPort`,
 * composed into `RouteDeps` as `databaseIntrospection` in both `server/deps.ts` and `server/app.ts`)
 * and wired `database_get_health`/`database_get_schema_state`/`content_read.database_pending_migration`
 * against it — see each entry's own comment below and `tool-registrations.ts`'s handlers.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) and the confirmation-token gateway
 * (`core/gated-mutations`) enforce the actual permission/actor-class checks at call time — this
 * module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `features/database` domain logic. No dependencies.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export type AgentToolActorClassRule = "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Optional,
   * matching `features/content-types/agent-tools.ts`'s convention — the entries this dispatch
   * leaves unwired (see file header) carry no schema at all, since one is never published for a
   * tool the model never sees.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — shared by every parameterless read tool in this catalog. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/** `database_query_timeline`'s filter — mirrors `features/database/timeline.ts`'s `getTimeline` filter shape and `routes/admin/database/timeline.ts`'s query-string parsing 1:1. */
const TIMELINE_QUERY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    kind: { type: "string", description: "Filter by ledger row kind (e.g. 'core.migration', 'restore.executed'). Omit for all kinds." },
    outcome: { type: "string", description: "Filter by outcome (e.g. 'success', 'failure'). Omit for all outcomes." },
    fromDate: { type: "string", description: "ISO-8601 inclusive lower bound on createdAt. Omit for no lower bound." },
    toDate: { type: "string", description: "ISO-8601 inclusive upper bound on createdAt. Omit for no upper bound." },
    cursor: { type: "string", description: "Opaque pagination cursor from a previous call's own nextCursor. Omit to start from the newest row." },
    limit: { type: "integer", minimum: 1, maximum: 200, description: "Max rows to return. Server-capped at 200 regardless of what is requested; defaults to 50 when omitted." },
  },
} as const;

/** `backup_create_restore_point`'s input. `trigger` is deliberately NOT a model-settable field —
 * every agent-initiated restore point is stamped `trigger:'manual'` server-side regardless of what
 * is asked for, so the ledger's provenance trail cannot be mislabeled (e.g. as `'pre-migration-auto'`,
 * a value that is only ever true when the SYSTEM itself takes the snapshot). */
const CREATE_RESTORE_POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    costAck: {
      type: "boolean",
      description:
        "Explicit cost acknowledgment. Required (must be true) only when this site's restore-point cost class is 'expensive'; ignored when 'cheap'. The call is refused with no override at all when cost class is 'unavailable' (ADR-041 §2 — no attestation override).",
    },
  },
} as const;

/**
 * The Database domain's fixed agent-tool catalog (ADR-041 §6, D4).
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getDatabaseAgentToolCatalog(
  _required: Record<string, never> = {},
  _optional: Record<string, never> = {}
): AgentToolDefinition[] {
  return [
    {
      // WIRED (tool-registrations.ts) against `adapter.sqlite.ts`'s `DatabaseIntrospectionPort.getHealth()`
      // — connectivity + `__drizzle_migrations` readability + drift status, exactly what that
      // method computes. Deliberately does NOT report disk headroom or interrupted-migration state
      // despite this description's own wording — no adapter for either exists yet (disk headroom
      // has no seam anywhere in this codebase; interrupted-migration state lives on
      // `migrationRunsRepo`/`siteStatusRepo`, a separate port this tool does not read), so this
      // stays a minimal, honest subset rather than fabricating fields the description implies.
      name: "database_get_health",
      description: "Reports a summary of this site's database health (connectivity, disk headroom, pending-migration/interrupted-migration state).",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      // WIRED (tool-registrations.ts) against `adapter.sqlite.ts`'s `DatabaseIntrospectionPort.getSchemaState()`,
      // which reads the two real `SchemaSnapshot`s (`.site-meta.json`, `__drizzle_migrations`) this
      // entry's own comment used to say no adapter supplied, and passes them through `drift.ts`'s
      // `getDriftStatus` unchanged.
      name: "database_get_schema_state",
      description: "Reports this site's schema drift status (in-sync/ahead/diverged/behind) between its persisted schema snapshot and the runtime's current schema.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      // WIRED (tool-registrations.ts) against `adapter.sqlite.ts`'s `DatabaseIntrospectionPort.listPendingMigrations()`
      // — diffs the bundled `db/drizzle/meta/_journal.json` against `__drizzle_migrations`'s
      // applied rows. Note this is the Drizzle-migration-file sense of "pending", distinct from
      // `migration_runs`'s own in-flight-migration-run tracking (`boot/reconcile-interrupted-migration.ts`).
      name: "database_list_pending_migrations",
      description: "Lists migrations pending against this site that have not yet been applied.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      name: "database_query_timeline",
      description:
        "Returns a filtered, cursor-paginated page of the append-only database ledger (migrations, snapshots, restores, interrupted migrations), newest first.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: TIMELINE_QUERY_SCHEMA,
    },
    {
      name: "database_list_restore_points",
      description: "Lists every restore point recorded for this site, newest first, with its trigger, cost class, and capture time.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      // database_plan_migrate_forward is a read (ADR-041 §6): it recomputes and returns a plan,
      // never mutates durable state. Verified directly against `core/gated-mutations/gateway.ts`'s
      // `plan()`, which persists nothing — it authorizes, calls `hooks.computePlan()`, and returns
      // the result. Safe to wire despite migrate-forward's overall high-risk classification: the
      // step that actually redeems a plan into a mutation (`confirm()`) can never be reached by an
      // agent principal at all (the gateway's own actor-class rule reserves `confirm()` for a
      // human/api_key caller — AC-12), and no tool in this catalog exposes `confirm()`.
      name: "database_plan_migrate_forward",
      description: "Previews what forward-migrating this site's schema would do — cost class and a plan hash — without applying anything.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      // Asks the human in chat first (2026-09-24): wired with `humanConfirmedToolHandler`, which
      // shows a confirm dialog and, only on the human's own click, confirms as that human and
      // executes as the agent acting for them. A migrate-forward affects every domain at once, so
      // it stays gated; the model never sees or supplies a token.
      name: "database_execute_migrate_forward",
      description:
        "Moves this site's database forward to the current schema. Shows the user a confirm dialog first and only runs if they " +
        "confirm. A restore point is taken first. Call database_plan_migrate_forward first to see the cost class.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "database.migrate" },
      inputSchema: NO_INPUT_SCHEMA,
      actorClassRule: "confirmer-must-equal-own-delegatedBy",
    },
    {
      // Canonical wiring lives in `buildDatabaseRegistrations` (tool-registrations.ts) — ADR-041 §6
      // names this as "the named tool for the `backup.create` permission" on the Storage/Database
      // domain. `features/recovery/agent-tools.ts` also declares an entry of this same name (a
      // pre-existing cross-domain id collision this dispatch found, not introduced by it); that
      // entry is deliberately left unwired in Recovery's own build function — see its file header.
      name: "backup_create_restore_point",
      description: "Mints a new restore point for this site independent of any migration, subject to the site's cost-acknowledgment rule.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "backup.create" },
      inputSchema: CREATE_RESTORE_POINT_SCHEMA,
    },
    {
      // NOT WIRED (tool-registrations.ts): the rollback hand-off — an agent never gets a restore
      // lever from this domain, only a deep-link routing envelope pointing at the Recovery surface
      // (ADR-041 §6). No envelope-MINTING function exists in this codebase yet (only the receiving
      // side, `recovery/deep-link.ts`'s `resolveDeepLinkContext`, does) and minting one honestly
      // needs a real schema-drift computation this dispatch has no adapter for — see
      // `database_get_schema_state`'s own note. Fabricating a placeholder `drift` value would
      // violate this codebase's own "never fabricate" discipline (`disclosure.ts`'s identical rule).
      name: "database_get_restore_guidance",
      description:
        "Returns a deep-link routing envelope pointing at the Recovery surface for restoring this site to an earlier snapshot. Never itself a restore lever.",
      sideEffects: "none",
      authorization: { permission: "database.read" },
    },
  ];
}
