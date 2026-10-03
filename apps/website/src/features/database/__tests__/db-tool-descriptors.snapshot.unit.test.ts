import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseAgentToolCatalog } from "../agent-tools.js";
import { databaseTransferAgentToolCatalog } from "../../database-transfer/tool-registrations.js";

// j03: captured from the pre-extraction catalogs. Keep this literal unchanged across the move.
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


const PLAN_TOOL_ID = "database_transfer_plan";
const SET_DESTINATION_TOOL_ID = "database_transfer_set_destination";
const STATUS_TOOL_ID = "database_transfer_status";
const DATABASE_TRANSFER_RUN_TOOL_ID = "database_transfer_run";
const RUN_PERMISSION = "database-transfer.run";
const TRANSFER_NO_INPUT_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;
const EXPECTED_DATABASE = [
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
const EXPECTED_TRANSFER = [
  {
    name: PLAN_TOOL_ID,
    description:
      "Plans a COPY of this site's data into a Postgres database (for example 'move/transfer/copy my data to Postgres'). The site keeps running on its built-in storage; this only makes a copy, into the site's own private area (Postgres schema) on that database: 'tovu' for the first site copied there, 'tovu_<site name>' for any other, and always the same one for this site afterwards. Several sites can share one database; each copy replaces only its own area. Read-only: it snapshots the site database, connects to the saved destination, and counts what would be copied. Logins, saved keys and secret settings are never copied; photos and files stay where they are. No input: the destination is the one the human saved with database_transfer_set_destination. Returns {planned: true, planId, expiresAt, destination: {host, port, database, user}, area (the schema), snapshotAt, tableCount, rowCount, replaces (the earlier copy's time, or null), leftOut, notes, nextStep}, or {planned: false, code, message} (codes: NO_DESTINATION, UNREACHABLE, SERVER_TOO_OLD, NO_CREATE_PERMISSION, TARGET_NOT_OURS, DATABASE_SNAPSHOT_FAILED, SCHEMA_MISMATCH, UNAVAILABLE). Tell the human in plain words what will be copied, then call database_transfer_run with the planId.",
    sideEffects: "none",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: TRANSFER_NO_INPUT_SCHEMA,
  },
  {
    name: SET_DESTINATION_TOOL_ID,
    description:
      "Asks the human where a copy of this site's data should go: shows a private form where they paste a Postgres database address. HUMAN-GATED: this one call shows the form and WAITS. You never see the address, and must never ask for it in chat; if the human pastes one into the chat anyway, do not repeat it, call this tool, and suggest they change that database password. Checks that the database can be reached before saving it (one destination per site; saving replaces the earlier one). Returns {saved: true, destination: {host, port, database, user}, replaces (the time of a copy this site already made there, or null)}, {saved: false, code, message} (INVALID_CONNECTION_STRING, UNREACHABLE, SERVER_TOO_OLD, NO_CREATE_PERMISSION, TARGET_NOT_OURS), or {saved: false, reason} (cancelled, expired, abandoned). Then call database_transfer_plan.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: TRANSFER_NO_INPUT_SCHEMA,
  },
  {
    name: STATUS_TOOL_ID,
    description:
      "Reports where this site's data copy goes and how the last copy went ('is my data copied?', 'when was the last copy?'). Read-only. Returns {destination: {host, port, database, user} or null, lastRun: {copied: true, snapshotAt, tableCount, rowCount} or {copied: false, snapshotAt, code, message} or null (since the server started), copyOnDestination: {site, snapshotAt} or null, or {unreachable: message}}.",
    sideEffects: "none",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: TRANSFER_NO_INPUT_SCHEMA,
  },
  {
    name: DATABASE_TRANSFER_RUN_TOOL_ID,
    description:
      "Copies the data planned by database_transfer_plan. A first copy runs immediately without a confirmation card. Replacing an earlier copy permanently deletes its destination schema: this one call shows a Copy/Cancel card and WAITS; there is no second call. On Copy it writes the planned snapshot as one transaction into this site's private area (this site's earlier copy is replaced; other sites' copies and anything else in the database are untouched), checks every table's row count, and returns {copied: true, destination, area, snapshotAt, tableCount, rowCount, tables: [{name, rows}]}. Any failure throws the copy away and keeps the earlier one: {copied: false, cancelled: false, code, message} (TARGET_NOT_OURS, COPY_FAILED, COUNT_MISMATCH, PLAN_NOT_FOUND, PLAN_EXPIRED). Cancel returns {copied: false, cancelled: true}.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: RUN_PERMISSION },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["planId"],
      properties: { planId: { type: "string", description: "The planId database_transfer_plan returned. Single-use; valid for 10 minutes." } },
    },
  },
];
const wire = (entry: { name: string; description: string; inputSchema?: unknown }) => ({ name: entry.name, description: entry.description, inputSchema: entry.inputSchema });
test("all thirteen descriptor names, descriptions and input schemas retain their pre-extraction bytes", () => {
  const actual = [...getDatabaseAgentToolCatalog(), ...databaseTransferAgentToolCatalog].map(wire);
  assert.equal(actual.length, 13);
  assert.equal(JSON.stringify(actual), JSON.stringify([...EXPECTED_DATABASE, ...EXPECTED_TRANSFER].map(wire)));
});
