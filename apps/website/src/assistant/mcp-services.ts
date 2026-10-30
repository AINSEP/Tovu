/** Assistant-owned approval and roster-listener services, without tool-registry wiring. */
export type { ConversationToolApprovalStore, ExternalMcpToolApprovalRecord, ExternalMcpToolApprovalRepoPort } from "./external-mcp-tool-approval-ports.js";
export { notifyExternalMcpRosterChanged } from "./external-mcp-roster-change.js";

export { withExtensionApprovalPolicy } from "./assistant-tool-approval-policy.js";
