import { agentHandle } from "@jini-ai/agentic";

import { describeApiError, type AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { navigate } from "../../lib/router";
import { TabBar } from "../../components/TabBar";
import { AllSitesTab } from "./AllSitesTab";
import { CreateSiteOnboarding } from "./CreateSiteOnboarding";
import { resolveSitesTabId, resolveSitesTabs, type SitesTabId } from "./Sites.hooks";
import type { ActivationOutlook } from "./rules";
import { useReturnToSiteListOnCreate } from "./hooks/use-created-site-return.hooks";
import { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file Sites admin screen (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`; card-grid layout 2026-09-05; tab
 * redesign 2026-09-05) — the `/admin/sites` route. List the site folders under `sites/`, create one,
 * and choose which one this server serves NEXT.
 *
 * ## Layout: two tabs — "All sites" and "New site"
 *
 * {@link SitesProcessNotices}, then a real `TabBar`, then one of {@link AllSitesTab} /
 * `CreateSiteOnboarding`. The create form lives INSIDE the second tab; there is no separate page
 * and no header button.
 *
 * Getting here took three passes, and the two wrong ones are worth naming because the same mistake
 * is easy to make again:
 *
 * 1. The create form was a dashed tile in the site grid — a whole form stuffed into one grid cell.
 *    Owner's verdict: "This is just awful."
 * 2. Her replacement was a tab system, stated in words: *"the first tab is all sites. Second tab is
 *    create new."* It was built that way (`92731735`).
 * 3. Screenshots of Tovu Runner — where "Create website" is a header button leading to a full page
 *    — were then relayed as a correction, and that override deleted the tab bar she had asked for
 *    (`554f6183`). Her response: *"What I wanted was a tab system. I specifically told you a tab
 *    system … It shouldn't go to another page. It makes no sense to have a `?tab=...` that's
 *    another page and then delete the tab I specifically asked you to create in the first place."*
 *
 * **A reference screenshot is not an instruction. When a reference conflicts with what the owner
 * stated in words, the words win — or you ask.** What survived from pass 3 is the part she liked:
 * the onboarding form's own content (its sections and the three database options) is unchanged,
 * just rendered inside the tab instead of on a page of its own.
 *
 * A successful create returns to "All sites" with the new site's card showing — her requirement,
 * wired through `useReturnToSiteListOnCreate` (`hooks/use-created-site-return.hooks.ts`), and the
 * confirmation line moved with it, onto the tab where the new card actually is.
 *
 * `?tab=all|new` deep-linking runs through the shared `resolveActiveTabId` guard (ADR-063), the
 * same convention Deployment/Database/Themes use.
 *
 * ## The "Now serving" panel is gone (2026-09-05)
 *
 * It used to sit above the tabs: a full-width card naming the live folder and its absolute path,
 * with an amber "This site isn't listed below" banner under it. The owner removed it — "that top
 * card, the now serving card should not even be there. It should just be a card in all sites with a
 * green active button. So we save some space."
 *
 * It could only go once the served site actually reached the grid, and it did not: `listSites`
 * requires `config.json` + `.site-meta.json`, this repo's own `sites/tovu-com` has neither, so the
 * grid was empty and that panel was the screen HONESTLY reporting a backend gap. Deleting it alone
 * would have deleted the truth and kept the bug. `includeServingSite` (`site-registry.ts`) closed
 * the gap first; the served folder is now a card like any other, wearing the green `Serving now`
 * badge, and the amber banner's fact became a small `Not initialized` badge on that same card.
 *
 * What stayed page-level is what is genuinely page-level: {@link SitesProcessNotices} — the
 * `TOVU_SITE_DIR` override and any pending choice — plus the write-error banner and the
 * switching-disabled notice. All four sit ABOVE the tab bar and render on BOTH tabs, because
 * Create is the exact moment an operator is most likely to believe a switch has happened, and a
 * bookmarked `?tab=new` must not be a page that hides why Create is inert.
 *
 * ## What was NOT ported: Runner's per-project tab strip
 *
 * Runner's `TabStrip` is a permanent "All" tab plus one closable tab per OPEN project, and each of
 * those tabs renders a `<webview>` embedding that project's own separately-running `tovu serve`
 * process on its own port. None of those three preconditions exists here. This admin IS one site's
 * admin, bound at boot by a single `siteDir()` resolution; there is no second server process to
 * embed, no "open" state to toggle, and nothing a per-site tab could contain. Worse, a clickable
 * tab labelled with another site's name would assert the one thing this screen must never assert —
 * that you are now in that site — when in fact nothing switches without a restart. Raised with the
 * team lead rather than built; see the report for the shape that would work if she wants the strip.
 *
 * ## The design constraint that shapes every section below
 *
 * Activate cannot switch a running server. `siteDir()` resolves `TOVU_SITE_DIR`/`TOVU_SITE` once,
 * at boot, and `content.db`/uploads/themes all bind off that single resolution — so Activate
 * persists a choice to `.env` and a human restarts. The owner was told this and chose the design
 * anyway (that decision record, "Mechanism"); auto-restart via the `dev.mjs` supervisor was offered
 * and declined for this slice.
 *
 * That makes the screen's real job *not lying*. Four separate things could each produce a screen
 * that implies something happened when it did not, and each has its own home here:
 *
 * 1. **The served folder may not be a real site directory.** `listSites` only counts a directory
 *    once it carries `config.json` + `.site-meta.json`, and this repo's own `sites/tovu-com` has
 *    neither. It now gets a card regardless (`includeServingSite`), so the fix for "the grid is
 *    empty on a running server" must not become a new lie: that card wears a `Not initialized`
 *    badge, because `tovu serve` would still refuse the folder. See `AllSitesTab.tsx`.
 * 2. **A pending choice is not a switch.** After Activate the activated card still reports
 *    `pending-restart`, never `serving`, because the server re-derives `currentSite` from what it
 *    actually booted with. {@link PendingActivationNotice} names what is still being served.
 * 3. **A pending choice can be inert.** `resolveSiteRoot` reads `TOVU_SITE_DIR` ABOVE the
 *    `TOVU_SITE` line Activate writes, so with that variable set the next boot ignores the choice
 *    entirely. `activationOutlook` (`rules.ts`) reports that case separately and the copy says the
 *    restart will NOT pick the choice up.
 * 4. **A database picker could promise a backend that does not exist.** Site creation is SQLite and
 *    only SQLite today, while Runner's ported picker offers three backends; the New site tab shows
 *    all three without being able to act on two of them. See `CreateSiteOnboarding.tsx`'s own
 *    header — that guarantee is structural, and it is the same class of honesty the three points
 *    above are.
 *
 * The daemon rides the same restart and is called out in the copy for the same reason: the known
 * `reference_daemon_inherits_cwd_not_site_dir` trap is closed here (`daemon-supervisor.ts` threads
 * `TOVU_SITE_DIR` from the parent's own resolved `siteDir()` into every spawn, so the daemon cannot
 * drift onto a different site than the API) — but "closed" means both are on the OLD site until the
 * restart, which is a thing the operator has to be told, not a thing to leave implied.
 *
 * ## Markup only
 *
 * All state, effects, and `api.*` calls live in `hooks/use-sites.hooks.ts`; screen-independent
 * domain logic lives in `rules.ts`; derived values specific to this screen's own markup (a button's
 * `disabled`, a card's tooltip and badges, a card's agent handles) live in `Sites.hooks.tsx`, per that file's own
 * header. What stays here is what renders. `t` is threaded down as a prop from `Sites`'s own hook
 * rather than each subcomponent resolving its own — see `Redirects.tsx`'s header for the standing
 * i18n rule.
 */

/** Shown when `TOVU_SITE_DIR` is set — see this file's header, point 3. */
function SiteDirOverrideNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("sites-dir-override-notice", {
        role: "status",
        label: "Warning that TOVU_SITE_DIR is set and outranks anything Activate writes",
      })}
    >
      {t("TOVU_SITE_DIR is set in this server's environment. It overrides Activate — restarting will keep serving this folder until it's unset.")}
    </div>
  );
}

/** The "a choice is saved but nothing has happened yet" line — see this file's header, point 2.
 *  Renders nothing when no choice is pending, so the caller has no conditional of its own.
 *
 *  This is the ONLY place a pending choice is reported. An earlier revision also rendered the
 *  activate response as its own separate notice below the card, which put the same sentence on
 *  screen twice the moment an operator clicked Activate; the response's one genuinely unique
 *  contribution is `restartInstructions` (the route's own prose, so the wording lives in one
 *  place), and that is threaded in here as `instructions` instead. It is `null` after a reload —
 *  the response is gone but the pending state is not, which is exactly the split `persistedSiteName`
 *  exists to cover. */
function PendingActivationNotice({
  outlook,
  currentName,
  instructions,
  t,
}: {
  outlook: ActivationOutlook;
  currentName: string;
  instructions: string | null;
  t: Translate;
}) {
  if (outlook.kind === "none") return null;
  return (
    <div
      className={outlook.kind === "pending" ? "notice warning" : "notice error"}
      {...agentHandle("sites-pending-activation", {
        role: "status",
        label: "Which site is queued for the next restart, and whether that restart will honor it",
      })}
    >
      <p>
        <strong>{outlook.name}</strong>{" "}
        {outlook.kind === "pending"
          ? t("is saved to serve next. Nothing has switched yet — this server and its agent daemon are both still on")
          : t("is saved, but TOVU_SITE_DIR overrides it, so a restart will not pick it up. This server and its agent daemon are both still on")}{" "}
        <strong>{currentName}</strong>
        {t(".")}
      </p>
      {instructions === null ? <p>{t("Restart the dev server to apply it.")}</p> : <p>{instructions}</p>}
    </div>
  );
}

/** Nothing when no choice is pending, so {@link SitesProcessNotices} needs no conditional of its
 *  own. `status-error` (not `status-warning`) for `pending-ignored` mirrors
 *  {@link PendingActivationNotice}'s own `notice error` — the color that means "this will not
 *  happen", not just "this hasn't happened yet". The at-a-glance counterpart to that component's
 *  prose: the same two facts, as a pill instead of a paragraph, for the operator who wants the
 *  answer without reading it. */
function OutlookBadge({ outlook, t }: { outlook: ActivationOutlook; t: Translate }) {
  if (outlook.kind === "none") return null;
  const tone = outlook.kind === "pending" ? "status-warning" : "status-error";
  const state = outlook.kind === "pending" ? t("queued") : t("won't apply");
  return (
    <span className={`status ${tone}`}>
      {outlook.name} · {state}
    </span>
  );
}

/** Everything the screen must say about the PROCESS rather than about any one site: the
 *  `TOVU_SITE_DIR` override, and a pending choice with whether a restart will honor it.
 *
 *  These outlived the "Now serving" panel that used to house them. They are page-level facts — they
 *  describe this server's own environment and its `.env`, not a row — so they sit above the grid
 *  rather than on a card, and they render above the tab bar so the New site tab keeps them too:
 *  Create is the moment an operator
 *  is most likely to assume a switch has happened. Renders nothing at all when there is nothing to
 *  say, so the caller has no conditional of its own and the grid moves up.
 *
 *  What did NOT survive is the unlisted-site banner. Its sentence ("This site isn't listed below,
 *  but it's still what's being served.") described a screen where the served folder had no card;
 *  it now has one, so the fact moved onto that card as a badge — see
 *  `Sites.hooks.tsx`'s `resolveSiteRegistrationBadge`. */
function SitesProcessNotices({
  snapshot,
  outlook,
  instructions,
  t,
}: {
  snapshot: AdminSitesSnapshot;
  outlook: ActivationOutlook;
  /** The last activate response's own restart prose, or `null` when there has not been one this
   *  page load — see {@link PendingActivationNotice}. */
  instructions: string | null;
  t: Translate;
}) {
  return (
    <div
      className="sites-process-notices"
      {...agentHandle("sites-process-notices", {
        role: "region",
        label: "Environment and pending-restart facts about the server process, not about any one site",
      })}
    >
      {snapshot.currentSite.dirOverridden ? <SiteDirOverrideNotice t={t} /> : null}
      <OutlookBadge outlook={outlook} t={t} />
      <PendingActivationNotice outlook={outlook} currentName={snapshot.currentSite.name} instructions={instructions} t={t} />
    </div>
  );
}

/** Why Create and Activate are inert on this deployment. Rendered instead of a button that would
 *  403 — the capability is a deployment fact, not a permission the operator can fix here. Sits
 *  above the tab bar so it is visible from the questionnaire as well as the grid. */
function SwitchingDisabledNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice"
      {...agentHandle("sites-switching-disabled", {
        role: "status",
        label: "Explanation that this deployment cannot switch sites, and what to use instead",
      })}
    >
      {t("Creating and activating sites is turned off on this deployment. Tovu-Runner switches sites itself, and a hosted install uses workspaces instead. The site being served is still shown above.")}
    </div>
  );
}

export interface SitesProps {
  /** Dependency injection seam for tests — same convention as every other wired-hook prop in this
   *  app. See `PostsProps.usePostsHook` for the full rationale. */
  useSitesHook?: typeof useWiredSites;
  /** The `?tab=` query value from `panels.tsx`'s `sites` route (`URLSearchParams.get` returns
   *  `null` when the param is absent). See `resolveSitesViewId`. */
  tabId?: string | null;
}

/** Resolves {@link SitesProps.useSitesHook} to the real hook when a caller passes none — a call out
 *  to a separately-scoped resolver rather than a destructuring default plus a `= {}` parameter
 *  default keeps `Sites`'s own ESLint cyclomatic-complexity count from counting a second branch for
 *  the empty-props case (same reasoning `OverviewTab.tsx`'s `resolveDeploymentOverviewHook`
 *  documents for its own props). */
function resolveSitesHook(override: typeof useWiredSites | undefined): typeof useWiredSites {
  return override ?? useWiredSites;
}

/** Dispatches the active tab's panel as a flat if-chain — a plain function rather than a ternary
 *  written directly in `Sites`'s JSX, which would be counted against that component's own
 *  complexity. Same split `Deployment.tsx`'s own `deploymentTabPanel` makes for the identical gate.
 *  @complexity O(1) — two mutually exclusive branches, no iteration. */
function sitesTabPanel(tab: SitesTabId, controller: ReturnType<typeof useWiredSites>, snapshot: AdminSitesSnapshot) {
  if (tab === "new") return <CreateSiteOnboarding controller={controller} onCancel={goToSiteList} />;
  return (
    <AllSitesTab
      sites={controller.sites}
      snapshot={snapshot}
      switchingEnabled={controller.switchingEnabled}
      activatingName={controller.activatingName}
      createdName={controller.createdName}
      onActivate={controller.activate}
      t={controller.t}
    />
  );
}

/** `replace: true` so moving between the two tabs does not grow the back stack one entry per click
 *  — the same call `Themes.tsx`/`Deployment.tsx` make for their own `?tab=`. A module-level
 *  function, not an inline arrow: `TabBar`'s `onChange` takes it directly, and
 *  {@link goToSiteList} below has to keep a stable identity for
 *  {@link useReturnToSiteListOnCreate}'s effect. */
function goToSitesTab(id: string) {
  navigate(`/sites?tab=${id}`, { replace: true });
}

/** Back to the first tab: Cancel's destination, and where a successful create lands. */
function goToSiteList() {
  navigate("/sites?tab=all", { replace: true });
}

export function Sites(props: SitesProps = {}) {
  const controller = resolveSitesHook(props.useSitesHook)();
  const { snapshot, listStatus, listError, writeError, switchingEnabled, outlook, restartInstructions, createdName, sites, t } = controller;

  // Before the early returns below, so this screen never changes its hook order between the
  // loading, error, and loaded renders.
  useReturnToSiteListOnCreate(createdName, goToSiteList);

  if (listStatus === "error" && !snapshot) {
    return <div className="notice error">{describeApiError(listError, t("Could not load the site list."))}</div>;
  }
  if (!snapshot) return <div className="notice">{t("Loading sites…")}</div>;

  const tab = resolveSitesTabId(props.tabId);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Overview")}</p>
          <h1 className="page-title">{t("Sites")}</h1>
          <p className="page-description">
            {t("Each site under sites/ has its own content, uploads, and themes. Switching between them takes a restart.")}
          </p>
        </div>
      </div>

      {writeError ? <div className="notice error">{writeError}</div> : null}
      {switchingEnabled ? null : <SwitchingDisabledNotice t={t} />}

      <SitesProcessNotices snapshot={snapshot} outlook={outlook} instructions={restartInstructions} t={t} />

      <TabBar
        tabs={resolveSitesTabs(t, sites.length)}
        activeId={tab}
        onChange={goToSitesTab}
        ariaLabel={t("Sites")}
        containerHandle="sites-tabs"
      />

      {sitesTabPanel(tab, controller, snapshot)}
    </div>
  );
}
