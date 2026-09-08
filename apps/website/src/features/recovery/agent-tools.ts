/**
 * @file SPEC-019 C-307 / REQ-23-REQ-25 / INV-06 — Recovery's agent-tool catalog (ADR-045
 * "Rejected alternatives": "Letting an agent hold a direct restore lever" — rejected, ADR-041 §6).
 *
 * Purpose:
 * A static catalog. No `backup_confirm_restore`-equivalent tool ever exists (INV-06) — the human
 * confirmation step is exactly the one act SPEC-016's gateway reserves for `kind='user'`/api_key
 * principals; no description in this catalog may even claim to perform that step, so a future
 * addition can't quietly reintroduce the capability by wording alone.
 *
 * Widened this dispatch (`assistant/tool-registrations.ts`'s wiring pass):
 *   - `inputSchema` added to `AgentToolDefinition` (optional, mirroring
 *     `features/content-types/agent-tools.ts` — `backup_execute_restore` is never wired, so it
 *     carries no schema).
 *   - `backup_create_restore_point` is declared here (pre-existing, SPEC-019) but deliberately left
 *     UNWIRED by `buildRecoveryRegistrations` — see that function's own comment. Short version: this
 *     tool id collides with `features/database/agent-tools.ts`'s own `backup_create_restore_point`
 *     (ADR-041 §6 names the Database domain as that permission's "named tool"), and this domain's
 *     OWN local `createRestorePoint` (`recovery/restore-points.ts`) never actually calls
 *     `DbOpsPort.captureRestorePoint()` — wiring it here would silently mint restore-point rows with
 *     no real snapshot artifact, reintroducing the exact "artifactRef silently dropped" defect
 *     `database/restore-points.ts`'s own file header records as already fixed.
 *   - `recovery_get_status` and `recovery_resolve_deep_link` are NEW catalog entries this dispatch
 *     adds (not part of SPEC-019's original REQ-23-REQ-25 set) — both are read-only, zero-side-effect
 *     admin-UI sections (`routes/admin/recovery/status.ts`, `routes/admin/recovery/deep-link.ts`)
 *     this catalog did not previously cover at all. Added under the same "read-only admin-UI section
 *     is safe to wrap directly" bar the rest of this catalog already uses, per ADR-045 §4/§5.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may see at all; `authorize()` and the confirmation-token gateway enforce the actual
 * checks at call time — this module declares shape only, no I/O.
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
   * JSON Schema for this tool's `input`, published via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Optional,
   * matching `features/content-types/agent-tools.ts`'s convention — `backup_execute_restore` is
   * never wired at all, so it carries none.
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

const RESTORE_POINT_ID_SCHEMA = {
  type: "string",
  minLength: 1,
  description: "A restore point id, as returned by content_read.backup_restore_point or content_read.database_restore_point.",
} as const;

const PLAN_RESTORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["restorePointId"],
  properties: {
    restorePointId: RESTORE_POINT_ID_SCHEMA,
  },
} as const;

/** `recovery_resolve_deep_link`'s input — mirrors `features/recovery/deep-link.ts`'s
 * `DatabaseContextEnvelope` shape field-for-field. Every id inside is untrusted and re-looked-up
 * server-side on arrival (INV-04); nothing in this schema grants authority, it only carries display
 * continuity (ADR-041 §7). */
const DEEP_LINK_ENVELOPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["envelope"],
  properties: {
    envelope: {
      type: "object",
      additionalProperties: false,
      required: ["v", "correlationId", "siteId", "ledgerEventId", "restorePointId", "drift", "intent", "issuedAt"],
      properties: {
        v: { type: "integer", description: "Envelope schema version." },
        correlationId: { type: "string", description: "The incident/correlation id minted when this deep-link's chain began." },
        siteId: { type: "string", description: "The site/workspace id the envelope was minted for. Re-verified server-side, never trusted as-is." },
        ledgerEventId: { type: ["string", "null"], description: "The database ledger row id this envelope points at, or null." },
        restorePointId: {
          type: ["string", "null"],
          description: "The restore point id this envelope points at, or null. Re-looked-up server-side; a stale or forged id resolves to found:false rather than being trusted.",
        },
        drift: { type: "string", description: "The drift status carried for display continuity only; never trusted as authoritative." },
        intent: { type: "string", description: "The carried intent (e.g. 'view'), for display continuity only." },
        issuedAt: { type: "string", description: "ISO-8601 timestamp the envelope was minted at." },
      },
    },
  },
} as const;

/**
 * REQ-23/REQ-24/REQ-25/INV-06/AC-33-AC-35 — Recovery's fixed agent-tool catalog: reads are freely
 * agent-callable under `backup.read`; `backup_execute_restore` is the one destructive, token-gated
 * tool (`confirmer-must-equal-own-delegatedBy`); `backup_create_restore_point` is an ordinary
 * mutation, never wrapped in a plan/confirm/execute sequence — but see this file's header for why
 * it is nonetheless left unwired from THIS domain's own build function.
 */
export const recoveryAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "backup_list_restore_points",
    description: "Lists restore points for the current site, newest first, with their capture trigger and cost class.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "backup_get_capabilities",
    description: "Reports this site's restore-point cost class and mechanism kind.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "backup_plan_restore",
    description: "Previews what restoring to a given restore point would change, including the discarded-write-window disclosure.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
    inputSchema: PLAN_RESTORE_SCHEMA,
  },
  {
    name: "backup_execute_restore",
    description:
      "Runs a restore using a token a human already minted through the admin UI's own restore ceremony. This tool never mints that token itself and never runs without one.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "backup.restore" },
    actorClassRule: "confirmer-must-equal-own-delegatedBy",
  },
  {
    // Pre-existing (SPEC-019) catalog entry, deliberately left UNWIRED — see this file's header
    // and `buildRecoveryRegistrations`'s own comment (tool-registrations.ts) for the full reasoning:
    // an id collision with `features/database/agent-tools.ts`'s own `backup_create_restore_point`,
    // whose wiring is the canonical one (ADR-041 §6).
    name: "backup_create_restore_point",
    description: "Mints a new restore point independent of any migration, subject to the site's cost-acknowledgment rule.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "backup.create" },
  },
  {
    // NEW this dispatch (not part of SPEC-019's original set) — read-only, admin-UI "Recovery
    // status bar + degraded banner" section (`routes/admin/recovery/status.ts`, ADR-045 §4).
    name: "recovery_get_status",
    description:
      "Reports this site's current restore-point cost class plus the single highest-precedence degraded-state banner (migration interrupted, pending migration, an operation already in flight, cost class unavailable, or watermark baseline unavailable), if any.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    // NEW this dispatch (not part of SPEC-019's original set) — read-only re-resolution of a
    // deep-link envelope (`routes/admin/recovery/deep-link.ts`, ADR-041 §7/ADR-045 §5). Never
    // trusts the envelope's own carried values; every id is re-looked-up server-side (INV-04).
    name: "recovery_resolve_deep_link",
    description:
      "Re-resolves a Database-Timeline deep-link envelope server-side (INV-04): looks up the envelope's restorePointId against the current restore-points list rather than trusting the envelope's own carried value. A stale or forged id resolves to found:false.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
    inputSchema: DEEP_LINK_ENVELOPE_SCHEMA,
  },
];
