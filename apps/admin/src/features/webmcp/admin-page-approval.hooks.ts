import { useCallback, useSyncExternalStore } from "react";
import { adminPageApprovals, type AdminPageApprovalStore } from "./admin-page-approval.store";

/** The app dialog and the response tool share one decision; human errors stay visible in-app. */
export function useAdminPageApproval({ approvals = adminPageApprovals }: { approvals?: AdminPageApprovalStore }, _optional: Record<string, never> = {}) {
  const subscribe = useCallback((listener: () => void) => approvals.subscribe({ listener }), [approvals]);
  const getSnapshot = useCallback(() => approvals.getSnapshot({}), [approvals]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  function answer(approved: boolean) {
    if (!snapshot.pending) return;
    void approvals.respond({ approvalId: snapshot.pending.approvalId, approved }).catch(() => {
      // The store retains the actual failure for the app's alert; no unhandled human-click rejection.
    });
  }
  return { ...snapshot, details: snapshot.pending ? `${snapshot.pending.capability.id}\n${JSON.stringify(snapshot.pending.args, null, 2)}` : "", confirm: () => answer(true), cancel: () => answer(false) };
}
