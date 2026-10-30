import { nativeToolMetadata } from '../core/tool-metadata/index.js';
import type { ToolApprovalPolicy } from '../core/tool-metadata/approval-policy.js';
import type { ToolRegistration } from '@jini-ai/core';

/** The assistant owns classification; composition supplies it to feature registration builders. */
export type ApplyExtensionApprovalPolicy = (
  required: { registration: ToolRegistration; family: keyof typeof EXTENSION_TOOL_APPROVAL_POLICY },
  optional?: Record<string, never>,
) => ToolRegistration;

const EXECUTION_NAMESPACE = "core.execution";
export type { ToolApprovalClass, ToolApprovalPolicy } from '../core/tool-metadata/approval-policy.js';
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
