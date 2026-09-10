import { api, type AdminAgentPlugin } from "@/lib/api";
import type { AgentPluginsPort } from "./agent-plugins-port.hooks";

/**
 * @file The only place under `features/plugins`'s Agent Plugins screen hook that reaches
 * `lib/api` — see `agent-plugins-port.hooks.ts` for why the split exists. Mirrors `plugins-
 * dependencies.hooks.ts`'s identical split for `Plugins.tsx`.
 */

/** The live implementation, as a module-level singleton — matches `defaultPluginsPort`. */
export const defaultAgentPluginsPort: AgentPluginsPort = {
  listAgentPlugins: () => api.listAgentPlugins(),
};

/** Seed state for {@link createFakeAgentPluginsPort}. */
export interface FakeAgentPluginsPortOptions {
  agentPlugins?: AdminAgentPlugin[];
}

/**
 * An in-memory {@link AgentPluginsPort} for tests — mirrors `createFakePluginsPort`'s identical
 * role for `PluginsPort`.
 */
export function createFakeAgentPluginsPort(options: FakeAgentPluginsPortOptions = {}): AgentPluginsPort {
  const agentPlugins = [...(options.agentPlugins ?? [])];

  return {
    async listAgentPlugins() {
      return { agentPlugins: [...agentPlugins] };
    },
  };
}
