import type { ToolRegistration } from '@jini-ai/core';
import { TOOL_APPROVAL_POLICY, EXTENSION_TOOL_APPROVAL_POLICY } from '../contracts/headless/index.js';
import type { ToolApprovalClass } from "@jini-ai/core/contracts/site/tool-metadata-approval-policy";
import type { HostToolApprovalPolicy as ToolApprovalPolicy } from "../contracts/core/tool-metadata/index.js";

/** Owner rule (2026-09-24, restated 2026-10-08 after a site import asked once per page): no
 * per-item confirmation for anything the owner can undo. Permanent deletes, overwrites of current
 * data, secret replacement, permission escalation and actions that leave this site still ask. */
const DIRECT_APPROVAL_CLASSES: ReadonlySet<string> = new Set<ToolApprovalClass>(['read', 'edit', 'trash']);

/** Whether an action of this class must wait for a human click. Fails closed: a class this table
 * does not know asks. @complexity O(1). */
export function approvalClassAsks({ class: actionClass }: { class: string }, _optional = {}): boolean {
  return !DIRECT_APPROVAL_CLASSES.has(actionClass);
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
