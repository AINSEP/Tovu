import { agentHandle } from "@jini-ai/agentic";

import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import {
  resolveActivateDisabled,
  resolveSiteCardClassName,
  resolveSiteCardTitle,
  resolveSiteRegistrationBadge,
  resolveSiteStateDisplay,
  resolveSiteSubtitle,
  resolveSitesEmpty,
  resolveSitesRowHandles,
} from "./Sites.hooks";

/**
 * @file The "All sites" tab — the card grid of every site folder listed under `sites/`, and the
 * empty state for when there are none.
 *
 * Split out of `Sites.tsx` for the tab redesign (2026-09-05, owner: "the first tab is all sites …
 * and in that, we have cards for all the sites we have currently active … whether they're active or
 * not"). The card grid itself is unchanged from the layout pass that preceded it — the `auto-fill`
 * `.sites-grid`, the tinted `site-card-serving` head, the per-card state badge and Activate button
 * all render exactly as they did. What left this tab is the Create tile: a whole form crammed into
 * one grid cell, which is the specific thing the owner rejected ("This is just awful"). Creating now
 * has a tab of its own (`CreateSiteOnboarding.tsx`).
 *
 * ## The create confirmation lives here, not on the form
 *
 * A successful create returns to this tab — the owner's requirement, *"That should go back to the
 * first tab, and then we should see the new website created there"* — so {@link CreatedSiteNotice}
 * is what she lands on, directly above the grid that now contains the new card. It used to sit in
 * the create form's own footer, where after the return it could only ever be read as stale.
 *
 * ## The compact card (2026-09-05)
 *
 * The owner's brief: "that top card, the now serving card should not even be there. It should just
 * be a card in all sites with a green active button. So we save some space. And then we also have
 * the folder, just a regular square card with a hover tooltip for the actual folder directory."
 *
 * So the card lost its always-visible path line and its "Created" line, gained a square aspect and
 * a `title` tooltip carrying the absolute path, and the page-level "Now serving" panel above the
 * grid is gone entirely — the served site is a card in this grid like any other, wearing the green
 * `Serving now` badge.
 *
 * That was only possible because the served site now REACHES this grid. It did not before:
 * `listSites` requires `config.json` + `.site-meta.json`, this repo's own `sites/tovu-com` has
 * neither, so the grid rendered zero cards on a server that was plainly serving it — which is what
 * the removed panel existed to confess. `includeServingSite` (`site-registry.ts`) now composes the
 * served directory into the listing, and {@link SiteCard} carries the one fact that panel's amber
 * banner used to: `resolveSiteRegistrationBadge` marks a folder `tovu serve` would refuse. Removing
 * the panel without that badge would have deleted the truth and kept the bug.
 *
 * ## The empty state
 *
 * Now genuinely rare rather than this install's normal state: it takes a `sites/` with nothing in it
 * AND a served directory that is not on disk. {@link SitesEmptyState} still avoids reading as a flat
 * "you have no sites", because the page-level notices above the grid may still be describing a
 * pending choice.
 */

/** One row's Activate control. Its own component rather than an inline `cell` body so the four
 *  conditions that decide its disabled state and label are counted against this function's own
 *  complexity budget rather than the grid's — the same reason `deployment-visuals.tsx` splits its
 *  own row renderers out. Disabled for the site already being served: activating what is already
 *  live would write a `.env` line that changes nothing and imply a restart is needed. */
function ActivateButton({
  site,
  snapshot,
  handle,
  switchingEnabled,
  activatingName,
  onActivate,
  t,
}: {
  site: AdminSiteListEntry;
  snapshot: AdminSitesSnapshot;
  handle: string;
  switchingEnabled: boolean;
  activatingName: string | null;
  onActivate: (name: string) => void;
  t: Translate;
}) {
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={resolveActivateDisabled({ switchingEnabled, activatingName, site, snapshot })}
      onClick={() => onActivate(site.name)}
      {...agentHandle(handle, {
        role: "button",
        label: `Save ${site.name} as the site to serve after the next restart`,
      })}
    >
      {activatingName === site.name ? t("Saving…") : t("Serve after restart")}
    </button>
  );
}

/** The card's second line and its "this folder is not really a site" badge — a plain function so
 *  {@link SiteCard} carries neither `null` check against its own complexity budget, matching the
 *  split every other renderer in this feature makes. */
function SiteCardFacts({ site, snapshot, t }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; t: Translate }) {
  const subtitle = resolveSiteSubtitle(site);
  const registration = resolveSiteRegistrationBadge(site, snapshot);
  return (
    <>
      {subtitle === null ? null : <p className="site-card-display-name">{subtitle}</p>}
      {registration === null ? null : (
        <span className="status status-warning site-card-flag" title={t(registration.titleKey)}>
          {t(registration.labelKey)}
        </span>
      )}
    </>
  );
}

