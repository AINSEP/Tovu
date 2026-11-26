/** Tovu wiring for Jini's automatic-use owner. No plugin identities or matching rules live here. */
import { type AutomaticAgentPluginPorts } from '@jini-ai/agent-plugins/lifecycle';
import { bindAutomaticGuidanceResolver, createScopedAutomaticPluginRuns } from '@jini-ai/agent-plugins/site/automatic-agent-plugins';
import { type AgentToolDefinition, type AgentToolSideEffect, type SurfaceEmitter } from '@jini-ai/core';
import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import type { ChatDeleteSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import { loadAgentPluginSearchCandidates, type AgentPluginSearchToolDeps } from './tool-registrations.js';
import { formatPluginToolPointer } from './bundled-catalog.js';
import type { AgentPluginPreferencesPort } from '@jini-ai/agent-plugins/site/service-ports';
import { resolveAgentPluginGuidance, rankInstalledAgentPlugins } from './lifecycle.js';
import { agentPluginsToolMetadata as toolMetadata } from '../../contracts/core/tool-metadata/index.js';

/** Only the ports read by automatic plugin guidance and its settings write. */
export interface AutomaticPluginDeps extends AgentPluginSearchToolDeps {
  preferences: Pick<AgentPluginPreferencesPort, 'mode' | 'snapshot' | 'saveAuto'>;
  siteTitleReady: Promise<void>;
}

/** The feature's consent port; the assistant supplies its principal-bound exchange adapter. */
export type AskAgentPluginChoice = (required: {
  surfaces: ChatDeleteSurfaceDeps; principalId: string; emitSurface: SurfaceEmitter; signal: AbortSignal;
  workspaceId: string; conversationId: string; preferenceRevisionSeq: number; selected: readonly string[];
  matches: Parameters<AutomaticAgentPluginPorts['ask']>[0]['matches'];
}, optional?: Record<string, never>) => ReturnType<AutomaticAgentPluginPorts['ask']>;

/** Root-added tool contract; both roots register it before constructing tool search. */
export const agentPluginGuidanceCatalog = [{
  name: 'load_agent_plugin',
  description: 'Load guidance when asked to use or apply an Agent Plugin by pluginId before acting in its domain. For viewing its admin screen, use page.navigate with the entity target, then discover and click its details handle. Returns full guidance; optional skill selects a declared skill and file reads a supporting file relative to that skill folder (default SKILL.md). Requested files can be read even after guidance is loaded. Trusted off plugins can be read for setup guidance, clearly marked off; their tools remain unavailable. Chat exclusions still apply. Find ids with search_agent_plugin_local.',
  sideEffects: 'none', authorization: { permission: 'admin.assistant.use' },
  inputSchema: { type: 'object', additionalProperties: false, required: ['pluginId'], properties: { pluginId: { type: 'string', minLength: 1 }, skill: { type: 'string', minLength: 1 }, file: { type: 'string', minLength: 1 } } },
}] satisfies AgentToolDefinition[];

export const agentPluginGuidanceRisk = new Map<string, AgentToolSideEffect>([['load_agent_plugin', 'none']]);

export function createAutomaticPluginRuns({ deps, surfaces, askAgentPluginChoice }: { deps: AutomaticPluginDeps; surfaces: ChatDeleteSurfaceDeps; askAgentPluginChoice: AskAgentPluginChoice }, _options = {}) {
  return createScopedAutomaticPluginRuns({ deps: {
    workspaceId: deps.workspaceId,
    preferences: deps.preferences,
    siteTitleReady: deps.siteTitleReady,
    list: () => loadAgentPluginSearchCandidates(deps),
    rank: rankInstalledAgentPlugins,
    resolveForEntry: ({ workspaceId }) => bindAutomaticGuidanceResolver({ workspaceLayout: deps.agentPluginLayout.forWorkspace({ workspaceId }), resolveGuidance: resolveAgentPluginGuidance }),
    formatPluginToolPointer,
    catalog: agentPluginGuidanceCatalog,
    metadata: toolMetadata,
    derivedRisk: agentPluginGuidanceRisk,
    catalogModule: 'assistant/automatic-agent-plugins.ts',
    copy: {
      preferenceBeforeAnswer: 'Your Agent Plugins preference changed before this card opened. Nothing was changed. Start a new request using your current preference.',
      preferenceAfterAnswer: 'Your Agent Plugins preference changed while this card was open. Nothing was changed by this answer. Start a new request using your current preference.',
      loadNotes: ({ pluginId }) => ({
        loaded: '',
        'installed-but-inactive': `Read-only guidance from an installed, off plugin. Its tools remain unavailable. If tools are needed, offer plugins_set_enabled({family:"agent-plugin",pluginId:${JSON.stringify(pluginId)},enabled:true}) through the existing approval flow.`,
        excluded: 'This plugin is excluded from this chat. No guidance was loaded.',
        untrusted: 'This plugin failed the installed-package trust check. No guidance was loaded.',
        missing: 'This plugin was not found in this workspace’s installed catalog. No guidance was loaded.',
        off: 'Agent Plugins are off for this chat. No guidance was loaded.',
        cancelled: 'The plugin load was cancelled. No guidance was loaded.',
        unavailable: 'This plugin’s guidance could not be resolved. No guidance was loaded.',
      }),
    },
    warn: error => console.warn('[agent-plugins] automatic tool guidance unavailable', describeErrorForLog({ err: error })),
  }, surfaces, askAgentPluginChoice });
}
