import { authenticatedAdminRequest, WORKSPACE_ID } from "./api";
import type { AssistantPermanentDeletesPolicy } from "@tovu/headless";
export { PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS, ASSISTANT_PERMANENT_DELETES_NAMESPACE } from "@tovu/headless";
export interface AssistantPermanentDeletesSettings extends AssistantPermanentDeletesPolicy { canEdit: boolean }
export interface AssistantPermanentDeletesPort {
  read(required: Record<string, never>, optional?: Record<string, never>): Promise<AssistantPermanentDeletesSettings>;
  write(required: AssistantPermanentDeletesPolicy & { riskAcknowledged: boolean }, optional?: Record<string, never>): Promise<AssistantPermanentDeletesSettings>;
}
const path = `/workspaces/${WORKSPACE_ID}/system/assistant-permanent-deletes`;
/** Uses the same authenticated request/error boundary as subagents. */
export const assistantPermanentDeletesPort: AssistantPermanentDeletesPort = {
  read: () => authenticatedAdminRequest({ path, method: "GET" }),
  write: body => authenticatedAdminRequest({ path, method: "PUT", body }),
};
