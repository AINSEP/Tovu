import { useId, type ReactNode } from "react";
import { interpolate, type Translate } from "@jini-ai/ui/panel-kit";
import { SettingsDialogShell } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { useSitesConfig } from "./hooks/use-sites-config.hooks";

type SitesSettings = ReturnType<typeof useSitesConfig>;

/** Jini supplies settings dialog chrome; the hook owns loading, drafts, saving and remedies.
 *
 *  Layout (2026-10-09, owner: "awful ui"): the entry point is a quiet secondary button at the right
 *  end of the Sites tab row (`tabs` is that row's `TabBar`), not a full-width primary bar. The dialog
 *  is a stacked form — label above, capped control, one hint line or an ⓘ — with the config path as
 *  a muted footer beside Save. Every control and sentence the flat version had is still here. */
export function SitesHomeSetting({ home: _home, tabs, useSettings = useSitesConfig, t = (key) => key }: { home: string; tabs?: ReactNode; useSettings?: typeof useSitesConfig; t?: Translate }) {
  const settings = useSettings({});
  return <>
    <div className="sites-tabs-row">
      {tabs}
      <button type="button" className="btn-secondary sites-settings-button" onClick={settings.show}><GearIcon />{t("Sites settings")}</button>
    </div>
    <SitesSyncWarning settings={settings} t={t} />
    {settings.error && !settings.open && <p className="notice error" role="alert">{settings.error}</p>}
    {settings.open && <SettingsDialogShell onClose={settings.close} fullscreenEnabled={false} dialogAriaLabelledBy="sites-settings-title" className="sites-settings-dialog"
      tabs={[{ id: "sites", label: t("Sites"), title: t("Sites settings"), panel: <SitesSettingsForm settings={settings} t={t} /> }]} />}
  </>;
}

/** The cloud-sync warning and its two remedies; nothing when the folder is not synced. */
function SitesSyncWarning({ settings, t }: { settings: SitesSettings; t: Translate }) {
  const warning = settings.config?.warning;
  if (!warning) return null;
  return (
    <div className="notice warning sites-sync-warning" role="alert">
      <p>{interpolate({ template: t(settings.config?.databases === "appData" ? "{provider} syncs this folder. New databases use app-data for safety." : "{provider} syncs this folder. Store databases in app-data to prevent corruption."), vars: { provider: warning.provider } })}</p>
      <div className="sites-sync-warning-actions">
        <button type="button" className="btn-primary" disabled={settings.saving} onClick={() => void settings.useAppData()}>{t("Store databases in app-data")}</button>
        <button type="button" className="btn-secondary" disabled={settings.saving || settings.config?.overrides.sitesHome} onClick={() => void settings.useLocalHome()}>{interpolate({ template: t("Use {path}"), vars: { path: warning.localHome } })}</button>
      </div>
    </div>
  );
}

function SitesSettingsForm({ settings, t }: { settings: SitesSettings; t: Translate }) {
  const id = useId();
  return (
    <form className="sites-settings-form" onSubmit={(event) => { event.preventDefault(); void settings.save(); }}>
      <SitesHomeField settings={settings} id={id} t={t} />
      <SitesRootsField settings={settings} t={t} />
      <SitesDatabasesField settings={settings} id={id} t={t} />
      {settings.error && <p className="notice error" role="alert">{settings.error}</p>}
      <SitesSettingsFooter settings={settings} t={t} />
    </form>
  );
}

/** The "{name} overrides this setting." hint under a field an environment variable pins. */
function OverrideHint({ name, t }: { name: string; t: Translate }) {
  return <p className="field-hint">{interpolate({ template: t("{name} overrides this setting."), vars: { name } })}</p>;
}

/** The new-websites folder; read-only (with its hint) while `TOVU_SITES_HOME` pins it. */
function SitesHomeField({ settings, id, t }: { settings: SitesSettings; id: string; t: Translate }) {
  const overridden = settings.config?.overrides.sitesHome;
  return (
    <div className="sites-settings-field">
      <FieldLabel htmlFor={`${id}-home`} label={t("New websites folder")} info={t("New sites are created in this folder. Existing site folders stay where they are.")} handle="sites-settings-home-info" t={t} />
      <input id={`${id}-home`} className="field-mono" value={settings.home} title={settings.home} spellCheck={false} autoComplete="off"
        disabled={overridden} onChange={(event) => settings.setHome(event.target.value)} />
      {overridden && <OverrideHint name="TOVU_SITES_HOME" t={t} />}
    </div>
  );
}

