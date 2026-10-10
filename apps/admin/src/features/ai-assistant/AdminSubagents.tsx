import { ConfirmDialog } from "@jini-ai/admin/react";
import { useId } from "react";
import { AssistantToggleRow } from "./AssistantToggleRow";
import { useWiredAdminSubagents } from "./hooks/use-admin-subagents.hooks";

/** Owner opt-in rendered in the existing assistant/theme form language; lifecycle lives in hooks. */
export function AdminSubagents({ t = (key: string) => key, useController = useWiredAdminSubagents }: {
  t?: (key: string) => string; useController?: typeof useWiredAdminSubagents;
}) {
  const controller = useController({ t });
  const ownerNoteId = useId();
  const ownerOnly = !!controller.settings && !controller.settings.canEdit;
  return <section className="assistant-switch assistant-subagents">
    {/* No agent handle: this is human consent to expand the assistant's own tool grant.
        Keep the opener enabled while the modal owns focus so cancellation can restore it. */}
    <AssistantToggleRow t={t} label={t("Allow the admin assistant to spawn subagents")}
      info={t("Off by default. Applies to Claude CLI runs only; BYOK and other CLIs are unaffected. Changes apply to new runs; existing subagents may continue.")}
      checked={controller.settings?.enabled === true} describedBy={ownerOnly ? ownerNoteId : undefined}
      disabled={!controller.settings?.canEdit || !!controller.loadError || (controller.busy && !controller.dialog.open)}
      onChange={(enabled) => { void controller.setEnabled({ enabled }); }} />
    {ownerOnly && <p id={ownerNoteId} className="muted-cell">{t("Only the owner can change subagent access.")}</p>}
    {!controller.settings && !controller.loadError && <p role="status">{t("Loading subagent settings…")}</p>}
    {controller.busy && <p role="status">{t("Waiting for confirmation or saving…")}</p>}
    {controller.loadError && <p className="save-error" role="alert">{controller.loadError}</p>}
    {controller.saveError && <p className="save-error" role="alert">{controller.saveError}</p>}
    <ConfirmDialog {...controller.dialog} agentMayConfirm={false}
      body={<div style={{ whiteSpace: "pre-line" }}>{controller.dialog.body}</div>} />
  </section>;
}
