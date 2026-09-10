import type { AdminAgentPlugin } from "@/lib/api";

/**
 * @file What `use-agent-plugins.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Same `useX(dependencies)` / `useWiredX()` pair `plugins-port.hooks.ts`
 * establishes for this feature's sibling screen (`Plugins.tsx`).
 *
 * Read-only, unlike `PluginsPort`: the admin Agent Plugins screen has no enable/disable/install
 * mutation yet (see `modules/agent-plugins.ts`'s own header for why this dispatch's scope is a read
 * path only), so there is no second method to mirror `setPluginEnabled`.
 */
export interface AgentPluginsPort {
  listAgentPlugins(): Promise<{ agentPlugins: AdminAgentPlugin[] }>;
}
