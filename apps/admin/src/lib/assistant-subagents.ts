import { authenticatedAdminRequest, WORKSPACE_ID } from "./api";
export { ASSISTANT_SUBAGENTS_NAMESPACE as SUBAGENTS_NAMESPACE } from "@tovu/headless";

export const SUBAGENT_DANGERS = [
  "Security risk: subagents can act independently.",
  "Subagents inherit the assistant's bypassed permissions.",
  "You may not see what they do; the chat does not show subagent tool calls.",
  "Cost and machine load multiply with each subagent.",
] as const;
import type { AssistantCliPermissions } from "@tovu/headless";
export interface AssistantSubagentsSettings {
  /** canEdit identifies a local owner; unavailableReason can still lock full access on this machine. */
  enabled: boolean; canEdit: boolean; capabilities?: Partial<AssistantCliPermissions["capabilities"]>; unavailableReason?: string;
  /** Effective launch mode; older responses remain unknown and preflight fails closed. */
  permissionMode?: "bypass" | "restricted";
  byAgent?: AssistantCliPermissions["byAgent"];
  agents?: readonly { id: string; name: string }[];
  /** Only sent by the per-agent patch action; never interpreted as a site-default change. */
  agentId?: string;
}
export interface AssistantSubagentsPort {
  read(required: Record<string, never>, optional?: Record<string, never>): Promise<AssistantSubagentsSettings>;
  write(required: { enabled: boolean; agentId?: string; capabilities?: Partial<AssistantCliPermissions["capabilities"]>; riskAcknowledged: boolean }, optional?: Record<string, never>): Promise<AssistantSubagentsSettings>;
}
const path = `/workspaces/${WORKSPACE_ID}/system/assistant-full-cli`;
/** Thin host adapter: shared authenticated requests retain the session/error boundary. */
export const assistantSubagentsPort: AssistantSubagentsPort = {
  read: () => authenticatedAdminRequest({ path, method: "GET" }),
  write: (body) => authenticatedAdminRequest({ path, method: "PUT", body }),
};
