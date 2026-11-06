import type { RunnerSectionId } from '../../contracts/sections.js';
import type { CreatedSiteRecord, SiteRecord } from '../../contracts/project.js';
import { SiteGrid } from '../SiteGrid.js';
import { createdTokensNote } from '../use-create-site-plugin-tokens.hooks.js';

export function MainContent({
  activeId,
  isCreating,
  isImporting,
  lastCreated,
  projectsLoading,
  loadError,
  rescanError,
  projects,
  activeLabel,
  activeDescription,
  onCreateWebsite,
  onOpenProject,
  onDeleteProject,
  onSiteUpdated,
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  isImporting: boolean;
  lastCreated: CreatedSiteRecord | null;
  projectsLoading: boolean;
  loadError: string | null;
  rescanError: string | null;
  projects: readonly SiteRecord[];
  activeLabel: string;
  activeDescription: string;
  onCreateWebsite: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => Promise<void>;
  onSiteUpdated: (record: SiteRecord, previousId?: string) => void;
}) {
  if (activeId !== 'projects') {
    return <NotBuilt label={activeLabel} description={activeDescription} />;
  }
  // The form itself lives in `CreateWebsiteHost` now — always mounted, a sibling of `MainArea` —
  // so there is nothing left to render here. This branch still has to exist: without it the sites
  // grid below would show through beneath the (visible) form host, and `MainHeader` still needs
  // `isCreating` to swap its title, so the flag stays threaded through even though this component
  // no longer acts on it beyond staying out of the way.
  // The Import page is the same kind of sibling layer (`App` mounts it), so the grid stays out of its way.
  if (isCreating || isImporting) {
    return null;
  }
  return (
    <>
      {lastCreated && (
        <p className="creation-notice" role="status">
          <span className="creation-notice__dot" aria-hidden="true" />
          {/* A freshly created project has no port yet — `handleCreate` (`project-ipc.ts`) only
              runs `tovu init`, and a port is not allocated until `openSiteWindow` actually spawns
              `tovu serve` on the first open. Claiming "port 0" here would be a lie the operator
              could act on (there is no server listening on port 0). Stopped records use the same
              sentinel; `sitePortPresentation` applies that rule across the renderer.

              The notice only ever describes a STOPPED site: `useProjectMutations` withdraws it the
              moment `readyNoticeStillTrue` stops holding, and that requires the created row to be
              on the grid with `status === 'stopped'`. A "provisioned on port N" variant for a
              running record used to sit here and could never outlive its first commit, so it was
              removed rather than kept as copy no operator can read. */}
          <span className="creation-notice__text">
            <strong>{lastCreated.displayName}</strong> is ready — open it to start its own server.
            {createdTokensNote(lastCreated) ? <> {createdTokensNote(lastCreated)}</> : null}
          </span>
        </p>
      )}
      <ProjectsBody
        projectsLoading={projectsLoading}
        loadError={loadError}
        rescanError={rescanError}
        projects={projects}
        onOpen={onOpenProject}
        onDelete={onDeleteProject}
        onSiteUpdated={onSiteUpdated}
      />
    </>
  );
}

function ProjectsBody({
  projectsLoading,
  loadError,
  rescanError,
  projects,
  onOpen,
  onDelete,
  onSiteUpdated,
}: {
  projectsLoading: boolean;
  loadError: string | null;
  /**
   * A failed RESCAN, deliberately not folded into `loadError`. That one means "there is no list to
   * show" and short-circuits into the empty state below, which is right for it and catastrophic
   * here: a scan that failed leaves every project already on screen real, openable, and unchanged,
   * so replacing the grid with an error would hide working sites to report a failure to look for
   * more of them.
   */
  rescanError: string | null;
  projects: readonly SiteRecord[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onSiteUpdated: (record: SiteRecord, previousId?: string) => void;
}) {
  if (projectsLoading) {
    return (
      <div className="empty">
        <p className="empty__body">Loading projects…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="empty">
        <p className="empty__body">{loadError}</p>
      </div>
    );
  }
  return (
    <>
      {rescanError && <p className="empty__body">{rescanError}</p>}
      {projects.length === 0 ? <NoWebsitesYet /> : <SiteGrid projects={projects} onOpen={onOpen} onDelete={onDelete} onRenamed={onSiteUpdated} onSiteUpdated={onSiteUpdated} />}
    </>
  );
}

/**
 * What the Projects screen shows when nothing is tracked yet.
 *
 * Needed because deleting the grid's dashed "Add project" tile (see `SiteGrid.tsx`'s header)
 * also deleted the only thing an operator with no websites used to see — without this, a first
 * launch renders an empty page with no explanation and no visible way forward.
 *
 * It names the header buttons rather than duplicating them as controls. A fourth button here
 * would be the same mistake the dashed tile was: a second control firing an action the header
 * already owns, which is how the two got out of step in the first place.
 */
function NoWebsitesYet() {
  return (
    <div className="empty">
      <p className="empty__body">
        No websites yet. Use <strong>Create website</strong> to start a new one, <strong>Import</strong> to bring in a
        site you already have, or <strong>Rescan</strong> to look for sites on this computer.
      </p>
    </div>
  );
}

function NotBuilt({ label, description }: { label: string; description: string }) {
  return (
    <div className="empty">
      <h2 className="empty__title">{label} isn’t built yet</h2>
      <p className="empty__body">{description}</p>
    </div>
  );
}
