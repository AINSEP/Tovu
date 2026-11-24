/**
 * Browser-safe agent-inventory contract shared by the Electron main process
 * and renderer. Keep this deliberately small: it is a picker DTO, not a way
 * to expose host capabilities to web content. The DTO itself is
 * `AgentInventorySummary` in `@jini-ai/core/contracts/agents/inventory`; the
 * IPC channel names below are this host's.
 */
export const RUNNER_AGENT_INVENTORY_CHANNELS = {
  list: 'runner:agents:list',
  rescan: 'runner:agents:rescan',
  daemonOnline: 'runner:daemon:online',
} as const;

