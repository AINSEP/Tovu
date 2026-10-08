import type { AgentToolDefinition } from "@jini-ai/core";
import { getDatabaseAgentToolCatalog as getJiniDatabaseAgentToolCatalog } from "@jini-ai/db/tools";
import { TOVU_DATABASE_MESSAGES } from "./db-messages.js";

/** Bind Tovu's database messages to the @jini-ai/db/tools catalog; package defaults are product-neutral. */
export function getDatabaseAgentToolCatalog(): AgentToolDefinition[] {
  return getJiniDatabaseAgentToolCatalog({}, { messages: TOVU_DATABASE_MESSAGES });
}
export type { AgentToolDefinition, AgentToolSideEffect, AgentToolActorClassRule } from "@jini-ai/core";
