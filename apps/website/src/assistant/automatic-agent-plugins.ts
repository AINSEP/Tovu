/** Tovu wiring for Jini's automatic-use owner. No plugin identities or matching rules live here. */
import { createAutomaticAgentPluginUse, readChatAgentPluginState, type ChatAgentPluginState, type ChatAgentPlugins } from '@jini-ai/agent-plugins/lifecycle';
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, requireString, optionalString, ToolInputError, type AgentToolDefinition, type AgentToolSideEffect, type Principal, type SurfaceEmitter } from '@jini-ai/core';
import type { PrepareToolGuidance } from '@jini-ai/daemon';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { loadAgentPluginSearchCandidates } from '../features/agent-plugins/tool-registrations.js';
import { formatPluginToolPointer } from '../features/agent-plugins/bundled-catalog.js';
import type { PluginMaturity } from '../features/agent-plugins/identity.js';
import { createSettingsPrincipalLookup } from '../features/settings/index.js';
import { ADMIN_INTERFACE_NAMESPACE, CHAT_AGENT_PLUGINS_KEY } from '../features/settings/admin-interface.js';
import type { AutomaticPluginDeps } from './host-contracts.js';
export type { AutomaticPluginDeps } from './host-contracts.js';
import { resolveAgentPluginGuidance, rankInstalledAgentPlugins } from '../features/agent-plugins/lifecycle.js';
import { toolMetadata } from '../contracts/core/tool-metadata/agent-plugins.js';
import { askAgentPluginChoice } from './ask-choice-tool.js';

/** Root-added tool contract; both roots register it before constructing tool search. */
export const agentPluginGuidanceCatalog = [{
  name: 'load_agent_plugin',
  description: 'Load one relevant Agent Plugin by pluginId before acting in its domain. Returns full guidance; optional skill selects a declared skill and file reads a supporting file relative to that skill folder (default SKILL.md). Requested files can be read even after guidance is loaded. Only active, trusted plugins allowed for this chat can load. Find ids with search_agent_plugin_local.',
  sideEffects: 'none', authorization: { permission: 'admin.assistant.use' },
  inputSchema: { type: 'object', additionalProperties: false, required: ['pluginId'], properties: { pluginId: { type: 'string', minLength: 1 }, skill: { type: 'string', minLength: 1 }, file: { type: 'string', minLength: 1 } } },
}] satisfies AgentToolDefinition[];

export const agentPluginGuidanceRisk = new Map<string, AgentToolSideEffect>([['load_agent_plugin', 'none']]);

export interface AutomaticPluginRun {
  principal: Principal; conversationId: string; state: ChatAgentPluginState; query: string; pinned: readonly string[];
  signal: AbortSignal; emitSurface: SurfaceEmitter;
  publish(input: { conversationId: string; state: ChatAgentPluginState; plugins: readonly { id: string; name: string }[] }): Promise<void>;
}

/** The stored chat Agent Plugins preference; anything but Ask or Off (including no value) is Auto. @complexity O(1). */
function chatAgentPluginsMode({ value }: { value: unknown }, _options = {}): ChatAgentPlugins {
  return value === 'ask' || value === 'off' ? value : 'auto';
}

/** Logical-turn controllers share preflight and the actual authorized tool gate. Cleanup is explicit.
 * @returns start/forget, the read-only guidance loader and the tool preparation hook.
 * @complexity O(1) identity lookup; one controller per live turn, one late answer per chat.
 */
