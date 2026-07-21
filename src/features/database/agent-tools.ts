/**
 * @file SPEC-017 C-110 / REQ-20–REQ-23 / AC-24 / AC-25 / AC-28 / AC-33 — the Database domain's
 * agent-tool catalog, instantiating SPEC-016 REQ-22's naming/callability convention (ADR-041 §6).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission/actor-class rule each one carries. Reads are freely agent-callable under
 * `database.read`; the one destructive tool (`database_execute_migrate_forward`) is token-gated and
 * restricted to `confirmer-must-equal-own-delegatedBy`. Restore is deliberately absent from this
 * catalog — an agent asking to "roll back" only ever reaches a guidance/deep-link tool, never a
 * lever (ADR-041 §6, "Restore is a Recovery tool, not a Database tool").
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
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
}

/**
 * Returns the Database domain's agent-tool catalog (ADR-041 §6, D4).
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getDatabaseAgentToolCatalog(
  _required: Record<string, never> = {},
  _optional: Record<string, never> = {}
): AgentToolDefinition[] {
  return [
    { name: "database_get_health", sideEffects: "none", authorization: { permission: "database.read" } },
    { name: "database_get_schema_state", sideEffects: "none", authorization: { permission: "database.read" } },
    { name: "database_list_pending_migrations", sideEffects: "none", authorization: { permission: "database.read" } },
    { name: "database_query_timeline", sideEffects: "none", authorization: { permission: "database.read" } },
    { name: "database_list_restore_points", sideEffects: "none", authorization: { permission: "database.read" } },
    {
      // database_plan_migrate_forward is a read (ADR-041 §6): it recomputes and returns a plan,
      // never mutates durable state.
      name: "database_plan_migrate_forward",
      sideEffects: "none",
      authorization: { permission: "database.read" },
    },
    {
      name: "database_execute_migrate_forward",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "database.migrate" },
      actorClassRule: "confirmer-must-equal-own-delegatedBy",
    },
    {
      name: "backup_create_restore_point",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "backup.create" },
    },
    {
      // The rollback hand-off: an agent never gets a restore lever from this domain, only a
      // deep-link routing envelope pointing at the Recovery surface (ADR-041 §6).
      name: "database_get_restore_guidance",
      sideEffects: "none",
      authorization: { permission: "database.read" },
    },
  ];
}
