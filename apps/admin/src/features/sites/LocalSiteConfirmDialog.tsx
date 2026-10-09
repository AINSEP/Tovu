import { ConfirmDialog } from "@jini-ai/admin/react";
import type { SiteConfirmController } from "./hooks/use-site-confirm.hooks";

/** The shared modal behind Move to Trash, Delete permanently and Switch now — focus trap, Escape,
 *  and focus back on the control that opened it come from `ConfirmDialog` itself. Renders nothing
 *  for a controller without one (test fakes, older callers). */
export function LocalSiteConfirmDialog({ dialog }: { dialog?: SiteConfirmController }) {
  if (!dialog) return null;
  return <ConfirmDialog open={dialog.open} agentHandle="sites-local-confirm" title={dialog.title} body={<p>{dialog.body}</p>}
    confirmLabel={dialog.confirmLabel} tone={dialog.tone} onConfirm={dialog.onConfirm} onCancel={dialog.onCancel} />;
}
