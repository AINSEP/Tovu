import type { ToolRegistration } from '@jini-ai/core';
import { TOOL_APPROVAL_POLICY, EXTENSION_TOOL_APPROVAL_POLICY, type ToolApprovalClass, type ToolApprovalPolicy } from '../contracts/headless/index.js';

/** Owner rule (2026-09-24, restated 2026-10-08 after a site import asked once per page): no
 * per-item confirmation for anything the owner can undo. Permanent deletes, overwrites of current
 * data, secret replacement, permission escalation and actions that leave this site still ask. */
const DIRECT_APPROVAL_CLASSES: ReadonlySet<string> = new Set<ToolApprovalClass>(['read', 'edit', 'trash']);

/** Whether an action of this class must wait for a human click. Fails closed: a class this table
 * does not know asks. @complexity O(1). */
export function approvalClassAsks({ class: actionClass }: { class: string }, _optional = {}): boolean {
  return !DIRECT_APPROVAL_CLASSES.has(actionClass);
}

/** Behavior-reviewed plugin-add controls: input/disclosure/cancel or installation that stays off.
 * Do not add destructive or publish controls here, including their final confirmation buttons. */
const DIRECT_PAGE_HANDLES: ReadonlySet<string> = new Set([
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
  return typeof handle === 'string' && DIRECT_PAGE_HANDLES.has(handle);
}

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
