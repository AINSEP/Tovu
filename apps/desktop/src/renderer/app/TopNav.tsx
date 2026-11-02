import { navAvailability } from '../nav-availability.js';
import { visibleSections, type RunnerSection, type RunnerSectionId } from '../../contracts/sections.js';
import { SectionIcon } from '../icons.js';
import type { ThemePreference } from '../theme.js';
import { navLinkClick } from '../App.hooks.js';
import { useAppVersion } from '../use-app-version.hooks.js';
import { ResourcesChip } from '../ResourcesPanel.js';
import type { useSiteStorageSettings } from '../use-site-storage-settings.hooks.js';
import { SettingsControl } from './SettingsControl.js';

/**
 * Runner's own navigation, horizontal across the top.
 *
 * This is a top nav rather than a sidebar for a structural reason, not a stylistic one: a project
 * tab embeds that site's Tovu admin, which ships its OWN left sidebar and its own site-assistant
 * chat. A Runner sidebar would sit directly beside that one, giving the operator two stacked
 * sidebars and two chat entry points with different owners — exactly the blur `sections.ts`
 * warns about. Keeping Runner's chrome on the horizontal axis leaves the vertical axis to
 * whichever site is in view.
 */
export function TopNav({
  activeId,
  onSitesHome,
  runningCount,
  theme,
  onThemeChange,
  onOpenAppearance,
  onSelectSection,
  useSiteSettings,
}: {
  activeId: RunnerSectionId;
  onSitesHome: boolean;
  runningCount: number;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
  onSelectSection: (id: RunnerSectionId) => void;
  useSiteSettings?: typeof useSiteStorageSettings;
}) {
  const { version, error } = useAppVersion({});
  return (
    <nav className="topnav" aria-label="Tovu sections">
      <span className="topnav__brand" title={error ?? undefined}>
        <span className="topnav__mark" aria-hidden="true" />
        <span className="topnav__brand-text">
          <span className="topnav__wordmark">Tovu</span>
          {version !== null && <span className="topnav__version" title={version}>{version}</span>}
        </span>
      </span>

      <div className="topnav__links">
        {visibleSections().map((section) => {
          // A section is only "current" when the sites home tab is what's on screen. With a site's
          // admin in view, no Runner section is being displayed, so none should read as active.
          const isActive = onSitesHome && section.id === activeId;
          return (
            <NavLink
              key={section.id}
              section={section}
              isActive={isActive}
              runningCount={runningCount}
              onSelectSection={onSelectSection}
              // Only Projects has anything behind it right now; the rest are inert until their
              // sections are real. Tooltips stay live because this is functional/visual disabling
              // on a real button, not the `disabled` attribute (which would also kill hover).
              disabled={section.id !== 'projects'}
            />
          );
        })}
      </div>

      <div className="topnav__tools">
        <ResourcesChip />
        <SettingsControl theme={theme} onThemeChange={onThemeChange} onOpenAppearance={onOpenAppearance} useSiteSettings={useSiteSettings} />
      </div>
    </nav>
  );
}

/**
 * One icon-only nav destination.
 *
 * The label is never rendered as visible text — it lives in a `data-tip` CSS tooltip and in
 * `aria-label`. `data-tip` rather than the native `title` attribute because the native one waits
 * ~1s and is OS-styled, which is too slow and too foreign when the tooltip is the ONLY place a
 * destination's name is written — including a DISABLED destination's, which is why `disabled` is
 * `aria-disabled` on a real `<button>` plus `tabIndex={-1}`, never the native `disabled` attribute:
 * that would also suppress `data-tip`'s hover/focus tooltip, the only place an unbuilt section's
 * name appears.
 */
function NavLink({
  section,
  isActive,
  runningCount,
  onSelectSection,
  disabled,
}: {
  section: RunnerSection;
  isActive: boolean;
  runningCount: number;
  onSelectSection: (id: RunnerSectionId) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`topnav__link ${isActive ? 'is-active' : ''} ${disabled ? 'topnav__link--disabled' : ''}`}
      onClick={navLinkClick({ disabled, id: section.id, onSelectSection })}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      {...navAvailability({ label: section.label, disabled })}
      aria-label={section.label}
    >
      <SectionIcon id={section.id} />
      {section.id === 'projects' && runningCount > 0 && (
        <span className="topnav__count">{runningCount}</span>
      )}
    </button>
  );
}
