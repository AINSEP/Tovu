import { agentHandle } from "@jini-ai/agentic";

import { describeApiError, type AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { navigate } from "../../lib/router";
import { TabBar } from "../../components/TabBar";
import { AllSitesTab } from "./AllSitesTab";
import { NewSiteTab } from "./NewSiteTab";
import { resolveSitesTabId, resolveSitesTabs, type SitesTabId } from "./Sites.hooks";
import { siteRowStateLabelKey, siteRowStateToneClass, type ActivationOutlook } from "./rules";
import { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file Sites admin screen (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`; card-grid layout 2026-09-05; tab
 * redesign 2026-09-05) — the `/admin/sites` route. List the site folders under `sites/`, create one,
 * and choose which one this server serves NEXT.
 *
 * ## Layout: a page-level status line, then two tabs
 *
 * The previous pass put the create form in the site grid as a dashed tile — a whole form (label,
 * description, input, hint, button) stuffed into one grid cell, sitting alone next to no site cards
 * on the only install that exists. The owner's verdict was "This is just awful", and her
 * replacement was a tab system: "the first tab is all sites … second tab is create new … and in
 * that, we have cards for all the sites we have currently active … whether they're active or not."
 *
 * So: `NowServingCard`, then `TabBar`, then one of {@link AllSitesTab} / {@link NewSiteTab}.
 * `?tab=` deep-linking follows the same convention `Deployment`/`Database`/`Themes` use — the guard
 * is `resolveSitesTabId` (`Sites.hooks.tsx`), an unrecognized value falls back to "all" rather than
 * blanking the panel, and a tab click `navigate`s with `replace: true` so the URL stays a correct
 * deep link without growing history one entry per click.
 *
 * **"Now serving" sits ABOVE the tab bar, not inside a tab, and that placement is a requirement
 * rather than a layout preference.** It is the one fact this screen exists to state; putting it in
 * the "All sites" tab would mean switching to "New site" hid it, and a bookmarked `?tab=new` would
 * open a page that never says what is being served. Above the tabs it is what it actually is: a
 * property of the page, true on both tabs. Same for the write-error banner and the
 * switching-disabled notice — the reason Create is inert has to reach the operator who opened the
 * questionnaire, not only the one looking at the grid.
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
 * 1. **The live site may not be in the grid at all.** `listSites` only counts a directory once it
 *    carries a valid `.site-meta.json` commit marker, and this repo's own `sites/tovu-com` predates
 *    that marker — so `sites[]` comes back EMPTY on a server that is plainly serving it. {@link
 *    NowServingCard} renders `currentSite` (the server's own live binding, not a card) FIRST and
 *    unconditionally, and says so explicitly when `listed` is false. The "All sites" tab count is
 *    derived from that same empty list rather than nudged upward to match intuition
 *    (`resolveSitesTabs`), and the tab's empty state points back at this card in words.
 * 2. **A pending choice is not a switch.** After Activate the activated card still reports
 *    `pending-restart`, never `serving`, because the server re-derives `currentSite` from what it
 *    actually booted with. {@link PendingActivationNotice} names what is still being served.
 * 3. **A pending choice can be inert.** `resolveSiteRoot` reads `TOVU_SITE_DIR` ABOVE the
 *    `TOVU_SITE` line Activate writes, so with that variable set the next boot ignores the choice
 *    entirely. `activationOutlook` (`rules.ts`) reports that case separately and the copy says the
 *    restart will NOT pick the choice up.
 * 4. **A database picker could promise a backend that does not exist.** Site creation is SQLite and
 *    only SQLite today; the questionnaire shows the choice the owner asked for without being able
 *    to act on it wrongly. See `NewSiteTab.tsx`'s own header — that guarantee is structural, and it
 *    is the same class of honesty the three points above are.
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
 * `disabled`, the tab list, a card's agent handles) live in `Sites.hooks.tsx`, per that file's own
 * header. What stays here is what renders. `t` is threaded down as a prop from `Sites`'s own hook
 * rather than each subcomponent resolving its own — see `Redirects.tsx`'s header for the standing
 * i18n rule.
 */

/** One `label / value` pair in the compact "Now serving" line. Plain text, not `.field-readonly`
 *  (that class renders a bordered, backgrounded box the same height as a real input — the exact
 *  "looks like a disabled text field" the owner flagged on an earlier layout). `title` carries
 *  the full value for the absolute path, which is truncated with an ellipsis at narrow widths. */
function ServingFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="sites-now-serving-fact">
      <span className="sites-now-serving-fact-label">{label}</span>
      <span className={mono ? "sites-now-serving-fact-value mono" : "sites-now-serving-fact-value"} title={value}>
        {value}
      </span>
    </span>
  );
}

/** Shown when the served directory does not appear in the grid — see this file's header, point 1.
 *  Without this the screen reads as "you have no sites" on a running server. */
function UnlistedSiteNotice({ t }: { t: Translate }) {
  return (
    <div
      className="notice warning"
      {...agentHandle("sites-unlisted-notice", {
        role: "status",
        label: "Warning that the site currently being served does not appear in the sites grid",
      })}
    >
      {t("This site isn't listed below, but it's still what's being served.")}
    </div>
  );
}

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

/** Nothing when no choice is pending, so {@link NowServingBadges} needs no conditional of its
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

/** The card-head's right-hand group: which site is live right now, and — when one is pending —
 *  which is queued and whether it will actually take effect. "Serving now" is called with the
 *  literal `"serving"` rather than a derived state: this card is definitionally describing that
 *  state, not a row that could be any of the three, so it reuses the row table's own label/tone
 *  functions rather than re-deriving the same string. Same wording, same color, in both places —
 *  an operator learns the vocabulary once. */
function NowServingBadges({ outlook, t }: { outlook: ActivationOutlook; t: Translate }) {
  return (
    <div className="card-head-actions">
      <span className={`status ${siteRowStateToneClass("serving")}`}>{t(siteRowStateLabelKey("serving"))}</span>
      <OutlookBadge outlook={outlook} t={t} />
    </div>
  );
}

/** The live binding, first and unconditional — never a card from the grid, which may not contain
 *  it, and never inside a tab, which could hide it. One compact line plus its warnings, not a full
 *  panel — see this file's header. */
function NowServingCard({
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
      className="card"
      {...agentHandle("sites-now-serving", {
        role: "region",
        label: "The site this server process is actually bound to right now, and any queued change to it",
      })}
    >
      <div className="card-head">
        <h2 className="card-title">{t("Now serving")}</h2>
        <NowServingBadges outlook={outlook} t={t} />
      </div>
      <div className="sites-now-serving">
        <ServingFact label={t("Folder")} value={snapshot.currentSite.name} />
        <ServingFact label={t("Path")} value={snapshot.currentSite.dir} mono />
        <div className="sites-now-serving-notices">
          {snapshot.currentSite.listed ? null : <UnlistedSiteNotice t={t} />}
          {snapshot.currentSite.dirOverridden ? <SiteDirOverrideNotice t={t} /> : null}
          <PendingActivationNotice outlook={outlook} currentName={snapshot.currentSite.name} instructions={instructions} t={t} />
        </div>
      </div>
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
   *  `null` when the param is absent). See `resolveSitesTabId`. */
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

/** Dispatches the one active tab's panel as a flat if-chain — same shape `Deployment.tsx`'s
 *  `deploymentTabPanel` uses for the identical complexity-gate reason: a component's OWN
 *  cyclomatic/cognitive score counts a ternary written directly in its JSX, not one delegated to a
 *  plain function like this.
 *  @complexity O(1) — two mutually exclusive branches, no iteration. */
function sitesTabPanel(activeTabId: SitesTabId, controller: ReturnType<typeof useWiredSites>, snapshot: AdminSitesSnapshot) {
  if (activeTabId === "new") return <NewSiteTab controller={controller} />;
  return (
    <AllSitesTab
      sites={controller.sites}
      snapshot={snapshot}
      switchingEnabled={controller.switchingEnabled}
      activatingName={controller.activatingName}
      onActivate={controller.activate}
      t={controller.t}
    />
  );
}

/** A tab click rewrites `?tab=` in place. `replace: true` so switching tabs does not grow the back
 *  stack one entry per click — the same call `Deployment.tsx` makes. */
function navigateToSitesTab(nextTabId: string) {
  navigate(`/sites?tab=${nextTabId}`, { replace: true });
}

export function Sites(props: SitesProps = {}) {
  const controller = resolveSitesHook(props.useSitesHook)();
  const { snapshot, sites, listStatus, listError, writeError, switchingEnabled, outlook, restartInstructions, t } = controller;

  if (listStatus === "error" && !snapshot) {
    return <div className="notice error">{describeApiError(listError, t("Could not load the site list."))}</div>;
  }
  if (!snapshot) return <div className="notice">{t("Loading sites…")}</div>;

  const activeTabId = resolveSitesTabId(props.tabId);

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

      <NowServingCard snapshot={snapshot} outlook={outlook} instructions={restartInstructions} t={t} />

      <TabBar
        ariaLabel={t("Sites")}
        tabs={resolveSitesTabs(t, sites.length)}
        activeId={activeTabId}
        onChange={navigateToSitesTab}
        containerHandle="sites-tab-bar"
      />
      {sitesTabPanel(activeTabId, controller, snapshot)}
    </div>
  );
}
