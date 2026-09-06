import { agentHandle } from "@jini-ai/agentic";

import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { formatTimestamp } from "../../lib/format-timestamp";
import {
  resolveActivateDisabled,
  resolveSiteCardClassName,
  resolveSiteStateDisplay,
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
 * has a tab of its own (`NewSiteTab.tsx`).
 *
 * ## The empty state is the case this install actually hits
 *
 * `listSites` only counts a directory once it carries a valid `.site-meta.json` commit marker, and
 * this repo's own `sites/tovu-com` predates that marker — so on the real install this grid renders
 * ZERO cards while the server is plainly serving something. That is not an error and it must not
 * read as "you have no sites": `Sites.tsx` renders `NowServingCard` above the tab bar, naming the
 * live folder, and {@link SitesEmptyState} points back at it in words. An empty state that just said
 * "No sites yet" would contradict the card directly above it.
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

/** One listed site's own grid tile — folder name (the technical identifier every write on this
 *  screen takes) dominant in a tinted header; display name, state badge, and created date
 *  underneath; Activate in the footer. {@link resolveSiteCardClassName} adds the
 *  `site-card-serving` tint for whichever card is genuinely live — a purely visual echo of a fact
 *  the badge already states in words, never a substitute for it. */
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
    <div className={resolveSiteCardClassName(site, snapshot)}>
      <div className="site-card-head">
        <span className="site-card-name">{site.name}</span>
      </div>
      <div className="site-card-body">
        <p className="site-card-display-name">{site.displayName}</p>
        <span className={`status ${toneClass}`}>{t(labelKey)}</span>
        <p className="site-card-meta">
          {t("Created")} {formatTimestamp(site.createdAt)}
        </p>
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
 * Shown instead of the grid when nothing is listed.
 *
 * The second line is load-bearing, not filler: it is what keeps this state from contradicting the
 * `Now serving` card rendered directly above the tab bar on the very same screen (see this file's
 * header). The action is a real `<a href>` rather than a `<button onClick={navigate}>` so it is
 * middle-clickable, copyable, and works with the app's own internal-link interceptor — the same
 * `?tab=` URL the tab button itself produces, so there is one destination, not two.
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
      <p className="sites-empty-lead">{t("A folder appears here once Tovu has created it. What's serving now is above.")}</p>
      <a className="btn-primary sites-empty-action" href="/admin/sites?tab=new">
        {t("New site")}
      </a>
    </div>
  );
}

export interface AllSitesTabProps {
  sites: AdminSiteListEntry[];
  snapshot: AdminSitesSnapshot;
  switchingEnabled: boolean;
  activatingName: string | null;
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
  return sitesGridOrEmpty(props);
}
