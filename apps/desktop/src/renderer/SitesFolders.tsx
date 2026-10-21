/** Shared local settings are available from Websites and the desktop Settings menu. */
import { SettingsDialogShell } from '@jini-ai/ui';
// The shell's stylesheet (`@jini-ai/ui/tabbed-dialog.css`) is imported by `main.tsx`, the renderer's
// composition root, right before `app.css` so this app's overrides still win the cascade. A CSS
// import here made this module unloadable outside Vite, so no test could render the dialog.
import { useSiteFolders } from './use-site-folders.hooks.js';
import { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';
import { useSitesFoldersDialog } from './use-sites-folders-dialog.hooks.js';

/** Jini supplies dialog lifecycle/accessibility; hooks own all state and preload effects. */
export function SitesFolders({ useSettings = useSiteFolders, Shell }: {
  useSettings?: typeof useSiteFolders;
  /** See {@link SitesFoldersDialog}'s `Shell`. */
  Shell?: typeof SettingsDialogShell;
} = {}) {
  const settings = useSiteStorageSettings({}, { useFolders: useSettings });
  return <SitesFoldersDialog settings={settings} Shell={Shell} />;
}

/** Kept outside the dropdown: closing its menu never unmounts a draft or a dialog.
 * `jini-tooltip` tips render through the TooltipLayer in main.tsx. */
export function SitesFoldersDialog({ settings, showTrigger, Shell = SettingsDialogShell }: {
  settings: ReturnType<typeof useSiteStorageSettings>;
  showTrigger?: boolean;
  /** The dialog frame; defaults to Jini's `SettingsDialogShell`. Injectable because a linked Jini
   *  tree brings its own React copy, whose hooks cannot run inside this app's test renderer. */
  Shell?: typeof SettingsDialogShell;
}) {
  const view = useSitesFoldersDialog({ settings }, { showTrigger });
  const warning = <SitesFoldersWarning settings={settings} view={view} />;
  return <>
    {view.showTrigger && <button type="button" className="button button--quiet" onClick={settings.show}>Sites settings</button>}
    {view.showOutsideWarning && warning}
    {settings.open && <Shell onClose={settings.close} fullscreenEnabled={false} dialogAriaLabelledBy="desktop-sites-settings-title"
      className="sites-settings-dialog"
      tabs={[{ id: 'sites', label: 'Sites', title: 'Sites settings', panel:
        <form className="sites-settings" aria-busy={settings.busy} onSubmit={view.onSubmit}>
          {warning}
          <div className="sites-settings__row">
            <div className="sites-settings__label">
              <span id="sites-settings-home-label">New websites folder</span>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="New websites are created in this folder." data-tooltip="New websites are created in this folder." />
            </div>
            <div className="sites-settings__control">
              <span className="sites-settings__path sites-settings__path--field jini-tooltip" data-tooltip={settings.folders.home}>
                <span className="sites-settings__path-head">{view.home.head}</span>
                <span className="sites-settings__path-tail">{view.home.tail}</span>
              </span>
              <button type="button" className="button button--quiet" disabled={view.homeDisabled} onClick={view.onChooseHome}>Choose folder</button>
            </div>
            {view.homeOverridden && <p className="sites-settings__note">TOVU_SITES_HOME overrides this setting.</p>}
          </div>

          <div className="sites-settings__row sites-settings__row--stack">
            <div className="sites-settings__label">
              <span id="sites-settings-roots-label">Site folders</span>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="Rescan finds websites in these folders. Removing one keeps its files and cards."
                data-tooltip="Rescan finds websites in these folders. Removing one keeps its files and cards." />
            </div>
            <ul className="sites-settings__roots" aria-labelledby="sites-settings-roots-label">{view.roots.map((root) => (
              <li key={root.root} className="sites-settings__root">
                <svg className="sites-settings__folder" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
                <span className="sites-settings__path jini-tooltip" data-tooltip={root.root}>
                  <span className="sites-settings__path-head">{root.head}</span>
                  <span className="sites-settings__path-tail">{root.tail}</span>
                </span>
                {root.isHome && <span className="sites-settings__badge">New sites</span>}
                {root.canRemove && <button type="button" className="sites-settings__remove jini-tooltip" disabled={view.rootsDisabled}
                  aria-label={root.removeLabel} data-tooltip="Remove from list (files stay)" onClick={root.onRemove}>Remove</button>}
              </li>
            ))}</ul>
            <div className="sites-settings__list-actions">
              <button type="button" className="button button--quiet sites-settings__add" disabled={view.rootsDisabled} onClick={view.onAddFolder}>Add sites folder</button>
            </div>
            {view.rootsOverridden && <p className="sites-settings__note">TOVU_SITE_ROOTS overrides this setting.</p>}
          </div>

          <div className="sites-settings__row">
            <div className="sites-settings__label">
              <label htmlFor="sites-settings-databases">Database location</label>
              <button type="button" className="sites-settings__tip jini-tooltip" aria-label="Applies to new sites. Existing databases stay put until moved with sites:move-home while the site is stopped."
                data-tooltip="Applies to new sites. Existing databases stay put until moved with sites:move-home while the site is stopped." />
            </div>
            <div className="sites-settings__control">
              <select id="sites-settings-databases" className="sites-settings__select" value={settings.databases} onChange={view.onDatabasesChange}>
                <option value="inSite">Inside each site (data.nosync)</option><option value="appData">OS app-data</option>
              </select>
            </div>
            {view.showAppDataNote && <p className="sites-settings__note">App-data databases live outside the site folder. Copy them too when you move a site.</p>}
          </div>

          {settings.error && <p role="alert" className="sites-settings__error">{settings.error}</p>}
          <footer className="sites-settings__footer">
            {settings.folders.configPath && <span className="sites-settings__saved jini-tooltip" data-tooltip={settings.folders.configPath}>Saved in {settings.folders.configPath}</span>}
            <div className="sites-settings__footer-actions">
              <button type="button" className="button button--quiet" onClick={settings.close}>Cancel</button>
              <button type="submit" className="button button--primary" disabled={settings.busy}>Save</button>
            </div>
          </footer>
        </form> }]} />}
  </>;
}

/** The same sync warning appears outside a closed dialog or inside its form when open. */
function SitesFoldersWarning({ settings, view }: {
  settings: ReturnType<typeof useSiteStorageSettings>;
  view: ReturnType<typeof useSitesFoldersDialog>;
}, _options = {}) {
  return settings.folders.warning && <div role="alert" className="sites-settings__warning">
    <p>{settings.folders.warning.message}</p>
    <div className="sites-settings__warning-actions">
      <button type="button" className="button button--quiet" disabled={settings.busy} onClick={view.onUseAppData}>Store databases in app-data</button>
      <button type="button" className="button button--quiet" disabled={view.homeDisabled} onClick={view.onUseLocalHome}>Choose a local folder</button>
    </div>
    {settings.warningError && <p className="sites-settings__error">{settings.warningError}</p>}
  </div>;
}
