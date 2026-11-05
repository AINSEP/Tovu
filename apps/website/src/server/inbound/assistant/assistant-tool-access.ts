import { planRun, resolveNativeToolPolicy, type RunConsentKey } from '@jini-ai/agent-runtime/native-tool-policy';
import type { RuntimeAgentDef } from '@jini-ai/agent-runtime';
import { resolveAssistantCliPermissions, resolveFullCliAccess, fullCliEnvLock, isHostedAssistantRuntime } from '#src/contracts/core/assistant-native-fallbacks';
import { resolveHostSignals } from '#src/server/runtime/composition/host-signals';
import { assistantCliPermissions, readAssistantCliPermissions } from '#src/assistant/runtime-settings';
import { readCliPermissionLayer, patchCliPermissionLayer } from '#src/assistant/cli-permission-layer';
import { set } from '#src/features/settings/index';
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_CLI_CAPABILITIES, type AssistantCliCapability } from '#src/contracts/headless/index';
import { toWriteServiceDeps } from '#src/server/inbound/admin-http/routes/settings/shared';
import type { AssistantOwnerGrantDeps } from '#src/server/inbound/admin-http/routes/system/assistant-owner-grant';

type Deps = AssistantOwnerGrantDeps;
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

/** A fresh card snapshot contains authority and the addressed layer revision, never raw settings. */
export async function readAssistantToolConsentSnapshot(required: AssistantRunToolPolicyInput, _optional = {}) {
  const policy = await readAssistantRunToolPolicy(required);
  const layer = await readCliPermissionLayer({ ...required.deps, principalId: required.principalId });
  return { permissions: { enabled: policy.effective.enabled, capabilities: policy.effective.capabilities },
    revisionSeq: layer.revisionSeq, allowed: policy.lock === undefined, ...(policy.lock ? { reason: policy.lock } : {}) };
}

/** The owner card changes only its selected raw entry through the existing audited CAS writer.
 * Rechecks owner/host/permission/live-run after awaits. A conflict opens a fresh card in the caller.
 * @complexity Fixed permission keys plus one raw settings read/write; no new storage or polling.
 */
export async function allowAssistantRunTools(required: Omit<AssistantRunToolPolicyInput, "deps"> & { deps: Deps;
  keys: readonly string[]; expectedRevisionSeq: number; isLive: () => boolean | Promise<boolean>;
}, _optional = {}): Promise<boolean> {
  const current = await readAssistantRunToolPolicy(required);
  if (current.lock || !(await required.isLive())) return false;
  const authorization = await required.deps.authorize({ principalId: required.principalId, workspaceId: required.deps.workspaceId, permission: 'settings.user.self.write', entityType: 'setting-value' });
  if (!authorization.allowed) throw new Error('Only the site owner with permission to change settings can allow these tools.');
  const layer = await readCliPermissionLayer({ ...required.deps, principalId: required.principalId });
  if (layer.revisionSeq !== required.expectedRevisionSeq || !(await required.isLive())) return false;
  const capabilities = selectedCapabilities({ keys: required.keys });
  const value = patchCliPermissionLayer({ raw: layer.raw, defaults: current.settings, agentId: required.agentId, capabilities,
    ...(required.keys.includes('enabled') ? { enabled: true } : {}) });
  const ended = new Error('The answer ended before this access change could be saved.');
  const deps = toWriteServiceDeps(required.deps);
  const repo = new Proxy(deps.repo, { get(target, key) {
    if (key === 'transaction') return <T>(run: () => Promise<T>) => target.transaction(async () => {
      if (!(await required.isLive())) throw ended;
      const result = await run();
      if (!(await required.isLive())) throw ended;
      return result;
    });
    const member = Reflect.get(target, key, target);
    return typeof member === 'function' ? member.bind(target) : member;
  } });
  try {
    await set({ deps: { ...deps, repo }, input: {
      namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: ASSISTANT_CLI_PERMISSIONS_KEY, scope: 'user',
      workspaceId: required.deps.workspaceId, authWorkspaceId: required.deps.workspaceId, principalId: required.principalId,
      callerPrincipalId: required.principalId, value,
    } }, { expectedRevisionSeq: layer.revisionSeq });
    return true;
  } catch (error) {
    if (staleOrEnded({ error, ended })) return false;
    throw error;
  }
}

function selectedCapabilities({ keys }: { keys: readonly string[] }): Partial<Record<AssistantCliCapability, boolean>> {
  if (keys.some(key => key !== 'enabled' && !ASSISTANT_CLI_CAPABILITIES.some(item => item.key === key))) throw new Error('The tool request changed. Send your message again.');
  return Object.fromEntries(keys.filter(key => key !== 'enabled').map(key => [key, true]));
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

function staleOrEnded({ error, ended }: { error: unknown; ended: Error }): boolean {
  return error === ended || (error as { code?: string }).code === 'REVISION_CONFLICT' || (error as Error).name === 'SettingsRevisionConflictError';
}
