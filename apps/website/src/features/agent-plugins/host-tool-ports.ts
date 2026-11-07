/**
 * @file Binds Jini's Agent Plugin host-tools ports (`@jini-ai/agent-plugins/lifecycle/host-tools`) to
 * this product's lifecycle, activation effects, plugin memory, frontmatter reader, tool metadata,
 * permission names and text. The moved tools read only through these ports, so each answer, schema
 * and approval stays what it was before the move.
 */
import type { AgentPluginHostToolPorts, HostToolsLifecyclePort } from "@jini-ai/agent-plugins/lifecycle/host-tools";
import { toolMetadata } from "../../contracts/core/tool-metadata/agent-plugins.js";
import { readFrontmatterField } from "#src/platform/markdown/frontmatter";
import { agentPluginActivations } from "./activation-effects.js";
import { readInstalledMcpServerIds, readInstalledSkillMarkdown } from "./capability-projection.js";
import type { AgentPluginLayout } from "./layout.js";
import {
  containAgentPluginStatePath, isInstalledDigestPresent, listInstalledPlugins, normalizePackageEntryPath, preferBundledAgentPluginDigests,
  rankInstalledAgentPlugins, readBundledAgentPluginDigests, readInstalledSkillFile,
} from "./lifecycle.js";
import { appendPluginNotes, pluginMemory } from "./memory.js";

/** The permission names the moved tools declare and check. */
export const AGENT_PLUGIN_HOST_TOOL_PERMISSIONS = { use: "admin.assistant.use", enable: "admin.plugins.enable" } as const;

/** Ends each `agent_plugin_<id>` description: how the assistant reaches the plugin's admin screen. */
export const AGENT_PLUGIN_TOOL_NAVIGATION =
  "For viewing this plugin's admin screen, use page.navigate with its entity target, then discover and click its details handle.";

/** Today's positional lifecycle functions, called with the object arguments the port names. */
const lifecycle: HostToolsLifecyclePort = {
  listInstalledPlugins: ({ workspaceRoot }) => listInstalledPlugins(workspaceRoot),
  readBundledAgentPluginDigests: ({ workspaceRoot }) => readBundledAgentPluginDigests(workspaceRoot),
  preferBundledAgentPluginDigests: ({ installed, bundled }) => preferBundledAgentPluginDigests(installed, bundled),
  isInstalledDigestPresent: ({ packagesDir, archiveDigest }) => isInstalledDigestPresent(packagesDir, archiveDigest),
  readInstalledSkillMarkdown: ({ packageRoot, skillPath }) => readInstalledSkillMarkdown(packageRoot, skillPath),
  readInstalledSkillFile: (input, options) => readInstalledSkillFile(input, options),
  readInstalledMcpServerIds: ({ packageRoot }) => readInstalledMcpServerIds(packageRoot),
  rankInstalledAgentPlugins: ({ query, candidates, limit }) => rankInstalledAgentPlugins(query, candidates, limit),
  normalizePackageEntryPath: ({ rawEntryPath }) => normalizePackageEntryPath(rawEntryPath),
};

/**
 * The host-tools ports for one booted layout. Every workspace path is still resolved per call through
 * `agentPluginLayout.forWorkspace`, exactly where the tools resolved it before.
 * @complexity O(1); each port defers its I/O to the call.
 */
export function agentPluginHostToolPorts(required: { readonly agentPluginLayout: AgentPluginLayout }, _optional: Record<string, never> = {}): AgentPluginHostToolPorts {
  const layout = required.agentPluginLayout;
  return {
    lifecycle,
    activations: agentPluginActivations,
    layout: { forWorkspace: ({ workspaceId }) => layout.forWorkspace(workspaceId) },
    memory: {
      pluginMemory: ({ workspaceId, pluginId }) => pluginMemory({ contain: containAgentPluginStatePath, workspaceId, pluginId }, { layout }),
      appendNotes: ({ workspaceId, pluginId, guidance }) => appendPluginNotes({ contain: containAgentPluginStatePath,
        workspaceRoot: layout.forWorkspace(workspaceId).root, pluginId, guidance }),
    },
    permissions: AGENT_PLUGIN_HOST_TOOL_PERMISSIONS,
    readFrontmatterField: ({ markdown, key }) => readFrontmatterField(markdown, key),
    metadata: toolMetadata,
    messages: { pluginToolNavigation: AGENT_PLUGIN_TOOL_NAVIGATION },
  };
}
