import { planRun, resolveNativeToolPolicy, type RunConsentKey } from '@jini-ai/agent-runtime/native-tool-policy';
import type { RuntimeAgentDef } from '@jini-ai/agent-runtime';
import { resolveAssistantCliPermissions, resolveFullCliAccess, fullCliEnvLock, isHostedAssistantRuntime } from '#src/contracts/core/assistant-native-fallbacks';
import { resolveHostSignals } from '#src/server/runtime/composition/host-signals';
import { assistantCliPermissions } from '#src/assistant/assistant-subagents-policy';
import { readAssistantCliPermissions } from '#src/assistant/subagent-settings';
import type { AssistantOwnerGrantDeps as Deps } from '#src/server/inbound/admin-http/routes/system/assistant-owner-grant';

export interface AssistantRunToolPolicyInput {
  deps: Pick<Deps, "settingsRepo" | "getEffective" | "settingsUiTabsReady" | "workspaceId" | "ownerPrincipalId">; principalId: string; agentId: string; env: NodeJS.ProcessEnv;
  getDef: (required: { id: string }) => RuntimeAgentDef | null;
}

/** Read selected-agent permissions after the structural host gate; never grant a CLI an implicit switch. */
export async function readAssistantRunToolPolicy(required: AssistantRunToolPolicyInput, _optional = {}) {
  const { deps, env, principalId, agentId } = required;
  const isOwner = principalId === await deps.ownerPrincipalId;
  const hostSignals = resolveHostSignals({ env });
  const unlocked = resolveFullCliAccess({ isOwner, env }, { hostSignals });
  let settingsSource: "site" | "default" = "default";
  const settings = unlocked ? await readAssistantCliPermissions({ ...deps, principalId, settingsReady: deps.settingsUiTabsReady }, { onSource: source => { settingsSource = source; } }) : assistantCliPermissions({ enabled: false });
  const effective = resolveAssistantCliPermissions({ isOwner, env, settings, agentId }, { hostSignals });
  const def = required.getDef({ id: agentId });
  const policy = resolveNativeToolPolicy({ def: def ?? {}, policy: { nativeToolAccess: effective.enabled, nativeCapabilities: effective.capabilities } });
  const lock = runHostLock({ isOwner, env });
  return { isOwner, def, settings, effective, policy, nativeCapabilities: effective.capabilities, lock, settingsSource };
}

/** Lock reason comes from the same local host inputs used by the launch projection. */
function runHostLock({ isOwner, env }: { isOwner: boolean; env: NodeJS.ProcessEnv }): string | undefined {
  if (!isOwner) return 'not_owner';
  if (isHostedAssistantRuntime({ env }, { hostSignals: resolveHostSignals({ env }) })) return 'hosted';
  return fullCliEnvLock({ env });
}

/** One source of truth for the selected CLI's prelaunch decision. */
export function assistantRunPlan(required: {
  snapshot: Awaited<ReturnType<typeof readAssistantRunToolPolicy>>; installed: boolean; auth?: 'ok' | 'missing' | 'unknown';
}, _optional = {}) {
  const { snapshot } = required;
  if (!snapshot.def) return { verdict: 'SETUP' as const, reason: 'not_installed' as const };
  return planRun({ def: snapshot.def, policy: snapshot.policy, host: { installed: required.installed,
    ...(required.auth ? { auth: required.auth } : {}), ...(snapshot.lock ? { locked: snapshot.lock } : {}) } });
}

/** Setup copy names the action/host reason while keeping application boot available. */
export function assistantToolSetupMessage(required: { name: string; reason: string; lock?: string; keys?: readonly RunConsentKey[] }, _optional = {}): string {
  if (required.reason === 'not_installed') return `${required.name} isn't installed. Install it or pick another agent.`;
  if (required.reason === 'not_signed_in') return `${required.name} isn't signed in. Sign in once, then send again.`;
  const reason = required.lock === 'not_owner' ? 'only the owner can turn them on' : required.lock === 'hosted' ? "they're off on hosted sites" : `${required.lock ?? 'the host policy'} turns them off here`;
  return `${required.name} needs ${(required.keys ?? []).join(', ')} on, and ${reason}.`;
}
