import type { AdminAgentPlugin, AdminAgentPluginFiles } from "@/lib/api";

/**
 * @file What `use-agent-plugins.hooks.ts` needs from the outside world, as an interface rather than
 * a direct `lib/api` import. Same `useX(dependencies)` / `useWiredX()` pair `plugins-port.hooks.ts`
 * establishes for this feature's sibling screen (`Plugins.tsx`).
 *
 * `setAgentPluginEnabled` resolves to the ONE updated row, unlike `PluginsPort`'s own
 * `setPluginEnabled` (which resolves to a change-set id and leaves its caller to re-fetch the whole
 * list). The row comes back in `listAgentPlugins`' exact shape, so the hook replaces one entry in
 * place — no second GET, and no window in which an unrelated row could be clobbered by a reload
 * that settled after a newer toggle.
 */
export interface AgentPluginsPort {
  listAgentPlugins(): Promise<{ agentPlugins: AdminAgentPlugin[] }>;
  setAgentPluginEnabled(required: { pluginId: string; input: { enabled: boolean } }, optional?: Record<string, never>): Promise<{ agentPlugin: AdminAgentPlugin }>;
  /** `AGENT_PLUGIN_FILES` — the read-only package-files listing behind the row's eye button
   *  (`use-agent-plugin-details-modal.hooks.ts`). */
  getAgentPluginFiles(required: { pluginId: string }, optional?: Record<string, never>): Promise<AdminAgentPluginFiles>;
}
