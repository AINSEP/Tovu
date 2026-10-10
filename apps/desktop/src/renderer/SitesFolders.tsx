/** Shared local settings are available from Websites and the desktop Settings menu. */
import { SettingsDialogShell } from '@jini-ai/ui';
import '@jini-ai/ui/tabbed-dialog.css';
import { useSiteFolders } from './use-site-folders.hooks.js';
import { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';

/** Jini supplies dialog lifecycle/accessibility; hooks own all state and preload effects. */
export function SitesFolders({ useSettings = useSiteFolders }: { useSettings?: typeof useSiteFolders } = {}) {
  const settings = useSiteStorageSettings({}, { useFolders: useSettings });
  return <SitesFoldersDialog settings={settings} />;
}

/** Kept outside the dropdown: closing its menu never unmounts a draft or a dialog. */
export function SitesFoldersDialog({ settings, showTrigger = true }: { settings: ReturnType<typeof useSiteStorageSettings>; showTrigger?: boolean }) {
  return <>
    {showTrigger && <button type="button" className="button button--quiet" onClick={settings.show}>Sites settings</button>}
    {settings.folders.warning && (showTrigger || settings.open) && <div role="alert"><p>{settings.folders.warning.message}</p>
      <button disabled={settings.busy} onClick={() => void settings.useAppData()}>Store databases in app-data</button>
      <button disabled={settings.busy || settings.folders.overrides?.sitesHome} onClick={() => void settings.useLocalHome()}>Choose a local folder</button>
    </div>}
    {showTrigger && settings.error && !settings.open && <p role="alert">{settings.error}</p>}
    {settings.open && <SettingsDialogShell onClose={settings.close} fullscreenEnabled={false} dialogAriaLabelledBy="desktop-sites-settings-title"
      tabs={[{ id: 'sites', label: 'Sites', title: 'Sites settings', panel:
        <form onSubmit={(event) => { event.preventDefault(); void settings.save(); }}>
          <p>New websites folder: {settings.folders.home}</p>
          <button type="button" disabled={settings.busy || settings.folders.overrides?.sitesHome} onClick={() => void settings.chooseHome()}>Choose folder</button>
          {settings.folders.overrides?.sitesHome && <p>TOVU_SITES_HOME overrides this setting.</p>}
          <p>Extra sites folders are chosen with the folder picker.</p>
          {settings.folders.overrides?.siteRoots && <p>TOVU_SITE_ROOTS overrides this setting.</p>}
          <button type="button" disabled={settings.busy || settings.folders.overrides?.siteRoots} onClick={() => void settings.addFolder()}>Add sites folder</button>
          <ul>{settings.folders.roots.map((root) => <li key={root}><span>{root}</span>
            {settings.folders.extraRoots.includes(root) && <button type="button" disabled={settings.busy || settings.folders.overrides?.siteRoots}
              aria-label={`Remove sites folder ${root}`} onClick={() => void settings.removeFolder({ root })}>Remove</button>}
          </li>)}</ul>
          <label>Database location <select value={settings.databases} onChange={(event) => settings.setDatabases(event.target.value as 'inSite' | 'appData')}>
            <option value="inSite">Inside each site (data.nosync)</option><option value="appData">OS app-data</option>
          </select></label>
          <p>App-data site folders are not self-contained. Include their app-data databases when transferring them.</p>
          <p>Existing databases keep their current location. Stop the site and use sites:move-home to move them.</p>
          <p>Rescan finds websites inside the sites home and extra folders. Removing a folder keeps its files and website cards.</p>
          {settings.folders.configPath && <p>Saved in {settings.folders.configPath}</p>}
          <button type="submit" disabled={settings.busy}>Save sites settings</button>
          {settings.error && <p role="alert">{settings.error}</p>}
        </form> }]} />}
  </>;
}
