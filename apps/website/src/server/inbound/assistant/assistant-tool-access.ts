import { readAssistantRunToolPolicy, type AssistantRunToolPolicyInput } from './assistant-run-tool-policy.js';
export { readAssistantRunToolPolicy, assistantRunPlan, assistantToolSetupMessage } from './assistant-run-tool-policy.js';
import { readCliPermissionLayer, patchCliPermissionLayer } from '#src/assistant/cli-permission-layer';
import { set } from '#src/features/settings/index';
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_CLI_PERMISSIONS_KEY, ASSISTANT_CLI_CAPABILITIES, type AssistantCliCapability } from '#src/contracts/headless/index';
import { toWriteServiceDeps } from '#src/server/inbound/admin-http/routes/settings/shared';
import type { AssistantOwnerGrantDeps } from '#src/server/inbound/admin-http/routes/system/assistant-owner-grant';

type Deps = AssistantOwnerGrantDeps;
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


function staleOrEnded({ error, ended }: { error: unknown; ended: Error }): boolean {
  return error === ended || (error as { code?: string }).code === 'REVISION_CONFLICT' || (error as Error).name === 'SettingsRevisionConflictError';
}
