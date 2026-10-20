import { ConfirmDialog } from "@jini-ai/admin/react";
import { PERMANENT_DELETE_DANGERS } from "@/lib/assistant-permanent-deletes";
import { AssistantToggleRow } from "./AssistantToggleRow";
import { OwnerGrantStatus } from "./OwnerGrantStatus";
import { useWiredAdminPermanentDeletes } from "./hooks/use-admin-permanent-deletes.hooks";

type PermanentDeletesController = ReturnType<typeof useWiredAdminPermanentDeletes>;
type PermanentDeletesSettings = NonNullable<PermanentDeletesController["settings"]>;

/** Pure master-switch state. While the consent dialog is open the master stays enabled even though
 * the controller is busy, so the dialog can return focus to it on cancel.
 * @param required - The controller's server grant (null until loaded), errors, busy flag and dialog.
 * @returns checked, disabled, owner-only note and loading flags for the master row.
 * @complexity O(1). */
function permanentDeletesMaster(required: Pick<PermanentDeletesController, "settings" | "loadError" | "busy" | "dialog">) {
  const settings = required.settings;
  return { checked: settings?.enabled === true, ownerOnly: !!settings && !settings.canEdit, loading: !settings && !required.loadError,
    disabled: !settings?.canEdit || !!required.loadError || (required.busy && !required.dialog.open) };
}

/** Per-tool allow list, shown only while the master is ON; every change autosaves through the controller.
 * @param required - Translation port, the controller and its loaded settings. */
function PermanentDeleteChecklist({ t, controller, settings }: {
  t: (key: string) => string; controller: PermanentDeletesController; settings: PermanentDeletesSettings;
}) {
  return <fieldset disabled={!settings.canEdit || controller.busy || !!controller.loadError}>
    <legend>{t("Allowed permanent deletes")}</legend>
    <div className="permanent-delete-actions"><button type="button" className="btn-ghost" onClick={() => { void controller.selectAll({}); }}>{t("Select all")}</button>
      <button type="button" className="btn-ghost" onClick={() => { void controller.selectNone({}); }}>{t("Select none")}</button></div>
    {controller.groups.map(group => <fieldset key={group.label}><legend>{t(group.label)}</legend>
      {group.tools.map(tool => <div className="permanent-delete-option" key={tool.id}>
        <label><input type="checkbox" checked={settings.allowedToolIds.includes(tool.id)}
          onChange={event => { void controller.setTool({ toolId: tool.id, checked: event.target.checked }); }} />{t(tool.label)}</label>
        {tool.adminPath ? <a href={tool.adminPath}>{t("Open admin screen")}</a> : <span className="muted-cell">{t("No Tovu admin screen for this operation.")}</span>}
      </div>)}
    </fieldset>)}
  </fieldset>;
}

/** Native controls use the adjacent subagents form language; logic lives in the hook. */
export function AdminPermanentDeletes({ t = (key: string) => key, useController = useWiredAdminPermanentDeletes }: {
  t?: (key: string) => string; useController?: typeof useWiredAdminPermanentDeletes;
}) {
  const controller = useController({ t });
  const master = permanentDeletesMaster(controller);
  return <section className="assistant-switch assistant-permanent-deletes">
    <AssistantToggleRow t={t} label={t("Allow permanent deletes from chat")}
      info={t("Off by default. Only checked tools are allowed. Each delete still requires a human confirmation of the exact targets. Prefer Trash.")}
      checked={master.checked} disabled={master.disabled}
      onChange={(enabled) => { void controller.setEnabled({ enabled }); }} />
    {master.ownerOnly && <p className="muted-cell">{t("Only the owner can change permanent delete access.")}</p>}
    {master.loading && <p role="status">{t("Loading permanent delete settings…")}</p>}
    {controller.settings?.enabled && <PermanentDeleteChecklist t={t} controller={controller} settings={controller.settings} />}
    <OwnerGrantStatus t={t} busyKey="Waiting for confirmation or saving…" busy={controller.busy} loadError={controller.loadError} saveError={controller.saveError} />
    <ConfirmDialog {...controller.dialog} agentMayConfirm={false}
      body={<ul>{PERMANENT_DELETE_DANGERS.map(danger => <li key={danger}>{t(danger)}</li>)}</ul>} />
  </section>;
}
