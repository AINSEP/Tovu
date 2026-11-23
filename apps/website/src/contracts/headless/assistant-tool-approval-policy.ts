import { nativeToolMetadata } from '../core/tool-metadata/index.js';
import type { HostToolApprovalPolicy as ToolApprovalPolicy } from '../core/tool-metadata/index.js';
import type { ToolRegistration } from '@jini-ai/core';

/** The assistant owns classification; composition supplies it to feature registration builders. */
export type ApplyExtensionApprovalPolicy = (
  required: { registration: ToolRegistration; family: keyof typeof EXTENSION_TOOL_APPROVAL_POLICY },
  optional?: Record<string, never>,
) => ToolRegistration;

const EXECUTION_NAMESPACE = "core.execution";
/** Owner-approved escalation settings; ordinary preferences and instructions run directly. */
export const ASSISTANT_EXECUTION_APPROVAL_SETTINGS = [
  { namespace: EXECUTION_NAMESPACE, key: "localCli.permissionLevel", reason: "Changes the assistant's permission level" },
  { namespace: EXECUTION_NAMESPACE, key: "mode", reason: "Changes which execution service receives assistant requests" },
  { namespace: EXECUTION_NAMESPACE, key: "localCli.agentId", reason: "Changes the assistant runtime and its access to requests" },
  { namespace: EXECUTION_NAMESPACE, key: "byok.protocol", reason: "Changes the protocol used to send assistant requests" },
  { namespace: EXECUTION_NAMESPACE, key: "byok.providerId", reason: "Changes which provider receives assistant requests" },
  { namespace: EXECUTION_NAMESPACE, key: "byok.baseUrl", reason: "Changes the endpoint receiving assistant requests" },
] as const;
export const TOOL_APPROVAL_POLICY: Readonly<Record<string, ToolApprovalPolicy>> = nativeToolMetadata.approvals;

/** Only parked approval calls can be answered through the MCP-UI callback route. */
export const POLICY_CONFIRMATION_TOOL_IDS = nativeToolMetadata.policyConfirmationIds;

/** Data-generated ids are classified by the host factory's behavior, never their names or prose.
 * Memory refresh is a plain text edit; guidance and computed capability results save nothing.
 * These host-specific families use core's descriptor metadata, the same contract as native tools. */
export const EXTENSION_TOOL_APPROVAL_POLICY = {
  'installed-guidance': { class: 'read', confirmation: 'direct' },
  'plugin-capability-result': { class: 'read', confirmation: 'direct' },
  'plugin-memory-read': { class: 'read', confirmation: 'direct' },
  'plugin-memory-write': { class: 'edit', confirmation: 'direct' },
  // Executable Agent Plugin tools act on an external account. The plugin's declared effect may only
  // add friction: a read runs directly, a write leaves this site and asks, a destructive change asks
  // as a delete (danger styling). The host adds the affected-resource disclosure to the card.
  'agent-plugin-read': { class: 'read', confirmation: 'direct' },
  'agent-plugin-write': { class: 'publish', confirmation: 'policy' },
  'agent-plugin-destructive': { class: 'delete', confirmation: 'policy' },
} as const satisfies Readonly<Record<string, ToolApprovalPolicy>>;

/** Behavior-reviewed plugin-add controls: input/disclosure/cancel or installation that stays off.
 * Do not add destructive or publish controls here, including their final confirmation buttons. */
const DIRECT_PAGE_HANDLES: ReadonlySet<string | RegExp> = new Set([
  /^agent-plugin-row-[a-z0-9-]+-(?:details|inspect)$/,
  'plugins-install-advanced', 'plugins-install-folder', 'plugins-install-folder-upload',
  'plugins-install-zip', 'plugins-install-replace', 'plugins-install-preview',
  'plugins-install-cancel', 'plugins-install-confirm',
  'agent-plugin-add-choose', 'agent-plugin-add-choose-folder', 'agent-plugin-add-replace',
  'agent-plugin-add-install', 'agent-plugin-add-url', 'agent-plugin-add-from-url',
  'skills-add-url-input', 'skills-add-url', 'skills-add-files', 'skills-add-folder',
  'skills-install-cancel', 'skills-install-confirm',
]);

export function directPageAction({ capabilityId, input }: { capabilityId: string; input: unknown }, _optional = {}): boolean {
  if (!Object.hasOwn(TOOL_APPROVAL_POLICY, capabilityId)) throw new Error(`${capabilityId} has no approval classification`);
  if (capabilityId !== 'page.click') return TOOL_APPROVAL_POLICY[capabilityId]!.confirmation === 'direct';
  const handle = input && typeof input === 'object' ? (input as Record<string, unknown>).handle : undefined;
  return typeof handle === 'string' && [...DIRECT_PAGE_HANDLES].some(reviewed =>
    typeof reviewed === 'string' ? reviewed === handle : reviewed.test(handle));
}
