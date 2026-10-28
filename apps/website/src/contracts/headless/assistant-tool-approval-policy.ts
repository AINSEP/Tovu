import { nativeToolMetadata } from '../core/tool-metadata/index.js';
import type { ToolRegistration } from '@jini-ai/core';
import type { ToolApprovalClass, ToolApprovalPolicy } from '../core/tool-metadata/approval-policy.js';
export type { ToolApprovalClass, ToolApprovalPolicy } from '../core/tool-metadata/approval-policy.js';
/** Owner rule (2026-09-24, restated 2026-10-08 after a site import asked once per page): no
 * per-item confirmation for anything the owner can undo. Permanent deletes, overwrites of current
 * data, secret replacement, permission escalation and actions that leave this site still ask. */
const DIRECT_APPROVAL_CLASSES: ReadonlySet<string> = new Set<ToolApprovalClass>(['read', 'edit', 'trash']);
/** Whether an action of this class must wait for a human click. Fails closed: a class this table
 * does not know asks. @complexity O(1). */
export function approvalClassAsks({ class: actionClass }: { class: string }, _optional = {}): boolean {
  return !DIRECT_APPROVAL_CLASSES.has(actionClass);
}
/** Owner-approved escalation settings; ordinary preferences and instructions run directly. */
export const ASSISTANT_EXECUTION_APPROVAL_SETTINGS = [
  { namespace: "core.execution", key: "localCli.permissionLevel", reason: "Changes the assistant's permission level" },
  { namespace: "core.execution", key: "mode", reason: "Changes which execution service receives assistant requests" },
  { namespace: "core.execution", key: "localCli.agentId", reason: "Changes the assistant runtime and its access to requests" },
  { namespace: "core.execution", key: "byok.protocol", reason: "Changes the protocol used to send assistant requests" },
  { namespace: "core.execution", key: "byok.providerId", reason: "Changes which provider receives assistant requests" },
  { namespace: "core.execution", key: "byok.baseUrl", reason: "Changes the endpoint receiving assistant requests" },
] as const;
export const TOOL_APPROVAL_POLICY: Readonly<Record<string, ToolApprovalPolicy>> = nativeToolMetadata.approvals;

/** Only parked approval calls can be answered through the MCP-UI callback route. */
export const POLICY_CONFIRMATION_TOOL_IDS = nativeToolMetadata.policyConfirmationIds;

/** Behavior-reviewed plugin-add controls: input/disclosure/cancel or installation that stays off.
 * Do not add destructive or publish controls here, including their final confirmation buttons. */
const DIRECT_PAGE_HANDLES: ReadonlySet<string> = new Set([
  'plugins-install-advanced', 'plugins-install-folder', 'plugins-install-folder-upload',
  'plugins-install-zip', 'plugins-install-replace', 'plugins-install-preview',
  'plugins-install-cancel', 'plugins-install-confirm',
  'agent-plugin-add-choose', 'agent-plugin-add-choose-folder', 'agent-plugin-add-replace',
  'agent-plugin-add-install', 'agent-plugin-add-url', 'agent-plugin-add-from-url',
  'skills-add-github-url', 'skills-add-github', 'skills-add-files', 'skills-add-folder',
  'skills-install-cancel', 'skills-install-confirm',
]);
export function directPageAction({ capabilityId, input }: { capabilityId: string; input: unknown }, _optional = {}): boolean {
  if (!Object.hasOwn(TOOL_APPROVAL_POLICY, capabilityId)) throw new Error(`${capabilityId} has no approval classification`);
  if (capabilityId !== 'page.click') return TOOL_APPROVAL_POLICY[capabilityId]!.confirmation === 'direct';
  const handle = input && typeof input === 'object' ? (input as Record<string, unknown>).handle : undefined;
  return typeof handle === 'string' && DIRECT_PAGE_HANDLES.has(handle);
}

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
export function withExtensionApprovalPolicy(
  { registration, family }: { registration: ToolRegistration; family: keyof typeof EXTENSION_TOOL_APPROVAL_POLICY }, _optional = {},
): ToolRegistration {
  if (!Object.hasOwn(EXTENSION_TOOL_APPROVAL_POLICY, family)) throw new Error(`${registration.descriptor.id} has no approval classification`);
  return { ...registration, descriptor: { ...registration.descriptor, metadata: { ...registration.descriptor.metadata, approval: EXTENSION_TOOL_APPROVAL_POLICY[family] } } };
}
export function toolApprovalPolicyFor({ registration }: { registration: ToolRegistration }, _optional = {}): ToolApprovalPolicy {
  const policy = registration.descriptor.metadata?.approval as ToolApprovalPolicy | undefined
    ?? (Object.hasOwn(TOOL_APPROVAL_POLICY, registration.descriptor.id) ? TOOL_APPROVAL_POLICY[registration.descriptor.id] : undefined);
  if (!policy) throw new Error(`${registration.descriptor.id} has no approval classification`);
  return policy;
}
