/**
 * @file Tovu metadata adapter around Jini's pinned Agent Plugins v1.0.0 manifest/transport parser.
 * Grammar rationale lives at Jini packages/agent-plugins/src/lifecycle/manifest.ts.
 * This open standard is distinct from .tovu-plugin's integrity/sdkRange/tier/capability format;
 * their contracts cannot be unified. Parsing receives a JS value and performs no file I/O.
 *
 * Tovu auth metadata belongs to plugin.json's extensions.tovu.mcpServers[serverId], since the
 * open standard leaves auth discovery, interaction and credential storage to the client.
 * tovuAuthMode selects oauth/none (absent means none); tovuDefaultTools names allow/write/read.
 * write requires allow and must be its subset; read must be its subset when allow is present.
 * Read-only metadata without allow leaves sign-in grants unchanged. Remote hints may veto read
 * trust but never supply it. Legacy MCP-entry auth/sign-in defaults remain readable but cannot
 * authorize operator reads; readTovuServerMetadata below owns that boundary.
 * tovuTokenAuth supplies token fallback help/probe URLs; tovuRenamedTools preserves saved selections.
 * Malformed server entries are excluded without rejecting valid siblings; declared IDs remain
 * available even when transport config is invalid. Jini owns validation of URLs and metadata lists.
 */
import { parseAgentPluginMcpConfig as parseMcpConfig } from "@jini-ai/agent-plugins/lifecycle";
import type { AgentPluginDefaultTools, AgentPluginTokenAuth, StdioMcpServerConfig } from "@jini-ai/agent-plugins/lifecycle";

export interface RemoteMcpServerConfig {
  readonly type: "streamable-http" | "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly tovuAuthMode?: "oauth" | "none";
  readonly tovuDefaultTools?: AgentPluginDefaultTools;
  readonly tovuTokenAuth?: AgentPluginTokenAuth;
  readonly tovuRenamedTools?: Readonly<Record<string, string>>;
}
export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig;
export interface AgentPluginMcpConfig {
  readonly serverIds: readonly string[];
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}
export type ParseAgentPluginMcpConfigResult =
  | { readonly ok: true; readonly config: AgentPluginMcpConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Legacy MCP entries still supply auth and sign-in grants, but cannot authorize operator reads.
 * Only plugin.json's extensions.tovu.mcpServers[serverId].tovuDefaultTools can declare read trust.
 * Do not validate here: Jini must exclude the server for every malformed list, URL or rename map.
 * @complexity O(n) in the bounded default-tools object.
 */
function readTovuServerMetadata({ server, value }: { readonly server: Readonly<Record<string, unknown>>; readonly value: Readonly<Record<string, unknown>> }) {
  const legacyDefaults = isObject(server.tovuDefaultTools)
    ? Object.fromEntries(Object.entries(server.tovuDefaultTools).filter(([key]) => key !== "read"))
    : server.tovuDefaultTools;
  return {
    authMode: value.tovuAuthMode ?? server.tovuAuthMode,
    defaultTools: value.tovuDefaultTools ?? legacyDefaults,
    tokenAuth: server.tovuTokenAuth,
    renamedTools: server.tovuRenamedTools,
  };
}

/** Translate host wire names around the shared parser, retaining all declared ids and only valid
 * transport configs. Null-prototype output prevents hostile server ids mutating object prototypes.
 * @complexity O(s + n) in servers and their bounded metadata lists.
 */
export function parseAgentPluginMcpConfig(
  { value }: { readonly value: unknown },
  optional: { readonly pluginManifest?: unknown } = {},
): ParseAgentPluginMcpConfigResult {
  const parsed = parseMcpConfig({ value, extensionNamespace: "tovu" }, { ...optional, readServerMetadata: readTovuServerMetadata });
  if (!parsed.ok) return parsed;
  const servers: Record<string, McpServerConfig> = Object.create(null);
  for (const [id, server] of Object.entries(parsed.config.servers)) {
    if (server.type === "stdio") { servers[id] = server; continue; }
    const { authMode, defaultTools, tokenAuth, renamedTools, ...transport } = server;
    servers[id] = {
      ...transport,
      ...(authMode !== undefined ? { tovuAuthMode: authMode } : {}),
      ...(defaultTools !== undefined ? { tovuDefaultTools: defaultTools } : {}),
      ...(tokenAuth !== undefined ? { tovuTokenAuth: tokenAuth } : {}),
      ...(renamedTools !== undefined ? { tovuRenamedTools: renamedTools } : {}),
    };
  }
  return { ok: true, config: { serverIds: parsed.config.serverIds, servers } };
}
