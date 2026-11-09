/** Tovu compatibility shim (A8 seam, A9 move). The portable body lives in `@jini-ai/agent-plugins/connect`
 * and requires the host's projection pair, installed-package reads and trust rule; only these legacy
 * entries, whose frozen callers pass none of them, bind Tovu's owners: the pair via
 * `agentPluginMcpPortsOf`, the lifecycle reads below and `capability-projection.ts`'s trust rule. A
 * caller that already carries projections keeps its own pair (same function and error identity). */
import { withAgentPluginMcpPorts, withOverrides } from "./mcp-host-bindings.js";
import {
  planAgentPluginMcpFederation as planWithTrust, provisionAgentPluginMcpServers as provisionWithPorts,
  resolveAgentPluginMcpServers as resolveWithReads, resolveAgentPluginReadOnlyRemoteNames as readOnlyNamesWithReads,
  type AgentPluginInstalledMcpReads, type AgentPluginMcpFederationMessages, type AgentPluginMcpFederationPlan, type AgentPluginMcpTrustClassifier,
  type ProvisionAgentPluginMcpServersInput as PortableProvisionInput, type ProvisionAgentPluginMcpServersResult,
} from "@jini-ai/agent-plugins/connect";
import { classifyAgentPluginMcpServerTrust, readInstalledMcpServers } from "./capability-projection.js";
import { listInstalledPlugins, preferBundledAgentPluginDigests, readBundledAgentPluginDigests } from "./lifecycle.js";
import type { McpServerConfig } from "./mcp-metadata.js";
import type { AgentPluginMcpContext, AgentPluginMcpPort } from "./service-ports.js";
export {
  deriveAgentPluginConnectionId, findAgentPluginMcpServerDefaults, isEmptyJsonList,
  type SkippedAgentPluginMcpServer, type AgentPluginMcpTrustClassifier, type PlannedAgentPluginMcpUpsert,
  type AgentPluginMcpFederationPlan, type ProvisionAgentPluginMcpServersResult,
} from "@jini-ai/agent-plugins/connect";

/** Tovu's lifecycle owner, adapted to the portable object-argument reads (same functions, same order). */
export const tovuInstalledMcpReads: AgentPluginInstalledMcpReads = {
  listInstalledPlugins: ({ workspaceRoot }) => listInstalledPlugins(workspaceRoot),
  readBundledAgentPluginDigests: ({ workspaceRoot }) => readBundledAgentPluginDigests(workspaceRoot),
  preferBundledAgentPluginDigests: ({ installed, bundled }) => preferBundledAgentPluginDigests(installed, bundled),
  readInstalledMcpServers: ({ packageRoot }) => readInstalledMcpServers(packageRoot),
};

/** Tovu's skip-reason copy (names Tovu's store). Bytes unchanged from the pre-move body. */
export const tovuFederationMessages: AgentPluginMcpFederationMessages = {
  sseTransportUnsupported: () => "declares the legacy 'sse' transport, which this Tovu version's external-MCP store does not support (only stdio/streamable_http)",
  headersUnsupported: () => "declares HTTP headers, which this Tovu version's external-MCP store does not persist — refusing to provision a row that silently drops them",
};

export type ProvisionAgentPluginMcpServersInput = Omit<PortableProvisionInput, "classifyTrust" | "messages"> & { readonly classifyTrust?: AgentPluginMcpTrustClassifier };

export function planAgentPluginMcpFederation(input: { readonly servers: Readonly<Record<string, McpServerConfig>> }, options: { readonly classifyTrust?: AgentPluginMcpTrustClassifier } = {}): AgentPluginMcpFederationPlan {
  return planWithTrust(input, { classifyTrust: options.classifyTrust ?? classifyAgentPluginMcpServerTrust, messages: tovuFederationMessages });
}

export function resolveAgentPluginMcpServers(input: Omit<Parameters<typeof resolveWithReads>[0], "lifecycle">, _optional = {}): Promise<Readonly<Record<string, McpServerConfig>>> {
  // Descriptor-preserving: a fixture's lazy layout getter is read only where the body reads it.
  return resolveWithReads(withOverrides(input, { lifecycle: tovuInstalledMcpReads }));
}

export function resolveAgentPluginReadOnlyRemoteNames(input: Omit<Parameters<typeof readOnlyNamesWithReads>[0], "lifecycle">, _optional = {}): Promise<ReadonlySet<string>> {
  return readOnlyNamesWithReads(withOverrides(input, { lifecycle: tovuInstalledMcpReads }));
}

export function provisionAgentPluginMcpServers(
  deps: AgentPluginMcpContext & Pick<AgentPluginMcpPort, "repo" | "saveServer"> & Partial<Pick<AgentPluginMcpPort, "notifyRosterChanged">>,
  input: ProvisionAgentPluginMcpServersInput,
): Promise<ProvisionAgentPluginMcpServersResult> {
  return provisionWithPorts(withAgentPluginMcpPorts(deps), withOverrides(input, { classifyTrust: input.classifyTrust ?? classifyAgentPluginMcpServerTrust, messages: tovuFederationMessages }));
}
