import type { RunnerSection, RunnerSectionId } from '../../contracts/sections.js';
import type { CreatedSiteRecord, SiteRecord } from '../../contracts/project.js';
import type { useSiteFolders } from '../use-site-folders.hooks.js';
import { MainHeader } from './MainHeader.js';
import { MainContent } from './MainContent.js';

/**
 * Everything `App` puts inside `<main>` other than the two always-mounted layers — the project
 * workspaces and the create form host: the Appearance page, or the sites home header + content,
 * depending on what the operator has open. `active` arrives as the section object rather than
 * pre-split label/description strings so its two `?? fallback`s — one per consumer, each with its
 * own fallback text — live in one place.
 */
export function MainArea({
  appearanceOpen,
  onCloseAppearance,
  showSitesHome,
  activeId,
  isCreating,
  isImporting,
  active,
  lastCreated,
  projectsLoading,
  loadError,
  projects,
  onCreateWebsite,
  onOpenProject,
  onDeleteProject,
  onSiteUpdated,
  onRescan,
  rescanning,
  rescanError,
  onImport,
  useFolders,
}: {
  appearanceOpen: boolean;
  onCloseAppearance: () => void;
  showSitesHome: boolean;
  activeId: RunnerSectionId;
  isCreating: boolean;
  isImporting: boolean;
  active: RunnerSection | undefined;
  lastCreated: CreatedSiteRecord | null;
  projectsLoading: boolean;
  loadError: string | null;
  projects: readonly SiteRecord[];
  onCreateWebsite: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => Promise<void>;
  /** Applies main's refreshed record after a card's Start or Stop — see `useApplySiteRecord`. */
  onSiteUpdated: (record: SiteRecord, previousId?: string) => void;
  onRescan: () => Promise<void>;
  rescanning: boolean;
  rescanError: string | null;
  /** Opens the Import page. */
  onImport: () => void;
  /** The header's `SitesFolders` settings hook — see `App`'s own `sitesSettings`. */
  useFolders?: typeof useSiteFolders;
}) {
  if (appearanceOpen) {
    return <AppearancePage onBack={onCloseAppearance} />;
  }
  if (!showSitesHome) return null;
  return (
    <>
      <MainHeader
        activeId={activeId}
        isCreating={isCreating}
        isImporting={isImporting}
        activeLabel={active?.label ?? 'Runner'}
        onCreateWebsite={onCreateWebsite}
        onRescan={onRescan}
        rescanning={rescanning}
        onImport={onImport}
        useFolders={useFolders}
      />
      <MainContent
        activeId={activeId}
        isCreating={isCreating}
        isImporting={isImporting}
        lastCreated={lastCreated}
        projectsLoading={projectsLoading}
        loadError={loadError}
        rescanError={rescanError}
        projects={projects}
        activeLabel={active?.label ?? ''}
        activeDescription={active?.agentDescription ?? ''}
        onCreateWebsite={onCreateWebsite}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
        onSiteUpdated={onSiteUpdated}
      />
    </>
  );
}

/**
 * TEMPORARY SCAFFOLD — see `appearanceOpen` in `useSectionNav`. Exists to judge whether "Settings
 * dropdown → its own page" feels right, not as the real Appearance screen. Not a
 * `RunnerSectionId`: a real version belongs in `contracts/sections.ts` once its actual content
 * (more than a theme toggle, presumably) is decided.
 */
function AppearancePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="empty">
      <button type="button" className="back-link" onClick={onBack}>← Back</button>
      <h2 className="empty__title">Appearance</h2>
      <p className="empty__body">Nothing here yet beyond the theme toggle already in the Settings dropdown.</p>
    </div>
  );
}
