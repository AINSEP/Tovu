/**
 * @file Tovu's binding for the Agent Plugin branch of `plugins_uninstall`
 * (`@jini-ai/agent-plugins/site/uninstall-tool`): this host's lifecycle owner, approval owner,
 * confirmation dialog and model-facing copy. The composition root adds it to the deps bag at the one
 * call site (`server/runtime/composition/plugin-host.ts`).
 */
import type { AgentPluginUninstallHost, AgentPluginUninstallToolDeps } from "@jini-ai/agent-plugins/site/uninstall-tool";
import { PLUGINS_UNINSTALL_TOOL_ID } from "@jini-ai/plugins/runtime/uninstall-confirmation-ui";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { PLUGIN_HOST_COPY } from "../plugin-runtime/plugin-host-copy.js";
import { previewAgentPluginUninstall, uninstallAgentPlugin } from "./lifecycle.js";
import { describeAgentPluginUninstallApproval } from "./uninstall-confirmation-ui.js";

/** Tovu's lifecycle, approval and dialog owners plus the names its notes give the model. */
export const agentPluginUninstallHost: AgentPluginUninstallHost = {
  previewAgentPluginUninstall,
  uninstallAgentPlugin,
  approvalToolHandler,
  notConfirmedResult,
  describeApproval: describeAgentPluginUninstallApproval,
  copy: { productName: PLUGIN_HOST_COPY.productName, uninstallToolName: PLUGINS_UNINSTALL_TOOL_ID, externalMcpSettingsPath: "Integrations → External MCP" },
};

/** A host deps bag before the composition root adds {@link agentPluginUninstallHost}. */
export type AgentPluginUninstallHostDeps = Omit<AgentPluginUninstallToolDeps, "uninstallHost">;
