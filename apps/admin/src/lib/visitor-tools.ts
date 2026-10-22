import { authenticatedAdminRequest, WORKSPACE_ID } from "./api";

/** Mirrors `VisitorToolsView` in `apps/website/src/contracts/site-assistant/visitor-tools-management.ts`.
 * The admin page and the assistant chat's `visitor_tools_list` read the same service, so this shape
 * is the server's, field for field. `policyState: "invalid"` means the saved policy is unreadable and
 * every tool is effectively Off until the site-wide Off repair succeeds. */
export type VisitorToolMode = "auto" | "ask" | "off";
export interface VisitorToolLimits { perIpPerHour: number; perSitePerDay: number }
export interface VisitorToolView {
  id: string;
  source: "builtin" | "plugin" | "created" | "unavailable";
  sourceRevision: string;
  title: string;
  description: string;
  effect: "read" | "write";
  availability: { available: boolean; reason?: string };
  publication?: { endpoint: string; credentialId: string; returnedFields: string[] };
  mode: VisitorToolMode;
  limits: VisitorToolLimits;
}
export interface VisitorToolsView {
  revisionSeq: number;
  policyState?: "invalid";
  defaults: VisitorToolLimits;
  callsPerTurn: number;
  tools: VisitorToolView[];
}
/** `toolId: "site"` patches every available tool at once (the invalid-policy repair uses it). */
export interface VisitorToolConfigureInput {
  toolId: string;
  expectedRevisionSeq: number;
  mode?: VisitorToolMode;
  limits?: Partial<VisitorToolLimits>;
}
export interface VisitorToolsPort {
  list(required: Record<string, never>, optional?: Record<string, never>): Promise<VisitorToolsView>;
  configure(required: VisitorToolConfigureInput, optional?: Record<string, never>): Promise<VisitorToolsView>;
}

/** HTTP 409 code: someone else saved first; reload, never auto-retry. */
export const VISITOR_TOOLS_CONFLICT_CODE = "VISITOR_TOOLS_REVISION_CONFLICT";
/** Settings-ledger namespace the policy is stored under; the shared settings feed names it on change. */
export const VISITOR_TOOLS_NAMESPACE = "site.assistant";

const path = `/workspaces/${WORKSPACE_ID}/assistant/visitor-tools`;
/** Thin host adapter over the shared authenticated request (session, error and reconnect boundary). */
export const visitorToolsPort: VisitorToolsPort = {
  list: async () => (await authenticatedAdminRequest<{ data: VisitorToolsView }>({ path, method: "GET" })).data,
  configure: async (body) => (await authenticatedAdminRequest<{ data: VisitorToolsView }>({ path, method: "PUT", body })).data,
};
