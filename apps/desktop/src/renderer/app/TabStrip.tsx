import { useTabStrip } from '../use-tab-strip.hooks.js';
import type { SiteRecord } from '../../contracts/project.js';

/**
 * One tab per open site, plus a permanent leading tab for Tovu's own screens. That leading tab is
 * labelled "All" because what it shows is the grid of every website; `tab--sites-home`
 * and `onSelectSitesHome` are the internal names for the same thing.
 *
 * It is not closable by design: it is the only route back to the project list, and a tab strip
 * that can be emptied needs a second way home that would duplicate the nav above it.
 */
export function TabStrip({
  projects,
  activeTab,
  onSelectSitesHome,
  onSelectTab,
  onCloseTab,
}: {
  projects: readonly SiteRecord[];
  activeTab: string | null;
  onSelectSitesHome: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  const { stripRef, overflow, showArrows, scrollLeft, scrollRight, tabIndex, onKeyDown } = useTabStrip({ activeTab, projects });
  return (
    <div className="tabstrip-frame">
      {showArrows ? <button type="button" className="tabstrip-arrow" aria-label="Scroll tabs left" disabled={!overflow.left} onClick={scrollLeft}>‹</button> : null}
      <div ref={stripRef} className="tabstrip" role="tablist" aria-label="Open websites" onKeyDown={onKeyDown}>
        <button
          type="button"
          role="tab"
          className={`tab tab--sites-home ${activeTab === null ? 'is-active' : ''}`}
          aria-selected={activeTab === null}
          tabIndex={tabIndex({ tabId: null }, {})}
          onClick={onSelectSitesHome}
        >
          <span className="tab__label">All</span>
        </button>

        {projects.map((project) => (
          <span key={project.id} className={`tab ${project.id === activeTab ? 'is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              className="tab__select"
              aria-selected={project.id === activeTab}
              tabIndex={tabIndex({ tabId: project.id }, {})}
              onClick={() => onSelectTab(project.id)}
            >
              <span className={`tab__dot is-${project.status}`} aria-hidden="true" />
              <span className="tab__label" title={project.displayName}>{project.displayName}</span>
            </button>
            <button
              type="button"
              className="tab__close"
              tabIndex={tabIndex({ tabId: project.id }, {})}
              onClick={() => onCloseTab(project.id)}
              aria-label={`Close ${project.displayName}`}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
      </div>
      {showArrows ? <button type="button" className="tabstrip-arrow" aria-label="Scroll tabs right" disabled={!overflow.right} onClick={scrollRight}>›</button> : null}
    </div>
  );
}
