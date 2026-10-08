import type { WebMcpUserInteraction } from "@jini-ai/agentic";
import { createApprovalProposalStore } from "@jini-ai/core";

export interface AdminPageApproval extends WebMcpUserInteraction { approvalId: string }
interface Snapshot { pending: AdminPageApproval | null; error: string | null }

/** CMS page-local consent adapter. A proposal returns immediately so a sequential browser agent
 * can answer it. Never infer consent from a proposed click, or recursively confirm the response.
 * Jini owns the single-use proposal transport; this host projects its CMS response and snapshot. */
export function createAdminPageApprovalStore(
  _required: Record<string, never>,
  { createId = () => crypto.randomUUID() }: { createId?: () => string } = {},
) {
  const transport = createApprovalProposalStore<WebMcpUserInteraction>({ responseTool: "admin.respond_page_approval",
    messages: { closed: "WebMCP admin access is disabled or closed", pending: "A page approval is already pending", missing: "Page approval is missing or expired" },
  }, { createId });
  let previous: ReturnType<typeof transport.getSnapshot> | undefined;
  let snapshot: Snapshot = { pending: null, error: null };
  return {
    getSnapshot: (_required: Record<string, never> = {}, _optional: Record<string, never> = {}) => {
      const current = transport.getSnapshot({});
      if (current !== previous) {
        previous = current;
        snapshot = { pending: current.pending ? { ...current.pending.description, approvalId: current.pending.approvalId } : null, error: current.error };
      }
      return snapshot;
    },
    subscribe: transport.subscribe,
    propose({ interaction, execute, signal }: { interaction: WebMcpUserInteraction; execute: () => Promise<unknown>; signal: AbortSignal }, _optional: Record<string, never> = {}) {
      const proposal = transport.propose({ description: interaction, execute, signal });
      return { status: proposal.status, approvalId: proposal.approvalId, capabilityId: proposal.description.capability.id, args: proposal.description.args, responseTool: proposal.responseTool };
    },
    // Consume before awaiting: double clicks/replayed tool replies cannot run this write twice.
    respond: transport.respond,
  };
}
export type AdminPageApprovalStore = ReturnType<typeof createAdminPageApprovalStore>;
export const adminPageApprovals = createAdminPageApprovalStore({});
