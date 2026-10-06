/**
 * @file The agent-CLI picker's inventory for the desktop chat (`runner:agents:list`/`rescan`).
 *
 * Same probe the site assistant's Local CLI picker runs (`apps/website/src/assistant/agents.ts`),
 * reshaped to the desktop contract's `RunnerAgentSummary`. Only runtimes that can take external
 * tools are listed: the desktop agent's whole tool surface arrives through the injected `jini` MCP
 * bridge, so a runtime that cannot load MCP would chat with no tools at all.
 *
 * Cached once per process like the site's: a PATH probe spawns every installed CLI for its version
 * and model list, which is far too slow to repeat on every pane mount. `rescan` forces a fresh one.
 */
import type { RuntimeAgentDef } from "@jini-ai/agent-runtime";
import type { RunnerAgentSummary } from "./contracts/runtime-inventory.ts";

/** The slice of `@jini-ai/agent-runtime` this module reads — injected so tests probe nothing. */
interface AgentRuntimePorts {
  defs: readonly RuntimeAgentDef[];
  resolveLaunch: (required: { def: RuntimeAgentDef }) => { launchPath?: string | null; diagnostic?: string | null };
  probeModels: (required: { def: RuntimeAgentDef }) => Promise<{ models: RuntimeAgentDef["fallbackModels"] }>;
  supportsTools: (required: { def: RuntimeAgentDef }) => boolean;
}

/**
 * One def's summary. Probes models only for an installed CLI; an absent one shows its fallbacks and
 * says why it is unavailable.
 * @complexity O(1) plus one model probe when available.
 */
async function summarizeAgent(def: RuntimeAgentDef, ports: AgentRuntimePorts): Promise<RunnerAgentSummary> {
  const launch = ports.resolveLaunch({ def });
  const available = Boolean(launch.launchPath);
  const models = available ? (await ports.probeModels({ def }).catch(() => ({ models: def.fallbackModels }))).models : def.fallbackModels;
  return {
    id: def.id,
    name: def.name,
    available,
    version: null,
    models: models.map(({ id, label }) => ({ id, label })),
    reasoningOptions: (def.reasoningOptions ?? []).map(({ id, label }) => ({ id, label })),
    ...(def.supportsCustomModel === undefined ? {} : { supportsCustomModel: def.supportsCustomModel }),
    ...(available ? {} : { diagnostic: launch.diagnostic ?? `${def.name} CLI not found on PATH` }),
  };
}

/**
 * The cached lister the IPC layer calls. Installed CLIs sort first so the picker's default is usable.
 * @complexity O(n) defs per probe, probes run concurrently.
 */
function createAgentInventory(ports: AgentRuntimePorts): (required: { rescan: boolean }) => Promise<RunnerAgentSummary[]> {
  let cached: Promise<RunnerAgentSummary[]> | null = null;
  const probe = () => {
    const pending = Promise.all(ports.defs.filter((def) => ports.supportsTools({ def })).map((def) => summarizeAgent(def, ports)))
      .then((rows) => [...rows].sort((a, b) => Number(b.available) - Number(a.available)));
    // A failed probe must not poison the cache forever.
    pending.catch(() => { if (cached === pending) cached = null; });
    cached = pending;
    return pending;
  };
  return ({ rescan }) => (rescan || cached === null ? probe() : cached);
}

export { createAgentInventory, summarizeAgent };
export type { AgentRuntimePorts };
