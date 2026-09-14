import { api, type AdminAgentPlugin, type AdminAgentPluginFiles } from "@/lib/api";
import type { AgentPluginsPort } from "./agent-plugins-port.hooks";

/**
 * @file The only place under `features/plugins`'s Agent Plugins screen hook that reaches
 * `lib/api` — see `agent-plugins-port.hooks.ts` for why the split exists. Mirrors `plugins-
 * dependencies.hooks.ts`'s identical split for `Plugins.tsx`.
 */

/** The live implementation, as a module-level singleton — matches `defaultPluginsPort`. */
export const defaultAgentPluginsPort: AgentPluginsPort = {
  listAgentPlugins: () => api.listAgentPlugins(),
  setAgentPluginEnabled: (pluginId, input) => api.setAgentPluginEnabled(pluginId, input),
  getAgentPluginFiles: (pluginId) => api.getAgentPluginFiles(pluginId),
};

/** Seed state for {@link createFakeAgentPluginsPort}. */
export interface FakeAgentPluginsPortOptions {
  agentPlugins?: AdminAgentPlugin[];
  /** Makes `setAgentPluginEnabled` reject with this instead of writing — for the hook's own
   *  failure-path test. The seeded `enabled` value is left untouched, so a test can then assert the
   *  UI did not keep a toggle the server refused. */
  failToggleWith?: unknown;
  /** Resolves each `setAgentPluginEnabled` call only when the returned `settle` is invoked, so a
   *  test can hold two toggles in flight at once and settle them out of order. Without it the fake
   *  resolves immediately. */
  deferToggles?: boolean;
  /** `AGENT_PLUGIN_FILES` responses by plugin id; an id with no entry rejects like the route's 404. */
  files?: Readonly<Record<string, AdminAgentPluginFiles>>;
}

/**
 * An in-memory {@link AgentPluginsPort} for tests — mirrors `createFakePluginsPort`'s identical
 * role for `PluginsPort`.
 *
 * The toggle really mutates the fake's own copy and echoes the row back, so a test asserting the
 * post-toggle UI is reading state that round-tripped through the port rather than a value the
 * component kept locally.
 */
export function createFakeAgentPluginsPort(options: FakeAgentPluginsPortOptions = {}): AgentPluginsPort & {
  /** Pending `setAgentPluginEnabled` resolvers, in call order — only populated with `deferToggles`. */
  readonly pendingToggles: Array<() => void>;
} {
  const agentPlugins = [...(options.agentPlugins ?? [])];
  const pendingToggles: Array<() => void> = [];

  return {
    pendingToggles,
    async listAgentPlugins() {
      return { agentPlugins: [...agentPlugins] };
    },
    async setAgentPluginEnabled(pluginId, { enabled }) {
      if (options.failToggleWith !== undefined) throw options.failToggleWith;
      const index = agentPlugins.findIndex((plugin) => plugin.pluginId === pluginId);
      if (index < 0) throw new Error(`fake port: '${pluginId}' is not installed`);
      const updated: AdminAgentPlugin = { ...agentPlugins[index]!, enabled };
      agentPlugins[index] = updated;
      if (options.deferToggles) await new Promise<void>((resolve) => pendingToggles.push(resolve));
      return { agentPlugin: updated };
    },
    async getAgentPluginFiles(pluginId) {
      const listing = options.files?.[pluginId];
      if (!listing) throw new Error(`fake port: '${pluginId}' is not installed`);
      return listing;
    },
  };
}
