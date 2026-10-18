import { useId } from "react";
import { AssistantToggleRow } from "./AssistantToggleRow";
import { useWiredAdminSubagents } from "./hooks/use-admin-subagents.hooks";

/** Owner toggle rendered in the existing assistant/theme form language; lifecycle lives in hooks. */
export function AdminSubagents({ t = (key: string) => key, useController = useWiredAdminSubagents }: {
  t?: (key: string) => string; useController?: typeof useWiredAdminSubagents;
}) {
  const controller = useController({ t });
  const ownerNoteId = useId();
  const ownerOnly = !!controller.settings && !controller.settings.canEdit;
  // The owner's switch is still locked when the server names a local env lock (see the dock hook).
  const lockReason = controller.settings?.canEdit ? controller.settings.unavailableReason : undefined;
  return <section className="assistant-switch assistant-subagents">
    {/* No agent handle: only the human owner may change the assistant's own tool grant. */}
    <AssistantToggleRow t={t} label={t("Full CLI access")}
      info={t("On by default for the local owner. Loads your CLI settings, skills, agents and MCP servers, and allows shell commands, file edits, subagents and workflows. Like a hand-run CLI, it can read local key files and write other sites. Forced off in production and hosted environments; visitors and other admins never receive it. Changes apply to new runs.")}
      checked={controller.settings?.enabled === true} describedBy={ownerOnly || lockReason ? ownerNoteId : undefined}
      disabled={!controller.settings?.canEdit || !!lockReason || !!controller.loadError || controller.busy}
      onChange={(enabled) => { void controller.setEnabled({ enabled }); }} />
    {ownerOnly && <p id={ownerNoteId} className="muted-cell">{t("Only the owner can change Full CLI access.")}</p>}
    {lockReason && <p id={ownerNoteId} className="muted-cell">{t(lockReason)}</p>}
    {!controller.settings && !controller.loadError && <p role="status">{t("Loading Full CLI access…")}</p>}
    {controller.busy && <p role="status">{t("Saving…")}</p>}
    {controller.loadError && <p className="save-error" role="alert">{controller.loadError}</p>}
    {controller.saveError && <p className="save-error" role="alert">{controller.saveError}</p>}
  </section>;
}
