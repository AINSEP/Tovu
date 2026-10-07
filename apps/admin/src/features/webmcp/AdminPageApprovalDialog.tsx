import { ConfirmDialog } from "@jini-ai/admin/react";
import type { AdminPageApprovalStore } from "./admin-page-approval.store";
import { useAdminPageApproval } from "./admin-page-approval.hooks";
import { t } from "./webmcp-i18n";
import "./admin-page-approval.css";

/** Same app confirmation primitive as logout/delete, with an explicit answer tool for WebMCP. */
export function AdminPageApprovalDialog({ locale, approvals }: { locale: string; approvals?: AdminPageApprovalStore }) {
  const approval = useAdminPageApproval({ approvals });
  return <>
    {approval.pending ? <ConfirmDialog
      open
      title={t(locale, "Allow the browser agent to perform this admin action?")}
      body={<pre className="webmcp-page-approval-input">{approval.details}</pre>}
      confirmLabel={t(locale, "Confirm")}
      cancelLabel={t(locale, "Cancel")}
      agentHandle="webmcp-page-approval"
      onConfirm={approval.confirm}
      onCancel={approval.cancel}
    /> : null}
    {approval.error ? <p className="notice error" role="alert">{approval.error}</p> : null}
  </>;
}
