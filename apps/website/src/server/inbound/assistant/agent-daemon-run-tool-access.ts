import type { RunPorts } from './agent-daemon-run-start.js';
import { readAssistantRunToolPolicy, assistantRunPlan, assistantToolSetupMessage } from './assistant-run-tool-policy.js';
import { requestAssistantToolAlternative } from './assistant-tool-consent.js';
import { resolveNativeToolPolicy } from "@jini-ai/agent-runtime/native-tool-policy";
import { resolveAssistantCliPermissions } from "@tovu/contracts/assistant-native-fallbacks";
import { type ToolExecutionContext, type SurfaceEmitter } from "@jini-ai/core";
import { isTerminalRunState, type RunAgentPayload } from '@jini-ai/protocol';

export function createRunToolLiveness(ports: RunPorts, _optional = {}) {
  return { resolveRunNativePolicy: resolveRunNativePolicy.bind(undefined, ports), runToolAccessIsLive: runToolAccessIsLive.bind(undefined, ports) };
}
export function createRunToolChoice(ports: RunPorts, _optional = {}) {
  return { prepareRunToolAccess: prepareRunToolAccess.bind(undefined, ports), qualifiedRunAlternatives: qualifiedRunAlternatives.bind(undefined, ports) };
}
export function createRunToolConsent(ports: RunPorts, _optional = {}) {
  return { askForRunToolAccess: askForRunToolAccess.bind(undefined, ports), withRunToolAccessCard: withRunToolAccessCard.bind(undefined, ports) };
}
/** Fresh host-gated selected-agent grants, shared with the owner consent click. */
async function resolveRunNativePolicy(ports: RunPorts, { agentId }: { agentId: string }, _optional = {}) {
  const { readAssistantRunToolPolicy, routeDeps, principal, env, getAgentDef } = ports;
  return readAssistantRunToolPolicy({ deps: routeDeps, principalId: principal.id, agentId, env, getDef: getAgentDef });
}

async function runToolAccessIsLive(ports: RunPorts, _optional = {}): Promise<boolean> {
  const { runLifecycle, run, pluginAbort } = ports;
  const current = await runLifecycle.get({ runId: run.id });
  if (current && pluginAbort.signal.aborted && !isTerminalRunState({ state: current.state })) {
    await runLifecycle.finish({ runId: run.id, status: 'cancelled', code: null, signal: null, resumable: false });
    return false;
  }
  return runToolAccessLive({ ...ports, current });
}

/** Consent precedes session binding, persistent repair, per-run tokens and CLI spawn. */
async function prepareRunToolAccess(ports: RunPorts, { selectedAgentId }: { selectedAgentId: string }): Promise<string | null> {
  const { runToolAccessIsLive } = createRunToolLiveness(ports);
  
  let selected = selectedAgentId;
  while (await runToolAccessIsLive()) {
    const decision = await prepareAgentToolChoice(ports, { selected });
    if (decision === null || decision === true) return decision === true ? selected : null;
    selected = decision;
  }
  return null;
}

async function prepareAgentToolChoice(ports: RunPorts, { selected }: { selected: string }): Promise<string | true | null> {
  const { assistantInventory, resolveAgentLaunch, runLifecycle, run } = ports;
  const { resolveRunNativePolicy } = createRunToolLiveness(ports);
  const { askForRunToolAccess } = createRunToolConsent(ports);
  
  const snapshot = await resolveRunNativePolicy({ agentId: selected });
  const inventory = await assistantInventory.listAssistantAgents();
  const detected = inventory.find(agent => agent.id === selected);
  const plan = assistantRunPlan({ snapshot, installed: !!snapshot.def && !!resolveAgentLaunch({ def: snapshot.def }).launchPath,
    ...(detected?.authStatus ? { auth: detected.authStatus } : {}) });
  if (plan.verdict === 'RUN') return true;
  if (plan.verdict === 'SETUP' || !snapshot.def) return prepareUnavailableToolChoice(ports, { selected, snapshot, plan, inventory });
  const result = await askForRunToolAccess({ snapshot, keys: plan.keys, inventory });
  if (result.status === 'alternative') return result.agentId;
  if (result.status === 'allowed') return selected;
  await runLifecycle.finish({ runId: run.id, status: 'cancelled', code: null, signal: null, resumable: false }); return null;
}

async function prepareUnavailableToolChoice(ports: RunPorts, { selected, snapshot, plan, inventory }: {
  selected: string; snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>; plan: ReturnType<typeof assistantRunPlan>;
  inventory: Awaited<ReturnType<RunPorts['assistantInventory']['listAssistantAgents']>>;
}): Promise<string | null> {
  const { surfaceExchanges, failRunBeforeStart, runLifecycle, run } = ports;
  const { runToolAccessIsLive } = createRunToolLiveness(ports);
  
  const name = snapshot.def?.name ?? selected;
  const message = runToolSetupMessage({ name, plan, snapshot });
  const alternatives = await qualifiedRunAlternatives(ports, { inventory, selectedAgentId: selected, snapshot });
  if (alternatives.length) {
    const alternative = await withRunToolAccessCard(ports, { ask: ({ ctx, emitSurface }) => requestAssistantToolAlternative({ name, message,
      ctx, surfaces: { surfaceExchanges }, alternatives, isLive: runToolAccessIsLive }, { emitSurface }) });
    if (alternative) return alternative;
  }
  await failRunBeforeStart({ lifecycle: runLifecycle, runId: run.id, message }, {});
  return null;
}

