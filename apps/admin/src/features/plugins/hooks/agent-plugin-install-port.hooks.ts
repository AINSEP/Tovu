import type { AdminAgentPlugin } from "@/lib/api";

/**
 * @file What `use-agent-plugin-install.hooks.ts` needs from outside: the "Add a plugin" upload
 * (`AGENT_PLUGIN_INSTALL_ZIP`) and a SHA-256 of the chosen file. Agent Plugins have their own
 * store and lifecycle, so this is not `plugin-install-port.hooks.ts`'s site-plugin transport.
 */
export interface AgentPluginInstallResult {
  /** True when these exact bytes were already installed; the server changed nothing. */
  alreadyInstalled: boolean;
  /** The installed row in `listAgentPlugins`' shape, switched off on a fresh install. */
  agentPlugin: AdminAgentPlugin | null;
}

export interface AgentPluginInstallPort {
  installZip(required: { file: File; sha256: string }, optional?: Record<string, never>): Promise<AgentPluginInstallResult>;
  /** Lowercase hex SHA-256 of the file's bytes, so the server can refuse a damaged upload. */
  sha256(required: { file: File }, optional?: Record<string, never>): Promise<string>;
}
