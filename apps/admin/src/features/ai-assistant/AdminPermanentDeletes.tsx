import { ConfirmDialog } from "@jini-ai/admin/react";
import { PERMANENT_DELETE_DANGERS } from "@/lib/assistant-permanent-deletes";
import { AssistantToggleRow } from "./AssistantToggleRow";
import { useWiredAdminPermanentDeletes } from "./hooks/use-admin-permanent-deletes.hooks";
/** Native controls use the adjacent subagents form language; logic lives in the hook. */
export function AdminPermanentDeletes({ t = (key: string) => key, useController = useWiredAdminPermanentDeletes }: {
  t?: (key: string) => string; useController?: typeof useWiredAdminPermanentDeletes;
}) {
  const controller = useController({ t });
  return <section className="assistant-switch assistant-permanent-deletes">
    <AssistantToggleRow t={t} label={t("Allow permanent deletes from chat")}
      info={t("Off by default. Only checked tools are allowed. Each delete still requires a human confirmation of the exact targets. Prefer Trash.")}
      checked={controller.settings?.enabled === true}
      disabled={!controller.settings?.canEdit || !!controller.loadError || (controller.busy && !controller.dialog.open)}
      onChange={(enabled) => { void controller.setEnabled({ enabled }); }} />
    {controller.settings && !controller.settings.canEdit && <p className="muted-cell">{t("Only the owner can change permanent delete access.")}</p>}
    {!controller.settings && !controller.loadError && <p role="status">{t("Loading permanent delete settings…")}</p>}
    {controller.settings?.enabled && <fieldset disabled={!controller.settings.canEdit || controller.busy || !!controller.loadError}>
      <legend>{t("Allowed permanent deletes")}</legend>
      <div className="permanent-delete-actions"><button type="button" className="btn-ghost" onClick={() => { void controller.selectAll({}); }}>{t("Select all")}</button>
        <button type="button" className="btn-ghost" onClick={() => { void controller.selectNone({}); }}>{t("Select none")}</button></div>
      {controller.groups.map(group => <fieldset key={group.label}><legend>{t(group.label)}</legend>
        {group.tools.map(tool => <div className="permanent-delete-option" key={tool.id}>
          <label><input type="checkbox" checked={controller.settings?.allowedToolIds.includes(tool.id) === true}
            onChange={event => { void controller.setTool({ toolId: tool.id, checked: event.target.checked }); }} />{t(tool.label)}</label>
          {tool.adminPath ? <a href={tool.adminPath}>{t("Open admin screen")}</a> : <span className="muted-cell">{t("No Tovu admin screen for this operation.")}</span>}
        </div>)}
      </fieldset>)}
    </fieldset>}
    {controller.busy && <p role="status">{t("Waiting for confirmation or saving…")}</p>}
    {controller.loadError && <p className="save-error" role="alert">{controller.loadError}</p>}
    {controller.saveError && <p className="save-error" role="alert">{controller.saveError}</p>}
    <ConfirmDialog {...controller.dialog} agentMayConfirm={false}
      body={<ul>{PERMANENT_DELETE_DANGERS.map(danger => <li key={danger}>{t(danger)}</li>)}</ul>} />
  </section>;
}
