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

/** Defs `@jini-ai/daemon`'s `AgentExecutor` cannot drive, kept out of the picker so the composer
 * never offers an agent whose run then fails (see this file's header). Empty as of 2026-07-30:
 * `antigravity` was the sole previous entry, deferred while its `AgentExecutor` support was
 * unbuilt; `agent-executor.ts`'s own module doc now documents it as one of the 5 `streamFormat:
 * 'plain'` defs the driver actually drives, via declarative `needsAgentLogFile`/`stdoutPolicy`/
 * `runtimeLock` fields (verified directly against the current source, not just the doc comment) —
 * this list drifting out of sync with that is exactly the kind of duplicated-guard bug
 * `assessAgentExecutorCompatibility`'s own doc warns about; `@jini-ai/daemon` doesn't export that
 * predicate publicly yet, so this hardcoded list is the interim mechanism until it does. */
const UNSUPPORTED_AGENT_IDS = new Set<string>([]);

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
