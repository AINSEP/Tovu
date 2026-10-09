import type { LocalSitesController } from "./hooks/use-local-sites.hooks";
import { RowMenu } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { interpolate } from "@jini-ai/ui/panel-kit";

import type { AdminSiteListEntry, AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "@jini-ai/ui/panel-kit";
import {
  buildSiteCardMenuItems,
  resolveSiteCardClassName,
  resolveSiteCardMeta,
  resolveSiteCardTitle,
  resolveSiteCardView,
  resolveSiteRegistrationBadge,
  resolveSiteStatusPill,
  resolveSiteSubtitle,
  resolveSitesEmpty,
  resolveSitesRowHandles,
} from "./Sites.hooks";
import { SiteFlagIcon } from "./sites-visuals";
import { useSiteCardPreview } from "./hooks/use-site-card-preview.hooks";

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
 * `listSites` requires `config.json` + `.site-meta.json`, this repo's own dev site folder has
 * neither, so the grid rendered zero cards on a server that was plainly serving it — which is what
 * the removed panel existed to confess. `includeServingSite` (`site-registry.ts`) now composes the
 * served directory into the listing, and {@link SiteCard} carries the one fact that panel's amber
 * banner used to: `resolveSiteRegistrationBadge` marks a folder `tovu serve` would refuse. Removing
 * the panel without that badge would have deleted the truth and kept the bug.
 *
 * ## The card's actions (2026-10-08 polish)
 *
 * Owner: "make sure it looks good UI-wise" — four equal-weight buttons wrapped into a ragged pile,
 * clipped the fourth inside the square card, and sat Delete next to Start. Now a card shows a status
 * pill, the name, a muted meta line, then ONE visible lifecycle action (Start, or Stop) plus Open ↗
 * for a ready admin; Make default, Switch now and Delete… live in the shared `RowMenu` overflow menu,
 * Delete last and danger-toned. Actions that do not apply are left out rather than shown disabled —
 * `resolveSiteCardView` (`Sites.hooks.tsx`) carries the same rules the old disabled states encoded.
 *
 * ## The preview (2026-10-08)
 *
 * Owner: the desktop app's cards show a picture of each site; these did not. {@link SiteCardPreview}
 * sits on top of the card: the server's last capture of the site's public page (re-captured while it
 * runs, see `use-site-card-preview.hooks.ts`), or a neutral placeholder for a site never captured.
 *
 * ## The empty state
 *
 * Now genuinely rare rather than this install's normal state: it takes a `sites/` with nothing in it
 * AND a served directory that is not on disk. {@link SitesEmptyState} still avoids reading as a flat
 * "you have no sites", because the page-level notices above the grid may still be describing a
 * pending choice.
 */

/** The card's second line and its "this folder is not really a site" badge — a plain function so
 *  {@link SiteCard} carries neither `null` check against its own complexity budget, matching the
 *  split every other renderer in this feature makes. */
function SiteCardFacts({ site, snapshot, activatingName, t }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; activatingName: string | null; t: Translate }) {
  const subtitle = resolveSiteSubtitle(site);
  const meta = resolveSiteCardMeta({ site, snapshot, activatingName, t });
  const registration = resolveSiteRegistrationBadge(site, snapshot);
  return (
    <>
      {subtitle === null ? null : <p className="site-card-display-name">{subtitle}</p>}
      {meta === null ? null : <p className="site-card-meta">{meta}</p>}
      {registration === null ? null : (
        // A glyph beside the words (2026-09-06 status-strip pass, `styles.css`'s "Sites — the
        // card's status strip"): this line used to render in the same pill chrome as the state
        // badge in the head, so the two read as competing states. The icon is what makes it a
        // footnote about the folder rather than a second status; `aria-hidden` inside the
        // component, since the text beside it already says the same thing.
        <span className="status status-warning site-card-flag" title={t(registration.titleKey)}>
          <SiteFlagIcon />
          {t(registration.labelKey)}
        </span>
      )}
    </>
  );
}

/** One site's grid tile — compact, equal-height in its row, and carrying the whole truth about that site.
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
  localSites,
  t,
}: {
  site: AdminSiteListEntry;
  snapshot: AdminSitesSnapshot;
  handle: string;
  switchingEnabled: boolean;
  activatingName: string | null;
  onActivate: (name: string) => void;
  localSites?: LocalSitesController;
  t: Translate;
}) {
  const pill = resolveSiteStatusPill({ site, snapshot, t });
  return (
    <div className={resolveSiteCardClassName(site, snapshot)} title={resolveSiteCardTitle(site)}>
      <SiteCardPreview site={site} snapshot={snapshot} />
      <div className="site-card-head">
        <span className={`status ${pill.toneClass}`}>{pill.label}</span>
      </div>
      <div className="site-card-body">
        <span className="site-card-name">{site.name}</span>
        <SiteCardFacts site={site} snapshot={snapshot} activatingName={activatingName} t={t} />
        <SiteCardActions
          site={site}
          snapshot={snapshot}
          handle={handle}
          switchingEnabled={switchingEnabled}
          activatingName={activatingName}
          onActivate={onActivate}
          controller={localSites}
          t={t}
        />
      </div>
    </div>
  );
}

/** The card's top band: the site's last captured public page, or a neutral placeholder. Decorative
 *  (`alt=""`, `aria-hidden`) like the desktop card's preview — the name and status pill right below
 *  already say which site this is, so a screen reader would only hear it twice. Lazy and async so a
 *  long grid never blocks on images below the fold. */
