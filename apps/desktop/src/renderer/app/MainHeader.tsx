import { reportShellTelemetry } from '../product-telemetry.js';
import type { RunnerSectionId } from '../../contracts/sections.js';
import { ToolIcon } from '../tool-icons.js';
import { SharedKeysLauncher } from '../SharedKeys.js';
import { SitesFolders } from '../SitesFolders.js';
import type { useSiteFolders } from '../use-site-folders.hooks.js';

function headerTitle(
  { isCreating, isImporting, activeLabel }: { isCreating: boolean; isImporting: boolean; activeLabel: string }, _optional = {},
): string {
  if (isCreating) return 'Create a website';
  return isImporting ? 'Import a website' : activeLabel;
}

export function MainHeader({
  activeId,
  isCreating,
  isImporting = false,
  activeLabel,
  onCreateWebsite,
  onRescan,
  rescanning,
  onImport,
  useFolders,
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  /** The Import page is open: it swaps the title and takes the tools away, like the create form. */
  isImporting?: boolean;
  activeLabel: string;
  onCreateWebsite: () => void;
  onRescan: () => Promise<void>;
  rescanning: boolean;
  onImport: () => void;
  useFolders?: typeof useSiteFolders;
}) {
  return (
    <header className="main__head">
      <h1 className="main__title">{headerTitle({ isCreating, isImporting, activeLabel })}</h1>
      <div className="main__spacer" />
      {activeId === 'projects' && !isCreating && !isImporting && (
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
          {/* Two groups (owner, 2026-10-30): manage the sites you have, then the two ways to get
              a site in — so no icon sits wedged between two text buttons. */}
          <span className="main__tools-gap" aria-hidden="true" />
          {/* One Import (owner, 2026-11-06) in place of the old icon + "Add Tovu Website": it opens the
              Import page, which makes or adds a site. It never touches an existing site. Solid black on
              the owner's call (restated 2026-10-30): it stays distinct from "Create website", the
              only other button that brings a site in, by wearing the neutral contrast fill rather
              than `--primary`. */}
          <button type="button" className="button button--contrast"
            onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: 'import_website' } }); onImport(); }}>
            Import
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
