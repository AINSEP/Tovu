import { useId } from "react";
import { ConfirmDialog } from "@jini-ai/admin/react";
import { AssistantToggleRow } from "./AssistantToggleRow";
import { OwnerGrantStatus } from "./OwnerGrantStatus";
import { useWiredAdminSubagents } from "./hooks/use-admin-subagents.hooks";

type SubagentsController = ReturnType<typeof useWiredAdminSubagents>;

/** Pure switch state: which note explains a locked switch, and when the switch must stay locked.
 * @param required - The controller's server grant (null until loaded), load error and busy flag.
 * @returns checked, owner-only note, env-lock reason and the disabled flag for the toggle row.
 * @complexity O(1). */
function subagentsSwitch(required: Pick<SubagentsController, "settings" | "loadError" | "busy">) {
  const settings = required.settings;
  // The owner's switch is still locked when the server names a local env lock (see the dock hook).
  const lockReason = settings?.canEdit ? settings.unavailableReason : undefined;
  return { checked: settings?.enabled === true, ownerOnly: !!settings && !settings.canEdit, lockReason,
    disabled: !settings?.canEdit || !!lockReason || !!required.loadError || required.busy };
}

/** Source choices patch one agent; connected host tools retain their existing gates.
 * @complexity O(a) for the fixed agent registry, with no extra reads. */
function AgentToolSources({ controller, disabled, t }: { controller: SubagentsController; disabled: boolean; t: (key: string) => string }) {
  return (
    <div className="assistant-tool-sources">
      <p>{t("Tools provided here")}</p>
      <p className="muted-cell">{t("Tovu and Jini tools, enabled plugin tools, and connected servers.")}</p>
      {controller.settings?.agents?.map(agent => <AssistantToggleRow key={agent.id} t={t}
        label={t(`Also use ${agent.name}'s personal MCP servers.`)}
        info={t(`Loads MCP servers set up in ${agent.name} or this project. Tovu doesn't approve or log them. Applies to ${agent.name}'s other chats on this site.`)}
        checked={controller.settings?.byAgent?.[agent.id]?.capabilities?.userMcp ?? controller.settings?.capabilities?.userMcp ?? false}
        disabled={disabled}
        onChange={enabled => { void controller.setAgentMcp({ agentId: agent.id, enabled }); }} />)}
    </div>
  );
}

/** Owner toggle rendered in the existing assistant/theme form language; lifecycle lives in hooks. */
export function AdminSubagents({ t = (key: string) => key, useController = useWiredAdminSubagents }: {
  t?: (key: string) => string; useController?: typeof useWiredAdminSubagents;
}) {
  const controller = useController({ t });
  const ownerNoteId = useId();
  const view = subagentsSwitch(controller);
  return <section className="assistant-switch assistant-subagents">
    {/* No agent handle: only the human owner may change the assistant's own tool grant. */}
    <AssistantToggleRow t={t} label={t("Full CLI access")}
      info={t("On by default for the local owner. Allows shell commands, file edits, subagents and workflows. Personal MCP servers are off unless allowed separately. Forced off in production and hosted environments; visitors and other admins never receive it. Lowering access stops affected answers immediately.")}
      checked={view.checked} describedBy={view.ownerOnly || view.lockReason ? ownerNoteId : undefined}
      disabled={view.disabled}
      onChange={(enabled) => { void controller.setEnabled({ enabled }); }} />
    {view.ownerOnly && <p id={ownerNoteId} className="muted-cell">{t("Only the owner can change Full CLI access.")}</p>}
    {view.lockReason && <p id={ownerNoteId} className="muted-cell">{t(view.lockReason)}</p>}
    <AgentToolSources controller={controller} disabled={view.disabled} t={t} />
    {!controller.settings && !controller.loadError && <p role="status">{t("Loading Full CLI access…")}</p>}
    <ConfirmDialog {...controller.dialog} agentMayConfirm={false} />
    <OwnerGrantStatus t={t} busyKey="Saving…" busy={controller.busy} loadError={controller.loadError} saveError={controller.saveError} />
  </section>;
}