/** One site's grid tile — square, compact, and carrying the whole truth about that site.
 *
 *  The folder name (the technical identifier every write on this screen takes) is the dominant
 *  element; the state badge is the green `Serving now` pill for whichever card is genuinely live.
 *  The absolute path is a hover tooltip on the card itself rather than a visible line, which is
 *  what the owner asked for and what buys back the vertical space.
 *
 *  {@link resolveSiteCardClassName} adds the `site-card-serving` tint — a purely visual echo of the
 *  same fact the badge states in words, never a substitute for it. */
function SiteCard({
  site,
  snapshot,
  handle,
  switchingEnabled,
  activatingName,
  onActivate,
  t,
}: {
  site: AdminSiteListEntry;
  snapshot: AdminSitesSnapshot;
  handle: string;
  switchingEnabled: boolean;
  activatingName: string | null;
  onActivate: (name: string) => void;
  t: Translate;
}) {
  const { toneClass, labelKey } = resolveSiteStateDisplay(site, snapshot);
  return (
    <div className={resolveSiteCardClassName(site, snapshot)} title={resolveSiteCardTitle(site)}>
      <div className="site-card-head">
        <span className={`status ${toneClass}`}>{t(labelKey)}</span>
      </div>
      <div className="site-card-body">
        <span className="site-card-name">{site.name}</span>
        <SiteCardFacts site={site} snapshot={snapshot} t={t} />
        <div className="site-card-actions">
          <ActivateButton
            site={site}
            snapshot={snapshot}
            handle={handle}
            switchingEnabled={switchingEnabled}
            activatingName={activatingName}
            onActivate={onActivate}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Shown instead of the grid when nothing is listed at all.
 *
 * The action is a real `<a href>` rather than a `<button onClick={navigate}>` so it is
 * middle-clickable, copyable, and works with the app's own internal-link interceptor — and it
 * targets the same `?tab=new` URL the "New site" tab itself does, so there is one destination, not
 * two.
 */
function SitesEmptyState({ t }: { t: Translate }) {
  return (
    <div
      className="sites-empty"
      {...agentHandle("sites-empty", {
        role: "region",
        label: "Empty state for the All sites tab — no site folders are listed under sites/",
      })}
    >
      <h2 className="sites-empty-title">{t("No listed sites")}</h2>
      <p className="sites-empty-lead">{t("A folder appears here once Tovu has created it.")}</p>
      <a className="btn-primary sites-empty-action" href="/admin/sites?tab=new">
        {t("New site")}
      </a>
    </div>
  );
}

/** The line an operator lands on after a successful create — see this file's header. Renders
 *  nothing when there has not been one, so {@link AllSitesTab} needs no conditional of its own.
 *
 *  The name is rendered VERBATIM and never through `t()`: it is data (a folder name), the same
 *  treatment every other site name on this screen gets. */
function CreatedSiteNotice({ createdName, t }: { createdName: string | null; t: Translate }) {
  if (createdName === null) return null;
  return (
    <p
      className="save-ok"
      {...agentHandle("sites-created-notice", {
        role: "status",
        label: "Confirmation that a site folder was created, and that creating it switched nothing",
      })}
    >
      <strong>{createdName}</strong> {t("was created. Activate it to serve after the next restart.")}
    </p>
  );
}

export interface AllSitesTabProps {
  sites: AdminSiteListEntry[];
  snapshot: AdminSitesSnapshot;
  switchingEnabled: boolean;
  activatingName: string | null;
  /** The site the last successful create made, or `null` — see {@link CreatedSiteNotice}. */
  createdName: string | null;
  onActivate: (name: string) => void;
  t: Translate;
}

/** The grid itself. A plain function returning JSX rather than a ternary written in
 *  {@link AllSitesTab}'s own body — that component's cyclomatic count would otherwise carry this
 *  branch on top of the `.map()`, the same split `Deployment.tsx`'s `deploymentTabPanel` makes for
 *  the identical gate. */
function sitesGridOrEmpty(props: AllSitesTabProps) {
  if (resolveSitesEmpty(props.sites)) return <SitesEmptyState t={props.t} />;
  return <SitesGrid {...props} />;
}

function SitesGrid({ sites, snapshot, switchingEnabled, activatingName, onActivate, t }: AllSitesTabProps) {
  // Folder names are unique under `sites/` (they ARE the directory entries), so they disambiguate
  // one card's controls from another's — same reasoning as every other list on this workstream.
  const rowHandles = resolveSitesRowHandles(sites);
  return (
    <div className="sites-grid" role="group" aria-label={t("Sites")}>
      {sites.map((site, index) => (
        <SiteCard
          key={site.name}
          site={site}
          snapshot={snapshot}
          handle={`${rowHandles[index]}-activate`}
          switchingEnabled={switchingEnabled}
          activatingName={activatingName}
          onActivate={onActivate}
          t={t}
        />
      ))}
    </div>
  );
}

export function AllSitesTab(props: AllSitesTabProps) {
  return (
    <>
      <CreatedSiteNotice createdName={props.createdName} t={props.t} />
      {sitesGridOrEmpty(props)}
    </>
  );
}
