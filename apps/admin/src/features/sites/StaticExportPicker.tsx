import { useId, useState } from "react";
import { PopoverMenu } from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { SiteExportController } from "./hooks/use-site-transfer.hooks";

/** Download-specific split action; the browser popover owns outside/Escape dismissal and focus.
 * Checkbox changes keep the panel open. Selection and requests belong to the controller.
 */
export function StaticExportPicker({ controller, t }: { controller: SiteExportController; t: Translate }) {
  const id = useId(), [open, setOpen] = useState(false);
  const busy = controller.exporting || controller.exportingStatic;
  const disabled = busy || !controller.staticExportReady;
  return (
    <div className="static-export-split">
      <button type="button" className="btn-secondary static-export-action" disabled={disabled} aria-busy={controller.exportingStatic}
        onClick={() => void controller.exportStaticSite()}
        {...agentHandle({ handle: "sites-export-static" }, { role: "button", label: "Export static site as a zip" })}>
        {controller.exportingStatic ? <span className="site-transfer-spinner" aria-hidden="true" /> : null}
        {controller.exportingStatic ? t("Exporting…") : t("Export static site")}
      </button>
      <button type="button" className="btn-secondary static-export-toggle" popoverTarget={id} aria-label={t("Choose sites to export")}
        aria-expanded={open} aria-controls={id} onClick={() => setOpen(previous => !previous)}>
        <i className="ri-arrow-down-s-line" aria-hidden="true" />
      </button>
      <div id={id} popover="auto" className="static-export-popover" hidden={!open}
        onToggle={event => setOpen((event.nativeEvent as ToggleEvent).newState === "open")}>
        <PopoverMenu className="static-export-panel">
          <StaticExportChoices controller={controller} t={t} />
        </PopoverMenu>
      </div>
    </div>
  );
}


/** Loading/error copy shares the picker panel; unavailable rosters cannot offer selections. */
function StaticExportChoices({ controller, t }: { controller: SiteExportController; t: Translate }) {
  if (controller.staticOptionsLoading) return <p role="status">{t("Loading sites…")}</p>;
  if (controller.staticOptionsError) return <p role="alert">{controller.staticOptionsError}</p>;
  return <StaticExportCheckboxes controller={controller} t={t} />;
}

/** Native checkbox rows preserve Tab/Space behavior and a mixed Select-all state. */
function StaticExportCheckboxes({ controller, t }: { controller: SiteExportController; t: Translate }) {
  const busy = controller.exporting || controller.exportingStatic;
  const themes = controller.staticThemes ?? [];
  const selected = new Set(controller.selectedThemeIds);
  const mixed = selected.size > 0 && selected.size < themes.length;
  const all = themes.length > 0 && selected.size === themes.length;
  return <div role="group" aria-label={t("Sites to export")}>
    <label className="static-export-check static-export-all">
      <input ref={element => { if (element) element.indeterminate = mixed; }} type="checkbox"
        checked={all} aria-checked={mixed ? "mixed" : all}
        disabled={busy || !themes.length} onChange={event => controller.selectAllStaticThemes({ checked: event.target.checked })} />
      {t("Select all")}
    </label>
    <div className="static-export-theme-list">
      {themes.map(theme => <label key={theme.themeId} className="static-export-check">
        <input type="checkbox" checked={selected.has(theme.themeId)} disabled={busy} onChange={() => controller.toggleStaticTheme({ themeId: theme.themeId })} />
        <span>{theme.name}</span>
      </label>)}
      {!themes.length ? <p>{t("No sites available to export.")}</p> : null}
    </div>
  </div>;
}