function SiteCardPreview({ site, snapshot }: { site: AdminSiteListEntry; snapshot: AdminSitesSnapshot }) {
  const preview = useSiteCardPreview({ site, snapshot });
  return (
    <div className="site-card-preview" aria-hidden="true">
      {preview.src === null
        ? <span className="site-card-preview-placeholder">{preview.initial}</span>
        : <img src={preview.src} alt="" loading="lazy" decoding="async" onError={preview.onError} />}
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
      {...agentHandle({ handle: "sites-empty" }, {
        role: "region",
        label: "Empty state for the All sites tab — no site folders are listed under sites/",
      })}
    >
      <h2 className="sites-empty-title">{t("No listed sites")}</h2>
      <p className="sites-empty-lead">{t("A folder appears here once Tovu has created it.")}</p>
      <a
        className="btn-primary sites-empty-action"
        href="/admin/sites?tab=new"
        {...agentHandle({ handle: "sites-empty-new-site" }, { role: "link", label: "Go to the New site tab" })}
      >
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
function CreatedSiteNotice({ createdName, createdTokens, createdAdminLogin, t }: { createdName: string | null; createdTokens: AllSitesTabProps["createdTokens"]; createdAdminLogin: AllSitesTabProps["createdAdminLogin"]; t: Translate }) {
  if (createdName === null) return null;
  return (
    <p
      className="save-ok"
      {...agentHandle({ handle: "sites-created-notice" }, {
        role: "status",
        label: "Confirmation that a site folder was created, and that creating it switched nothing",
      })}
    >
      <strong>{createdName}</strong> {t("was created. Start it to open its admin.")}
      <span className="field-hint" style={{ display: "block" }}>{createdAdminLogin}</span>
      <CreatedTokensLine createdTokens={createdTokens} />
    </p>
  );
}

/** The follow-on for tokens given with the create ("Supabase will connect when this site first
 *  starts."), or nothing. Names are plugin display names, rendered verbatim. */
function CreatedTokensLine({ createdTokens }: { createdTokens: AllSitesTabProps["createdTokens"] }) {
  if (!createdTokens) return null;
  return (
    <>
      {" "}
      <strong>{createdTokens.names.join(", ")}</strong> {createdTokens.note}
    </>
  );
}

export interface AllSitesTabProps {
  sites: AdminSiteListEntry[];
  snapshot: AdminSitesSnapshot;
  switchingEnabled: boolean;
  activatingName: string | null;
  /** The site the last successful create made, or `null` — see {@link CreatedSiteNotice}. */
  createdName: string | null;
  createdAdminLogin?: string | null;
  /** Tokens given with that create, from `useSites`'s `createdTokens`. Optional for older callers. */
  createdTokens?: { names: string[]; note: string } | null;
  onActivate: (name: string) => void;
  localSites?: LocalSitesController;
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

function SitesGrid({ sites, snapshot, switchingEnabled, activatingName, onActivate, localSites, t }: AllSitesTabProps) {
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
          handle={rowHandles[index]!}
          switchingEnabled={switchingEnabled}
          activatingName={activatingName}
          onActivate={onActivate}
          localSites={localSites}
          t={t}
        />
      ))}
    </div>
  );
}

export function AllSitesTab(props: AllSitesTabProps) {
  return (
    <>
      <CreatedSiteNotice createdName={props.createdName} createdTokens={props.createdTokens ?? null} createdAdminLogin={props.createdAdminLogin} t={props.t} />
      {sitesGridOrEmpty(props)}
    </>
  );
}

/** The card's action row — one visible lifecycle action and Open, then the "⋯" overflow menu for
 *  everything else. Only rendering: `resolveSiteCardView` decides which actions apply, and the
 *  controller owns every confirmation. Each control's accessible name carries the site's name, so a
 *  screen reader (or an agent reading the accessibility tree) can tell one card's Start from
 *  another's. */
function SiteCardActions({ site, snapshot, handle, switchingEnabled, activatingName, onActivate, controller, t }: {
  site: AdminSiteListEntry; snapshot: AdminSitesSnapshot; handle: string; switchingEnabled: boolean;
  activatingName: string | null; onActivate: (name: string) => void; controller?: LocalSitesController; t: Translate;
}) {
  const view = resolveSiteCardView({
    site, snapshot, switchingEnabled, activatingName, busyName: controller?.busyName ?? null, managed: controller !== undefined,
  });
  const items = buildSiteCardMenuItems({ site, menu: view.menu, onActivate, controller, t });
  const menuLabel = interpolate({ template: t("More actions for {name}"), vars: { name: site.name } });
  const lifecycle = view.lifecycle;
  return (
    <div className="site-card-actions">
      {view.openUrl === null ? null : (
        <a className="btn-secondary site-card-open" href={view.openUrl} target="_blank" rel="noopener noreferrer"
          aria-label={interpolate({ template: t("Open {name} in a new tab"), vars: { name: site.name } })}>
          {t("Open")}<span aria-hidden="true">↗</span>
        </a>
      )}
      {lifecycle === null ? null : (
        <button type="button" className={lifecycle.className} disabled={lifecycle.disabled}
          aria-label={`${t(lifecycle.labelKey)} ${site.name}`} onClick={() => void controller?.run(site.name, lifecycle.action)}>
          {t(lifecycle.labelKey)}
        </button>
      )}
      {items.length === 0 ? null : (
        <span className="site-card-menu">
          <RowMenu items={items} triggerLabel={menuLabel} agentHandle={`${handle}-menu`} />
        </span>
      )}
    </div>
  );
}
