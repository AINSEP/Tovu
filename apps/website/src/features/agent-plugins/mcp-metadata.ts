/**
 * @file Tovu binding to Jini's Agent Plugins v1.0.0 transport and metadata parser.
 * This open standard is distinct from .tovu-plugin's integrity/sdkRange/tier/capability format;
 * their contracts cannot be unified. Parsing receives a JS value and performs no file I/O.
 *
 * Jini owns portable authMode/defaultTools metadata, validation and legacy compatibility.
 * Only plugin.json metadata can authorize operator reads; legacy MCP entries still supply
 * auth and sign-in grants. Remote hints may veto read trust but never supply it.
 */
export { parseAgentPluginMcpConfig } from "@jini-ai/agent-plugins/lifecycle";
export type {
  AgentPluginMcpConfig, ParseAgentPluginMcpConfigResult, McpServerConfig, RemoteMcpServerConfig,
} from "@jini-ai/agent-plugins/lifecycle";