/** The extra sites folders group; its rows are disabled (with a hint) while `TOVU_SITE_ROOTS` pins them. */
function SitesRootsField({ settings, t }: { settings: SitesSettings; t: Translate }) {
  const overridden = settings.config?.overrides.siteRoots ?? false;
  return (
    <fieldset className="sites-settings-field">
      <legend><FieldLabel label={t("Extra sites folders")} info={t("Sites inside these folders are listed here too.")} handle="sites-settings-roots-info" t={t} /></legend>
      <SitesRootRows settings={settings} disabled={overridden} t={t} />
      {overridden && <OverrideHint name="TOVU_SITE_ROOTS" t={t} />}
    </fieldset>
  );
}

/** Where new databases go: inside each site folder, or the OS app-data folder. */
function SitesDatabasesField({ settings, id, t }: { settings: SitesSettings; id: string; t: Translate }) {
  return (
    <div className="sites-settings-field">
      <FieldLabel htmlFor={`${id}-databases`} label={t("Database location")} info={t("App-data site folders are not self-contained. Transfer their databases too.")} handle="sites-settings-databases-info" t={t} />
      <select id={`${id}-databases`} value={settings.databases} onChange={(event) => settings.setDatabases(event.target.value as "inSite" | "appData")}>
        <option value="inSite">{t("Inside each site (data.nosync)")}</option><option value="appData">{t("OS app-data")}</option>
      </select>
      <p className="field-hint">{t("Existing databases keep their location. Stop the site before moving databases.")}</p>
    </div>
  );
}

/** The config path as a muted footer beside Save; Save waits for the config to load. */
function SitesSettingsFooter({ settings, t }: { settings: SitesSettings; t: Translate }) {
  return (
    <div className="sites-settings-footer">
      {settings.config && <p className="sites-settings-saved-in" title={settings.config.configPath}>{interpolate({ template: t("Saved in {path}"), vars: { path: settings.config.configPath } })}</p>}
      <button type="submit" className="btn-primary" disabled={settings.saving || !settings.config}>{t("Save")}</button>
    </div>
  );
}

/** A field's label with its ⓘ. `htmlFor` is omitted inside a `<legend>`, which labels its group. */
function FieldLabel({ htmlFor, label, info, handle, t }: { htmlFor?: string; label: string; info: string; handle: string; t: Translate }) {
  return (
    <span className="sites-settings-label">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      <InfoTip label={info} placement="inline" triggerLabel={interpolate({ template: t("About {name}"), vars: { name: label } })} agentHandle={handle} />
    </span>
  );
}

/** One row per extra folder, each removable, then "Add folder". Blank rows are dropped on save. */
function SitesRootRows({ settings, disabled, t }: { settings: SitesSettings; disabled: boolean; t: Translate }) {
  return <>
    {settings.rootList.length === 0
      ? <p className="field-hint">{t("No extra folders.")}</p>
      : <ul className="sites-settings-roots">
        {settings.rootList.map((root, index) => (
          // Index keys: rows are plain strings that may repeat or be blank while being typed.
          <li key={index} className="sites-settings-root">
            <input className="field-mono" value={root} title={root} spellCheck={false} autoComplete="off" disabled={disabled}
              autoFocus={index === settings.addedIndex}
              aria-label={interpolate({ template: t("Extra folder {number}"), vars: { number: index + 1 } })}
              onChange={(event) => settings.setRootAt(index, event.target.value)} />
            <button type="button" className="btn-ghost sites-settings-root-remove" disabled={disabled}
              aria-label={interpolate({ template: t("Remove folder {number}"), vars: { number: index + 1 } })}
              onClick={() => settings.removeRoot(index)}><CloseIcon /></button>
          </li>
        ))}
      </ul>}
    <button type="button" className="btn-secondary sites-settings-add" disabled={disabled} onClick={settings.addRoot}>
      <span aria-hidden="true">+</span>{t("Add folder")}
    </button>
  </>;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
