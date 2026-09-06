import { agentHandle } from "@jini-ai/agentic";

import { describeApiError, type AdminSitesSnapshot } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { navigate } from "../../lib/router";
import { AllSitesTab } from "./AllSitesTab";
import { CreateSiteOnboarding } from "./CreateSiteOnboarding";
import { resolveSitesHeading, resolveSitesViewId, type SitesViewId } from "./Sites.hooks";
import type { ActivationOutlook } from "./rules";
import { useWiredSites } from "./hooks/use-sites.hooks";

/**
 * @file Sites admin screen (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`; card-grid layout 2026-09-05; tab
 * redesign 2026-09-05) — the `/admin/sites` route. List the site folders under `sites/`, create one,
 * and choose which one this server serves NEXT.
 *
 * ## Layout: a list view and a create view, ported from Tovu Runner
 *
 * An earlier pass put the create form in the site grid as a dashed tile — a whole form (label,
 * description, input, hint, button) stuffed into one grid cell, sitting alone next to no site cards
 * on the only install that exists. The owner's verdict was "This is just awful". A second pass made
 * it a tab; that was also wrong. The owner then pointed at Tovu Runner, which already has the shape
 * she wants, and directed that it be ported (overriding the standing decision not to port Runner's
 * renderer — that decision still holds for the rest of it; this screen and the grid are the named
 * exceptions).
 *
 * Runner's shape, and now this one: a `+ New site` button in the page HEADER
 * (Runner's `MainHeader`, whose own button renders only on the project list) leading to a full-page
 * create screen with its own `← All sites` back link, whose title replaces the page title while it
 * is open. So: {@link SitesProcessNotices}, then either {@link AllSitesTab} or
 * `CreateSiteOnboarding`.
 *
 * `?tab=` deep-linking keeps the query key every other tabbed admin screen uses (ADR-063's shared
 * guard) even though this screen renders views rather than tabs — see `resolveSitesViewId`'s own
 * doc for why a second spelling would be worse than a slightly loose name.
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
 * switching-disabled notice. All four render on BOTH views, because Create is the exact moment an
 * operator is most likely to believe a switch has happened.
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
 *    only SQLite today, while Runner's ported picker offers three backends; the create screen shows
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
 *  rather than on a card, and they render on the create view too: Create is the moment an operator
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

/** Dispatches the active view as a flat if-chain — a plain function rather than a ternary written
 *  directly in `Sites`'s JSX, which would be counted against that component's own complexity.
 *  @complexity O(1) — two mutually exclusive branches, no iteration. */
function sitesViewBody(view: SitesViewId, controller: ReturnType<typeof useWiredSites>, snapshot: AdminSitesSnapshot) {
  if (view === "new") return <CreateSiteOnboarding controller={controller} onBack={goToSiteList} />;
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

/** `replace: true` so moving between the list and the create screen does not grow the back stack
 *  one entry per click — the same call `Deployment.tsx` makes for its own `?tab=`. Two named
 *  functions rather than one parameterised call site: each is passed directly as an `onClick`, and
 *  an inline arrow at either would be a function written in a `.tsx` body. */
function goToSiteList() {
  navigate("/sites", { replace: true });
}

function goToCreateSite() {
  navigate("/sites?tab=new", { replace: true });
}

/** The header's `+ New site` button — Runner's `MainHeader` renders its own `+ Create website`
 *  only on the project list and never on the onboarding screen it leads to, and this follows that:
 *  the create screen offers Cancel and a back link instead, so there is no button on screen that
 *  navigates to where you already are. */
function NewSiteAction({ t }: { t: Translate }) {
  return (
    <div className="page-actions">
      <button type="button" onClick={goToCreateSite} {...agentHandle("sites-new", { role: "button", label: "Open the create-a-site onboarding screen" })}>
        <span aria-hidden="true">+ </span>
        {t("New site")}
      </button>
    </div>
  );
}

/** The create screen's own `← All sites` back link, ported from Runner's `back-link`. A real
 *  `<a href>` rather than a button: it is a navigation to a URL that exists, so it should be
 *  middle-clickable and copyable, and the app's own internal-link interceptor handles the rest. */
function BackToSitesLink({ t }: { t: Translate }) {
  return (
    <a className="back-link" href="/admin/sites">
      <span aria-hidden="true">← </span>
      {t("All sites")}
    </a>
  );
}

/** Nothing on the list view, the back link on the create view — a plain function so `Sites` itself
 *  carries neither branch.
 *  @complexity O(1). */
function sitesViewLead(view: SitesViewId, t: Translate) {
  return view === "new" ? <BackToSitesLink t={t} /> : null;
}

/** The header's right-hand action, on the list view only — see {@link NewSiteAction}.
 *  @complexity O(1). */
function sitesHeaderAction(view: SitesViewId, t: Translate) {
  return view === "new" ? null : <NewSiteAction t={t} />;
}

export function Sites(props: SitesProps = {}) {
  const controller = resolveSitesHook(props.useSitesHook)();
  const { snapshot, listStatus, listError, writeError, switchingEnabled, outlook, restartInstructions, t } = controller;

  if (listStatus === "error" && !snapshot) {
    return <div className="notice error">{describeApiError(listError, t("Could not load the site list."))}</div>;
  }
  if (!snapshot) return <div className="notice">{t("Loading sites…")}</div>;

  const view = resolveSitesViewId(props.tabId);
  const heading = resolveSitesHeading(view, t);

  return (
    <div className="page">
      {sitesViewLead(view, t)}
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{heading.kicker}</p>
          <h1 className="page-title">{heading.title}</h1>
          <p className="page-description">{heading.description}</p>
        </div>
        {sitesHeaderAction(view, t)}
      </div>

      {writeError ? <div className="notice error">{writeError}</div> : null}
      {switchingEnabled ? null : <SwitchingDisabledNotice t={t} />}

      <SitesProcessNotices snapshot={snapshot} outlook={outlook} instructions={restartInstructions} t={t} />

      {sitesViewBody(view, controller, snapshot)}
    </div>
  );
}
