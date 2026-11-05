import { installOwnedJsonAgent, type McpLaunchSpec, type PlanContext } from "@jini-ai/mcp";

/** Thin host adapter: consent is checked by Jini before any personal-config I/O.
 * Only call after a RUN verdict with an effective personal-MCP grant; the card discloses outside settings.
 * @complexity O(config bytes), delegated to the existing Jini installer owner.
 */
export async function ensureJsonAgentInstall(
  required: { agentId: string; spec: McpLaunchSpec; ctx: PlanContext; allowed: boolean },
  optional: { install?: typeof installOwnedJsonAgent } = {},
): Promise<void> {
  await (optional.install ?? installOwnedJsonAgent)(required);
}
