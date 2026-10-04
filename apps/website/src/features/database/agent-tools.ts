import type { AgentToolDefinition } from "@jini-ai/core";
import { getDatabaseAgentToolCatalog as getJiniDatabaseAgentToolCatalog } from "@jini-ai/db/tools";
import { TOVU_DATABASE_MESSAGES } from "./db-messages.js";

/** Compatibility facade; catalog contracts and SPEC/ADR rationale now live in @jini-ai/db/tools. Tovu's own copy, not Jini's neutral defaults. */
export function getDatabaseAgentToolCatalog(): AgentToolDefinition[] {
  return getJiniDatabaseAgentToolCatalog({}, { messages: TOVU_DATABASE_MESSAGES });
}
export type { AgentToolDefinition, AgentToolSideEffect, AgentToolActorClassRule } from "@jini-ai/core";
