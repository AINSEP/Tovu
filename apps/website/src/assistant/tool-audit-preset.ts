/** Host IDs/clocks and unscoped catalog attribution; the audit lifecycle is Jini-owned. */
import { randomUUID } from "node:crypto";
import type { ToolExecutor } from "@jini-ai/daemon";
import type { ToolCatalogQuery } from "@jini-ai/daemon/http";
import { withToolAttemptAudit as withDaemonAttemptAudit, withToolCatalogAudit as withDaemonCatalogAudit,
  appendToolCatalogAttempt as appendDaemonCatalogAttempt } from "@jini-ai/daemon/tool-audit";
import type { ToolAttemptAuditSink, ToolCatalogAuditIdentity, ToolCatalogAttemptEvent } from "@jini-ai/daemon/tool-audit";
import { readToolErrorId } from "@jini-ai/daemon/tool-recovery";
export { describeInput, searchToolsAuditDetail, describeToolAuditDetail } from "@jini-ai/daemon/tool-audit";
export type { ToolCatalogAuditIdentity, ToolCatalogAttemptEvent } from "@jini-ai/daemon/tool-audit";
export const SEARCH_TOOLS_TOOL_ID = "search_tools";
export const DESCRIBE_TOOL_TOOL_ID = "describe_tool";
// Local CLI catalog routes carry no per-request identity; never pretend these are real run/user IDs.
export const UNSCOPED_TOOL_CATALOG_ROUTE_PRINCIPAL_ID = "system-tool-catalog-route";
export const UNSCOPED_TOOL_CATALOG_ROUTE_RUN_ID = "unscoped-tool-catalog-route";
export interface AppendToolCatalogAttemptOptions {
  now?: () => string; newAttemptId?: () => string; onSinkError?: (error: unknown) => void;
}
export interface ToolAttemptAuditOptions extends AppendToolCatalogAttemptOptions { workspaceId: string }
function auditPorts(required: { sink: ToolAttemptAuditSink }, options: AppendToolCatalogAttemptOptions) {
  return { ...required, now: options.now ?? (() => new Date().toISOString()), newAttemptId: options.newAttemptId ?? randomUUID };
}
function auditOptions(options: AppendToolCatalogAttemptOptions) {
  return { onSinkError: options.onSinkError ?? (() => console.error("[tool-audit] sink threw; execution is unaffected")) };
}
export function withToolAttemptAudit(required: { inner: ToolExecutor; sink: ToolAttemptAuditSink }, options: ToolAttemptAuditOptions): ToolExecutor {
  return withDaemonAttemptAudit({ ...required, ...auditPorts(required, options), workspaceId: options.workspaceId, readErrorId: readToolErrorId }, auditOptions(options));
}
export function appendToolCatalogAttempt(required: { sink: ToolAttemptAuditSink; event: ToolCatalogAttemptEvent }, options: AppendToolCatalogAttemptOptions = {}): void {
  appendDaemonCatalogAttempt({ ...required, ...auditPorts(required, options) }, auditOptions(options));
}
export function withToolCatalogAudit(required: { catalog: ToolCatalogQuery; sink: ToolAttemptAuditSink; identity: ToolCatalogAuditIdentity }, options: AppendToolCatalogAttemptOptions = {}): ToolCatalogQuery {
  return withDaemonCatalogAudit({ ...required, ...auditPorts(required, options), searchToolId: SEARCH_TOOLS_TOOL_ID, describeToolId: DESCRIBE_TOOL_TOOL_ID }, auditOptions(options));
}
