/**
 * @file REQ-22/REQ-23 (SPEC-020) — the Collections content-types agent-tool catalog, instantiating
 * SPEC-016 REQ-22's naming/callability convention (mirrors `features/storage/agent-tools.ts`'s
 * shape for this domain).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission/actor-class rule each one carries. `collections_plan_cleanup` is a free read
 * (`admin.collections.read`, `sideEffects:'none'`) — it only recomputes and returns an eligibility
 * plan. `collections_execute_cleanup` is the one destructive tool, gated to
 * `admin.collections.manage` and restricted to `confirmer-must-equal-own-delegatedBy`. There is
 * deliberately no `collections_confirm_cleanup` tool and no tool description implying an agent can
 * perform the confirm() step — confirmation of a destructive cleanup is human-UI-only (mirrors
 * ADR-041 §6's "Restore is a Recovery tool, not a Storage tool" discipline: a lever an agent must
 * never be handed directly).
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` and the confirmation-token gateway (`core/gated-mutations`)
 * enforce the actual permission/actor-class checks at call time — this module only declares the
 * catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `features/content-types` domain logic. No dependencies.
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

/** REQ-22/REQ-23 — the Collections content-types domain's fixed agent-tool catalog. */
export const contentTypesAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "collections_plan_cleanup",
    description: "Recomputes and returns the destructive-removal eligibility plan for a tombstoned content type. Read-only; performs no removal.",
    sideEffects: "none",
    authorization: { permission: "admin.collections.read" },
  },
  {
    name: "collections_execute_cleanup",
    description: "Executes the destructive, atomic removal of a tombstoned content type and all of its scoped rows, using a previously redeemed token.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
    actorClassRule: "confirmer-must-equal-own-delegatedBy",
  },
  {
    name: "collections_content_type_define",
    description: "Registers a new operator-defined content type in the registry.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
  },
  {
    name: "collections_content_type_update_fields",
    description: "Full-replaces a content type's field schema.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
  },
  {
    name: "collections_content_type_deprecate",
    description: "Deprecates an active content type, blocking new entry creation only.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
  },
  {
    name: "collections_content_type_reactivate",
    description: "Reactivates a deprecated content type back to active.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
  },
  {
    name: "collections_content_type_tombstone",
    description: "Tombstones a deprecated content type and tears down its provisioned queryable-field indexes.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.collections.manage" },
  },
];
