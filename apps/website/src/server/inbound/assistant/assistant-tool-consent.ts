import { requestRunToolConsent, type RunToolConsentPorts, type RunToolConsentSnapshot, type RunToolConsentResult } from '@jini-ai/daemon';
import type { RuntimeAgentDef } from '@jini-ai/agent-runtime';
import type { ToolExecutionContext, ToolExecutionOptions } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { ChatDeleteSurfaceDeps } from '#src/contracts/core/chat-delete-grant';
import { requireHumanConfirm, type HumanConfirmSpec } from '#src/contracts/core/human-confirm';

const CAPABILITY_NAMES: Readonly<Record<string, string>> = {
  enabled: 'Full CLI access', shell: 'Bash/shell', fileWrite: 'File edit/write', userMcp: 'Personal MCP servers',
  subagents: 'Subagents/Task', userSettings: 'Personal skills and settings', web: 'Web fetch/search',
  workflows: 'Workflows', loginEnvironment: 'Shell environment',
};

type ConsentDef = Pick<RuntimeAgentDef, 'id' | 'name' | 'externalMcpInjection'>;
export interface AssistantToolConsentAlternative { readonly agentId: string; readonly name: string }

/** Product wording for the generic, revision-bound prelaunch consent ceremony. Pure and secret-free.
 * Alternatives have already been qualified by the launch planner; missing alternatives hide them.
 * @complexity O(k + a) for fixed consent keys and installed RUN alternatives; no I/O.
 */
export function buildAssistantToolConsentSpec(required: {
  def: ConsentDef; keys: readonly string[]; snapshot: RunToolConsentSnapshot; stale: boolean; scope: { personId: string; siteId: string };
}, optional: { alternatives?: readonly AssistantToolConsentAlternative[] } = {}): HumanConfirmSpec {
  const personal = required.keys.includes('userMcp');
  return {
    toolId: 'settings_set_value', errorCode: 'ASSISTANT_TOOL_CONSENT',
    title: personal ? `${required.def.name} can't hide its own tools.` : `${required.def.name} needs these tools turned on.`,
    description: required.stale ? 'This changed since I asked. Review the fresh settings before allowing.' : 'Only the owner can allow this additional access.',
    access: { resources: required.keys.map(key => ({ id: `${required.def.id}:${key}`, label: CAPABILITY_NAMES[key] ?? key,
      scope: required.scope, revision: String(required.snapshot.revisionSeq),
      previous: key === 'enabled' ? required.snapshot.permissions.enabled : required.snapshot.permissions.capabilities[key] === true, proposed: true })) },
    details: [{ label: 'Tools provided here', value: 'Tovu and Jini tools, enabled plugin tools, and connected servers.' }],
    warning: consentWarning({ def: required.def, personal }), confirmLabel: `Allow for ${required.def.name}`, cancelLabel: 'Cancel',
    ...(optional.alternatives?.length ? { alternatives: optional.alternatives.map((agent, index) => ({
      id: `agent-${index}`, label: `Use ${agent.name}`, choice: agent.agentId,
    })) } : {}),
  };
}

function consentWarning({ def, personal }: { def: ConsentDef; personal: boolean }): string {
  const inherited = def.externalMcpInjection === 'env-passthrough' || def.externalMcpInjection === 'opencode-env-content' || def.externalMcpInjection === 'mimo-env-content';
  return [
    personal ? `It also loads MCP servers set up in ${def.name} or this project. Tovu doesn't approve or log those.` : '',
    personal && inherited ? "Those servers can see this chat's run key while it runs." : '',
    def.externalMcpInjection === 'env-passthrough' ? `Allow also adds a credential-free connector to ${def.name}'s personal settings outside Tovu. Other entries are kept and the original is backed up first.` : '',
    `This choice also applies to ${def.name}'s other chats on this site.`,
  ].filter(Boolean).join(' ');
}

/** Ask on the existing principal-bound human exchange; the generic helper owns fresh-state CAS.
 * Root composition closes this context's signal on terminal completion and binds every port to
 * the originating run/site/principal. No browser-supplied target or grant is accepted here.
 * @complexity Four bounded permission reads and one existing settings CAS per accepted card.
 */
export async function requestAssistantToolConsent(required: {
  def: ConsentDef; keys: readonly string[]; workspaceId: string; ctx: ToolExecutionContext; surfaces: ChatDeleteSurfaceDeps;
  readFresh: RunToolConsentPorts['readFresh']; isLive: RunToolConsentPorts['isLive']; allowSelected: RunToolConsentPorts['allowSelected'];
}, optional: ToolExecutionOptions & { alternatives?: readonly AssistantToolConsentAlternative[]; askHuman?: typeof requireHumanConfirm } = {}): Promise<RunToolConsentResult> {
  return requestRunToolConsent({ agentId: required.def.id, keys: required.keys,
    alternatives: (optional.alternatives ?? []).map(agent => agent.agentId),
    readFresh: required.readFresh, isLive: required.isLive, allowSelected: required.allowSelected,
    ask: ({ snapshot, stale }) => (optional.askHuman ?? requireHumanConfirm)({ ctx: required.ctx, surfaces: required.surfaces,
      spec: buildAssistantToolConsentSpec({ def: required.def, keys: required.keys, snapshot, stale, scope: { personId: required.ctx.principal.id, siteId: required.workspaceId } }, optional) }, optional),
  });
}

/** Offer already-qualified RUN agents through the same principal-bound exchange, without grants.
 * The caller revalidates the selected agent's plan before session binding and launch.
 * @complexity O(a) for the bounded qualified alternative list; no settings reads or writes.
 */
export async function requestAssistantToolAlternative(required: {
  name: string; message: string; ctx: ToolExecutionContext; surfaces: AssistantSurfaceDeps;
  alternatives: readonly AssistantToolConsentAlternative[]; isLive: RunToolConsentPorts['isLive'];
}, optional: ToolExecutionOptions & { askHuman?: typeof requireHumanConfirm } = {}): Promise<string | null> {
  const alternatives = required.alternatives.map(agent => ({ ...agent }));
  const first = alternatives[0];
  if (!first || !(await required.isLive())) return null;
  const outcome = await (optional.askHuman ?? requireHumanConfirm)({ ctx: required.ctx, surfaces: required.surfaces, spec: {
    toolId: 'settings_set_value', errorCode: 'ASSISTANT_TOOL_ALTERNATIVE', title: `${required.name} needs setup.`,
    description: required.message, details: [], confirmLabel: `Use ${first.name}`, cancelLabel: 'Cancel',
    alternatives: alternatives.slice(1).map((agent, index) => ({ id: `agent-${index}`, label: `Use ${agent.name}`, choice: agent.agentId })),
  } }, optional);
  if (!outcome.confirmed || !(await required.isLive())) return null;
  const selected = outcome.choice ?? first.agentId;
  return alternatives.some(agent => agent.agentId === selected) ? selected : null;
}