async function askForRunToolAccess(ports: RunPorts, { snapshot, keys, inventory }: {
  snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>; keys: readonly string[];
  inventory: Awaited<ReturnType<RunPorts['assistantInventory']['listAssistantAgents']>>;
}) {
  const { principal, routeDeps, run, surfaceExchanges, requestAssistantToolConsent } = ports;
  const { runToolAccessIsLive } = createRunToolLiveness(ports);

  const selected = snapshot.def;
  if (!selected) throw new Error('agent tool access has no selected agent definition');
  const alternatives = await qualifiedRunAlternatives(ports, { inventory, selectedAgentId: selected.id, snapshot });
  const assertAccessApprover = async ({ principalId }: { principalId: string }) => {
    if (principalId !== principal.id || !(await runToolAccessIsLive())) throw new Error('Tool access requires the person in this live chat.');
    const fresh = await routeDeps.readToolConsentSnapshot({ runId: run.id, agentId: selected.id });
    if (!fresh.allowed) throw new Error('Tool access requires the active owner of this site.');
  };
  return withRunToolAccessCard(ports, { ask: ({ ctx, emitSurface }) => requestAssistantToolConsent({ def: selected, keys, workspaceId: routeDeps.workspaceId,
    surfaces: { surfaceExchanges, assertAccessApprover }, ctx,
    isLive: runToolAccessIsLive,
    readFresh: () => routeDeps.readToolConsentSnapshot({ runId: run.id, agentId: selected.id }),
    allowSelected: input => runToolAccessIsLive().then(live => live ? routeDeps.allowRunTools({ runId: run.id, ...input }) : false),
  }, { alternatives, emitSurface }) });
}

/** Both access and setup cards use the existing principal-bound exchange event stream. */
async function withRunToolAccessCard<T>(ports: RunPorts, { ask }: {
  ask: (input: { ctx: ToolExecutionContext; emitSurface: SurfaceEmitter }) => Promise<T>;
}): Promise<T> {
  const { randomUUID, runLifecycle, run, principal, pluginAbort } = ports;
  const toolUseId = randomUUID();
  await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'tool_use', id: toolUseId, name: 'settings_set_value', input: {} } } });
  try {
    return await ask({ ctx: { executionId: toolUseId, principal, run: { id: run.id }, input: {}, signal: pluginAbort.signal },
      emitSurface: async emission => { await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { ...emission.payload, type: emission.channel, toolUseId } as RunAgentPayload } }); },
    });
  } finally {
    await runLifecycle.emit({ runId: run.id, input: { event: 'agent', data: { type: 'tool_result', toolUseId, content: 'Tool access request reviewed.' } } });
  }
}

function qualifiedRunAlternatives(ports: RunPorts, { inventory, selectedAgentId, snapshot }: {
  inventory: Awaited<ReturnType<RunPorts['assistantInventory']['listAssistantAgents']>>; selectedAgentId: string;
  snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>;
}) {
  // Reuse the launch snapshot for choices; the selected agent is read fresh before dispatch.
  const alternatives = [];
  for (const agent of inventory) {
    if (agent.id === selectedAgentId || !agent.available || agent.authStatus === 'missing') continue;
    const candidate = qualifyRunAlternative(ports, { agent, snapshot });
    if (assistantRunPlan({ snapshot: candidate, installed: true }).verdict === 'RUN') alternatives.push({ agentId: agent.id, name: agent.name });
  }
  return alternatives;
}
function runToolAccessLive({ isDisposed, pluginAbort, state: { revokedToolRuns }, run, current }: RunPorts & { current: Awaited<ReturnType<RunPorts['runLifecycle']['get']>> }, _optional = {}) {
  return !isDisposed() && !pluginAbort.signal.aborted && !revokedToolRuns.has(run.id) && !!current && !isTerminalRunState({ state: current.state });
}

function runToolSetupMessage({ name, plan, snapshot }: { name: string; plan: ReturnType<typeof assistantRunPlan>; snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>> }, _optional = {}) {
  return assistantToolSetupMessage({ name, reason: plan.verdict === 'SETUP' ? plan.reason : 'not_installed',
    ...(snapshot.lock ? { lock: snapshot.lock } : {}), ...('keys' in plan ? { keys: plan.keys } : {}) });
}

function qualifyRunAlternative(ports: RunPorts, { agent, snapshot }: {
  agent: Awaited<ReturnType<RunPorts['assistantInventory']['listAssistantAgents']>>[number]; snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>;
}) {
  const { getAgentDef, env, resolveHostSignals } = ports;
    const def = getAgentDef({ id: agent.id });
    const effective = resolveAssistantCliPermissions({ isOwner: snapshot.isOwner, env, settings: snapshot.settings, agentId: agent.id }, { hostSignals: resolveHostSignals({ env }) });
    const policy = resolveNativeToolPolicy({ def: def ?? {}, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities } });
    const candidate = { ...snapshot, def, effective, policy, nativeCapabilities: effective.capabilities };
  return candidate;
}
