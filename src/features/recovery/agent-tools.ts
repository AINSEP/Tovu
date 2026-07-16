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
}

/**
 * REQ-23/REQ-24/REQ-25/INV-06/AC-33-AC-35 — Recovery's fixed agent-tool catalog: reads are freely
 * agent-callable under `backup.read`; `backup_execute_restore` is the one destructive, token-gated
 * tool (`confirmer-must-equal-own-delegatedBy`); `backup_create_restore_point` is an ordinary
 * mutation, never wrapped in a plan/confirm/execute sequence.
 */
export const recoveryAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "backup_list_restore_points",
    description: "Lists restore points for the current site, newest first, with their capture trigger and cost class.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
  },
  {
    name: "backup_get_capabilities",
    description: "Reports this site's restore-point cost class and mechanism kind.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
  },
  {
    name: "backup_plan_restore",
    description: "Previews what restoring to a given restore point would change, including the discarded-write-window disclosure.",
    sideEffects: "none",
    authorization: { permission: "backup.read" },
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
    name: "backup_create_restore_point",
    description: "Mints a new restore point independent of any migration, subject to the site's cost-acknowledgment rule.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "backup.create" },
  },
];
