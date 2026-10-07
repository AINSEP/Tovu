import type { WebMcpUserInteraction } from "@jini-ai/agentic";

export interface AdminPageApproval extends WebMcpUserInteraction { approvalId: string }
interface Snapshot { pending: AdminPageApproval | null; error: string | null }

/** CMS page-local consent adapter. A proposal returns immediately so a sequential browser agent
 * can answer it. Never infer consent from a proposed click, or recursively confirm the response.
 * NEEDS-JINI: extract this single-use request lifecycle into the shared agentic/admin ports. */
export function createAdminPageApprovalStore(
  _required: Record<string, never>,
  { createId = () => crypto.randomUUID() }: { createId?: () => string } = {},
) {
  let snapshot: Snapshot = { pending: null, error: null };
  let action: (() => Promise<unknown>) | null = null;
  let detach: (() => void) | null = null;
  const listeners = new Set<() => void>();
  function publish(next: Snapshot) { snapshot = next; for (const listener of listeners) listener(); }
  function clear() {
    detach?.(); detach = null; action = null;
    publish({ pending: null, error: null });
  }
  return {
    getSnapshot: (_required: Record<string, never> = {}, _optional: Record<string, never> = {}) => snapshot,
    subscribe: ({ listener }: { listener: () => void }, _optional: Record<string, never> = {}) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    propose({ interaction, execute, signal }: { interaction: WebMcpUserInteraction; execute: () => Promise<unknown>; signal: AbortSignal }, _optional: Record<string, never> = {}) {
      if (signal.aborted) throw new Error("WebMCP admin access is disabled or closed");
      if (snapshot.pending) throw new Error("A page approval is already pending");
      const pending = { ...interaction, approvalId: createId() };
      action = execute;
      signal.addEventListener("abort", clear, { once: true });
      detach = () => signal.removeEventListener("abort", clear);
      publish({ pending, error: null });
      return { status: "approval_required", approvalId: pending.approvalId, capabilityId: pending.capability.id, args: pending.args, responseTool: "admin.respond_page_approval" };
    },
    async respond({ approvalId, approved }: { approvalId: string; approved: boolean }, _optional: Record<string, never> = {}) {
      if (!snapshot.pending || snapshot.pending.approvalId !== approvalId || !action) throw new Error("Page approval is missing or expired");
      const execute = action;
      // Consume before awaiting: double clicks/replayed tool replies cannot run this write twice.
      clear();
      if (!approved) return { status: "declined" };
      try { return await execute(); }
      catch (error) {
        publish({ ...snapshot, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
  };
}
export type AdminPageApprovalStore = ReturnType<typeof createAdminPageApprovalStore>;
export const adminPageApprovals = createAdminPageApprovalStore({});
