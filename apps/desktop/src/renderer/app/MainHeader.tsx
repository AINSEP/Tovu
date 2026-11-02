import { reportShellTelemetry } from '../product-telemetry.js';
import type { RunnerSectionId } from '../../contracts/sections.js';
import { ToolIcon } from '../tool-icons.js';
import { SharedKeysLauncher } from '../SharedKeys.js';
import { SitesFolders } from '../SitesFolders.js';
import type { useSiteFolders } from '../use-site-folders.hooks.js';

export function MainHeader({
  activeId,
  isCreating,
  activeLabel,
  onCreateWebsite,
  onRescan,
  rescanning,
  onAddSite,
  adding,
  onImportSite,
  useFolders,
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  activeLabel: string;
  onCreateWebsite: () => void;
  onRescan: () => Promise<void>;
  rescanning: boolean;
  onAddSite: () => Promise<void>;
  adding: boolean;
  onImportSite?: () => void;
  useFolders?: typeof useSiteFolders;
}) {
  return (
    <header className="main__head">
      <h1 className="main__title">{isCreating ? 'Create a website' : activeLabel}</h1>
      <div className="main__spacer" />
      {activeId === 'projects' && !isCreating && (
        <div className="main__tools">
          {/* Ahead of "Create website" and styled quiet: this one only ever ADDS cards for sites
              that already exist, so it must not compete with the primary action. */}
          <button type="button" className="button button--quiet button--icon jini-tooltip" data-tooltip-placement="bottom"
            data-tooltip="Rescan your sites folder for websites" aria-label={rescanning ? 'Scanning…' : 'Rescan'} aria-busy={rescanning}
            onClick={() => void onRescan()} disabled={rescanning}>
            <ToolIcon kind="rescan" />
          </button>
          <SitesFolders useSettings={useFolders} />
          <SharedKeysLauncher />
          {/* Two groups (owner, 2026-10-30): manage the sites you have, then the three ways to get
              a site in — so no icon sits wedged between two text buttons. */}
          <span className="main__tools-gap" aria-hidden="true" />
          {/* Quiet like Rescan: it opens a site's own Import & Export > Import tab, where the import lives. */}
          {onImportSite && (
            <button type="button" className="button button--quiet button--icon jini-tooltip" data-tooltip-placement="bottom"
              data-tooltip="Import a site from a Tovu export or a live website" aria-label="Import site" onClick={onImportSite}>
              <ToolIcon kind="import" />
            </button>
          )}
          {/* Like Rescan it only ever adds cards for websites that already exist; the difference is
              who chooses: Rescan looks under the scan roots automatically, this one asks the
              operator for one folder. Solid black on the owner's call (restated 2026-10-30 after a
              brief outlined try): it stays distinct from "Create website", the only button here
              that makes a NEW site, by wearing the neutral contrast fill rather than `--primary`. */}
          <button type="button" className="button button--contrast" onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: 'add_existing_website' } }); void onAddSite(); }} disabled={adding} title="Add an existing Tovu site. Its files stay where they are.">
            {adding ? 'Adding…' : 'Add Tovu Website'}
          </button>
          <button type="button" className="button button--create" onClick={onCreateWebsite}>
            <span aria-hidden="true">+</span>
            Create website
          </button>
        </div>
      )}
    </header>
  );
}