export function createAutomaticPluginRuns({ deps, surfaces }: { deps: AutomaticPluginDeps; surfaces: AssistantSurfaceDeps }, _options = {}) {
  type Entry = { turnId: string; controller: ReturnType<typeof createAutomaticAgentPluginUse>; context: AutomaticPluginRun; abort: AbortController; pending: boolean; attempts: Set<string>; maturities: Map<string, PluginMaturity | undefined> };
  const turns = new Map<string, Entry>();
  const runs = new Map<string, Entry>();
  // A terminal attempt cannot publish its late answer. Hand it to the next turn in this chat.
  const lateAnswers = new Map<string, ChatAgentPluginState>();
  const chatKey = (context: AutomaticPluginRun) => JSON.stringify([context.principal.id, context.conversationId]);
  /** Release a detached, settled controller without deleting a replacement with the same id. O(1). */
  function releaseDetached(entry: Entry): void {
    if (!entry.pending && !entry.attempts.size && turns.get(entry.turnId) === entry) turns.delete(entry.turnId);
  }
  /** Bind an attempt to its logical turn; return its shared preflight note. Identity mismatches
   * throw before using consent. Settings/catalog effects stay in their existing ports.
   * @complexity O(1) ownership lookup plus the automatic-use owner's catalog work.
   */
  async function start({ runId, messageId, context }: { runId: string; messageId?: string; context: AutomaticPluginRun }, _options = {}): Promise<string> {
    // core.interface definitions are in this existing boot chain, after the UI-tab definitions.
    await deps.siteTitleReady;
    const effective = await deps.getEffective({ repo: deps.settingsRepo }, { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, scopeContext: { workspaceId: deps.workspaceId, principalId: context.principal.id } });
    if (context.signal.aborted) return '';
    // A restarted attempt still owns the same pending/answered question. Reuse the controller's
    // serialized preparation instead of rebuilding consent from the frozen request state.
    // Check after setup awaits so simultaneous starts cannot replace one another's controller.
    const turnId = messageId ?? runId;
    const existing = runs.get(runId) ?? turns.get(turnId);
    if (existing) return rejoin({ existing, runId, messageId, context });
    const current = withLateAnswer({ context });
    const mode = chatAgentPluginsMode({ value: effective?.value });
    const entry = createEntry({ mode, context: current, turnId, runId });
    turns.set(turnId, entry);
    runs.set(runId, entry);
    // An Off event clears an earlier usage strip without reading the catalog or loading guidance.
    if (mode === 'off') await current.publish({ conversationId: current.conversationId, state: current.state, plugins: [] });
    try { return await entry.controller.prepare({ query: current.query, loaded: current.pinned }); }
    finally { releaseDetached(entry); }
  }
  /** Attach a restarted attempt to its live turn's controller; refuses another principal, chat or turn.
   * @throws Error('Agent Plugin run is unavailable') on any identity mismatch. @complexity O(1). */
  function rejoin({ existing, runId, messageId, context }: { existing: Entry; runId: string; messageId?: string; context: AutomaticPluginRun }): Promise<string> {
    if (existing.context.principal.id !== context.principal.id || existing.context.conversationId !== context.conversationId || (messageId !== undefined && existing.turnId !== messageId)) throw new Error('Agent Plugin run is unavailable');
    existing.context = context;
    existing.attempts.add(runId);
    runs.set(runId, existing);
    return existing.controller.prepare({ query: context.query, loaded: context.pinned }).finally(() => releaseDetached(existing));
  }
  /** Fold a terminal attempt's late answer for this chat into the new turn, consuming it once. @complexity O(excluded). */
  function withLateAnswer({ context }: { context: AutomaticPluginRun }): AutomaticPluginRun {
    const lateAnswer = lateAnswers.get(chatKey(context));
    if (!lateAnswer) return context;
    lateAnswers.delete(chatKey(context));
    return { ...context, state: { ...lateAnswer, excluded: [...new Set([...context.state.excluded, ...lateAnswer.excluded])] } };
  }
  /** One logical turn's controller wired to the existing catalog, resolver, consent card and settings ports. */
  function createEntry({ mode, context, turnId, runId }: { mode: ChatAgentPlugins; context: AutomaticPluginRun; turnId: string; runId: string }): Entry {
    const abort = new AbortController();
    const maturities = new Map<string, PluginMaturity | undefined>();
    let entry: Entry;
    const controller = createAutomaticAgentPluginUse({ mode, state: readChatAgentPluginState({ value: context.state }), ports: {
      formatPluginToolPointer,
      list: async () => {
        const candidates = await loadAgentPluginSearchCandidates(deps);
        maturities.clear();
        for (const candidate of candidates) maturities.set(candidate.pluginId, candidate.maturity);
        return candidates;
      },
      rank: (input) => rankInstalledAgentPlugins(input.query.slice(0, 16000), input.candidates, input.limit, { automatic: true }),
      resolve: ({ pluginId, ...request }) => resolveAgentPluginGuidance({ pluginRefIds: [pluginId], workspaceLayout: deps.agentPluginLayout.forWorkspace(deps.workspaceId) }, { deliveryMode: 'inject', ...request }),
      ask: async ({ matches }) => {
        entry.pending = true;
        try {
          return await askAgentPluginChoice({ surfaces, principalId: context.principal.id,
            // A retry can replace this attempt while the card is open; its receipt belongs to the
            // current transcript emitter, just like the later plugin-state publication below.
            emitSurface: async emission => {
              // Detached turns already hand late consent to the next turn below. A terminal
              // lifecycle refuses emissions; recording must not turn that valid consent into an error.
              if (emission.channel === 'user_message' && !entry.attempts.size) return;
              await entry.context.emitSurface(emission);
            }, signal: abort.signal, matches });
        } finally { entry.pending = false; }
      },
      saveAuto: async () => {
        await deps.set({ deps: { repo: deps.settingsRepo, clock: { nowMs: () => Date.parse(deps.clock.nowIso()) }, ids: deps.idGen, authorize: deps.authorize,
          principals: createSettingsPrincipalLookup({ repo: deps.principalRepo }) }, input: { namespace: ADMIN_INTERFACE_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, value: 'auto', scope: 'user',
          workspaceId: deps.workspaceId, principalId: context.principal.id, callerPrincipalId: context.principal.id, authWorkspaceId: deps.workspaceId } });
      },
      publish: async value => {
        if (abort.signal.aborted) return;
        if (!entry.attempts.size) lateAnswers.set(chatKey(context), value.state);
        await entry.context.publish({ conversationId: context.conversationId, ...value });
      },
    } });
    entry = { turnId, controller, context, abort, pending: false, attempts: new Set([runId]), maturities };
    return entry;
  }
  const prepareGuidance: PrepareToolGuidance = async ({ run, tool, signal }) => {
    const entry = runs.get(run.id);
    if (!entry) return '';
    try { return await entry.controller.prepare({ ...(tool.metadata?.guidanceCapabilities ? { capabilities: tool.metadata.guidanceCapabilities } : {}), signal }); }
    catch { console.warn('[agent-plugins] automatic tool guidance unavailable'); return ''; }
    finally { releaseDetached(entry); }
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
      if (Object.keys(input).some(key => !['pluginId', 'skill', 'file'].includes(key))) throw new ToolInputError({ message: 'Only pluginId, skill and file are accepted' });
      const skill = optionalString({ input, key: 'skill' });
      const file = optionalString({ input, key: 'file' });
      const entry = runs.get(run.id);
      if (!entry || entry.context.principal.id !== principal.id) throw new Error('Agent Plugin run is unavailable');
      const result = await entry.controller.load({ pluginId, signal, ...(skill === undefined ? {} : { skill }), ...(file === undefined ? {} : { file }) }).finally(() => releaseDetached(entry));
      const id = JSON.stringify(pluginId);
      const notes = {
        loaded: '',
        'installed-but-inactive': `Installed but inactive. Request activation through plugins_set_enabled({family:"agent-plugin",pluginId:${id},enabled:true}) using its existing approval flow, then retry load_agent_plugin({pluginId:${id}}).`,
        excluded: 'This plugin is excluded from this chat. No guidance was loaded.',
        untrusted: 'This plugin failed the installed-package trust check. No guidance was loaded.',
        missing: 'This plugin was not found in this workspace’s installed catalog. No guidance was loaded.',
        'already-loaded': 'This plugin’s guidance is already loaded for this chat.',
        off: 'Agent Plugins are off for this chat. No guidance was loaded.',
        cancelled: 'The plugin load was cancelled. No guidance was loaded.',
        unavailable: 'This plugin’s guidance could not be resolved. No guidance was loaded.',
      };
      const maturity = entry.maturities.get(pluginId);
      return { pluginId, ...result, ...(maturity ? { maturity } : {}), ...(result.status !== 'loaded' ? { note: notes[result.status] } : {}) };
    } },
  })[0]!;
  /** Dispose an attempt alias. Durable attempt replacement retains a pending exchange until its
   * answer/normal exchange expiry; explicit disposal aborts it. O(1), no persistent writes.
   */
  function forget({ runId }: { runId: string }, { preservePending = false } = {}): void {
    const entry = runs.get(runId);
    if (!entry) return;
    runs.delete(runId);
    entry.attempts.delete(runId);
    if (entry.attempts.size || (preservePending && entry.pending)) return;
    entry.abort.abort();
    if (turns.get(entry.turnId) === entry) turns.delete(entry.turnId);
  }
  return { start, prepareGuidance, loadRegistration, forget };
}
