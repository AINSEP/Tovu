/**
 * @file ADR-049 Decision 5 — replaces the deleted, Claude-only `listAgents()` (old
 * `src/agent-chat/runner.ts`) with a real probe across `@jini-ai/agent-runtime`'s full 24-def
 * `AGENT_DEFS` registry. Every def is reported with its own truthfully-probed availability
 * (`AgentSummary.available`/`diagnostic`), matching `@jini-ai/http`'s `agents.ts` module doc:
 * "a hardcoded client-side agent list would enable the composer on machines where the run then
 * fails."
 */
import { AGENT_DEFS, resolveAgentLaunch } from "@jini-ai/agent-runtime";
import type { AgentSummary } from "@jini-ai/http-kit";

/** Streaming/prompt-delivery families `@jini-ai/daemon`'s `AgentExecutor` actually drives (its own
 * module doc: 23 of 24 defs — every family except `antigravity`, deliberately deferred upstream). */
const UNSUPPORTED_AGENT_IDS = new Set(["antigravity"]);

export async function listAssistantAgents(): Promise<AgentSummary[]> {
  return Promise.all(
    AGENT_DEFS.filter((def) => !UNSUPPORTED_AGENT_IDS.has(def.id)).map(async (def): Promise<AgentSummary> => {
      const launch = resolveAgentLaunch(def);
      const available = Boolean(launch.launchPath);
      return {
        id: def.id,
        name: def.name,
        available,
        supportsCustomModel: def.supportsCustomModel,
        models: def.fallbackModels,
        modelsSource: "fallback",
        ...(def.reasoningOptions ? { reasoningOptions: def.reasoningOptions } : {}),
        ...(available ? {} : { diagnostic: launch.diagnostic ?? `${def.name} CLI not found on PATH` }),
      };
    }),
  );
}
