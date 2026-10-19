/** Tovu wiring for Jini's automatic-use owner. No plugin identities or matching rules live here. */
import { createAutomaticAgentPluginUse, readChatAgentPluginState, type ChatAgentPluginState, type ChatAgentPlugins } from '@jini-ai/agent-plugins/lifecycle';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, ToolInputError, type AgentToolDefinition, type AgentToolSideEffect, type Principal, type SurfaceEmitter } from '@jini-ai/core';
import type { PrepareToolGuidance } from '@jini-ai/daemon';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { loadAgentPluginSearchCandidates } from '../features/agent-plugins/tool-registrations.js';
import { createSettingsPrincipalLookup } from '../features/settings/index.js';
import { ADMIN_INTERFACE_NAMESPACE, CHAT_AGENT_PLUGINS_KEY } from '../features/settings/admin-interface.js';
import type { RouteDeps } from '#src/server/routes/types';
import { resolveAgentPluginRefs, rankInstalledAgentPlugins } from '../features/agent-plugins/lifecycle.js';
import { toolMetadata } from '../contracts/core/tool-metadata/agent-plugins.js';
import { askAgentPluginChoice } from './ask-choice-tool.js';

/** Root-added tool contract; both roots register it before constructing tool search. */
export const agentPluginGuidanceCatalog = [{
  name: 'load_agent_plugin',
  description: 'Load one relevant Agent Plugin by pluginId before acting in its domain. Returns its real guidance and records it in the loaded-plugin chip. Only active, trusted plugins allowed for this chat can load. Find ids with search_agent_plugin_local.',
  sideEffects: 'none', authorization: { permission: 'admin.assistant.use' },
  inputSchema: { type: 'object', additionalProperties: false, required: ['pluginId'], properties: { pluginId: { type: 'string', minLength: 1 } } },
}] satisfies AgentToolDefinition[];

export const agentPluginGuidanceRisk = new Map<string, AgentToolSideEffect>([['load_agent_plugin', 'none']]);

export type AutomaticPluginDeps = Pick<RouteDeps, 'workspaceId' | 'agentPluginLayout' | 'settingsRepo' | 'getEffective' | 'set' | 'siteTitleReady' | 'authorize' | 'principalRepo' | 'clock' | 'idGen'>;
export interface AutomaticPluginRun {
  principal: Principal; conversationId: string; state: ChatAgentPluginState; query: string; pinned: readonly string[];
  signal: AbortSignal; emitSurface: SurfaceEmitter;
  publish(input: { conversationId: string; state: ChatAgentPluginState; plugins: readonly { id: string; name: string }[] }): Promise<void>;
}

/** Run-scoped controllers share preflight and the actual authorized tool gate. Cleanup is explicit.
 * @returns start/forget, the read-only guidance loader and the tool preparation hook.
 * @complexity One controller per live run; catalog/resolution costs remain in the injected owners.
 */
export function createAutomaticPluginRuns({ deps, surfaces }: { deps: AutomaticPluginDeps; surfaces: AssistantSurfaceDeps }, _options = {}) {
  const runs = new Map<string, { controller: ReturnType<typeof createAutomaticAgentPluginUse>; principalId: string }>();
  async function start({ runId, context }: { runId: string; context: AutomaticPluginRun }, _options = {}): Promise<string> {
    // core.interface definitions are in this existing boot chain, after the UI-tab definitions.
    await deps.siteTitleReady;
    const effective = await deps.getEffective({ repo: deps.settingsRepo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, scopeContext: { workspaceId: deps.workspaceId, principalId: context.principal.id } });
    if (context.signal.aborted) return '';
    const mode: ChatAgentPlugins = effective?.value === 'ask' || effective?.value === 'off' ? effective.value : 'auto';
    const controller = createAutomaticAgentPluginUse({ mode, state: readChatAgentPluginState({ value: context.state }), ports: {
      list: () => loadAgentPluginSearchCandidates(deps),
      rank: (input) => rankInstalledAgentPlugins(input.query.slice(0, 16000), input.candidates, input.limit, { automatic: true }),
      resolve: async ({ pluginId }) => {
        const result = await resolveAgentPluginRefs([pluginId], deps.agentPluginLayout.forWorkspace(deps.workspaceId), 'inject');
        return result.ok ? result.promptPrefix : '';
      },
      ask: ({ matches, signal }) => askAgentPluginChoice({ surfaces, principalId: context.principal.id, emitSurface: context.emitSurface, signal: signal ?? context.signal, matches }),
      saveAuto: async () => {
        await deps.set({ deps: { repo: deps.settingsRepo, clock: { nowMs: () => Date.parse(deps.clock.nowIso()) }, ids: deps.idGen, authorize: deps.authorize,
          principals: createSettingsPrincipalLookup({ repo: deps.principalRepo }) }, input: { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, value: 'auto', scope: 'user',
          workspaceId: deps.workspaceId, principalId: context.principal.id, callerPrincipalId: context.principal.id, authWorkspaceId: deps.workspaceId } });
      },
      publish: async value => { await context.publish({ conversationId: context.conversationId, ...value }); },
    } });
    runs.set(runId, { controller, principalId: context.principal.id });
    // An Off event clears an earlier usage strip without reading the catalog or loading guidance.
    if (mode === 'off') await context.publish({ conversationId: context.conversationId, state: context.state, plugins: [] });
    return controller.prepare({ query: context.query, loaded: context.pinned });
  }
  const prepareGuidance: PrepareToolGuidance = async ({ run, tool, signal }) => {
    try { return await runs.get(run.id)?.controller.prepare({ ...(tool.metadata?.guidanceCapabilities ? { capabilities: tool.metadata.guidanceCapabilities } : {}), signal }) ?? ''; }
    catch { console.warn('[agent-plugins] automatic tool guidance unavailable'); return ''; }
  };
  // Existing per-plugin tools read their boot-time source, not the run's consent/exclusion owner.
  // This small id loader uses the SAME trusted pinned-ref resolver as the capability backstop.
  const loadRegistration = buildDomainRegistrations({
    domain: 'agent-plugin-guidance', catalogModule: 'assistant/automatic-agent-plugins.ts',
    catalog: indexCatalogById({ catalog: agentPluginGuidanceCatalog }),
    metadata: toolMetadata,
    derivedRisk: agentPluginGuidanceRisk,
    handlers: { load_agent_plugin: async ({ input: raw, run, principal, signal }) => {
      const input = requireInputRecord({ input: raw });
      const pluginId = requireString({ input, key: 'pluginId' });
      if (Object.keys(input).some(key => key !== 'pluginId')) throw new ToolInputError({ message: 'Only pluginId is accepted' });
      const entry = runs.get(run.id);
      if (!entry || entry.principalId !== principal.id) throw new Error('Agent Plugin run is unavailable');
      const guidance = await entry.controller.load({ pluginId, signal });
      return { pluginId, guidance, ...(!guidance ? { note: 'Guidance already loaded or unavailable for this chat.' } : {}) };
    } },
  })[0]!;
  return { start, prepareGuidance, loadRegistration, forget: ({ runId }: { runId: string }, _options = {}) => { runs.delete(runId); } };
}
