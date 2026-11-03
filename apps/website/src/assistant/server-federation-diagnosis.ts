/** Server-only refusal adapter. The slim daemon receives diagnosed server tool results over RPC. */
import { randomUUID } from "node:crypto";
import type { ToolExecutor } from "@jini-ai/daemon";
import { withFederatedRefusalDiagnosis as withDaemonFederationDiagnosis } from "@jini-ai/daemon/tool-recovery";
import type { FederationBootStatus } from "@jini-ai/daemon/tool-recovery";
export type { FederationBootStatus } from "@jini-ai/daemon/tool-recovery";
import { findFederatedToolRefusal, FEDERATED_TOOL_ID_PREFIX, parseFederatedConnectionId } from "@jini-ai/mcp/federation";
import type { FederationAdmissionSnapshotEntry } from "@jini-ai/mcp/federation";
import { tovuFederationMessages } from "./mcp-federation/presets.js";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

/** Preserve the existing outermost diagnosis policy at its federation owner.
 * @complexity O(admission snapshot size) per refused call; no connection or remote I/O here. */
export function withFederatedRefusalDiagnosis(required: { inner: ToolExecutor; getSnapshot: () => readonly FederationAdmissionSnapshotEntry[]; getBootStatus?: () => FederationBootStatus }, optional = {}): ToolExecutor {
  return withDaemonFederationDiagnosis({ inner: required.inner, newExecutionId: randomUUID, redactSecretShapes,
    isFederatedTool: ({ toolId }) => toolId.startsWith(FEDERATED_TOOL_ID_PREFIX), parseConnectionId: parseFederatedConnectionId,
    findRefusal: ({ toolId }) => findFederatedToolRefusal({ toolId, snapshot: required.getSnapshot(), messages: tovuFederationMessages }),
    ...(required.getBootStatus ? { getBootStatus: required.getBootStatus } : {}) }, optional);
}
