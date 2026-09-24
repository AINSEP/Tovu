import type { AdminPost } from "../../lib/api";
import { siteUrl } from "../../lib/site-url";
import { adminHref } from "../../lib/router";
import { formatTimestamp } from "../../lib/format-timestamp";
import type { Translate } from "../../lib/dictionary-translator";
import { agentHandle } from "@jini-ai/agentic";
import { useWiredDashboard, type StatState } from "./hooks/use-dashboard.hooks";
import { activityRowHref, commentsStatMeta, pagesStatMeta, postsStatMeta } from "./rules";
import { PublishContentDialog } from "../publish-content/PublishContentDialog";

/**
 * @file Admin landing screen — markup only.
 *
 * State and the five concurrent fetches live in `hooks/use-dashboard.hooks.ts`; the activity-list
 * merge lives in `rules.ts`. What stays here is what actually renders: the stat cards, the
 * activity panel, and the appearance panel.
 */

/** Rows shown in the activity panel. Small enough to stay glanceable, large enough that a normal
 *  editing session shows more than the single post someone just touched. */
const ACTIVITY_LIMIT = 6;

export interface DashboardProps {
  /**
   * Dependency injection seam for tests — see `features/posts/Posts.tsx`'s `usePostsHook` for the
   * house convention this follows.
   */
  useDashboardHook?: typeof useWiredDashboard;
}

/** One row in the "Recently updated" activity list. */
function ActivityRow({ row, t }: { row: AdminPost; t: Translate }) {
  return (
    <div className="dash-activity-row" key={row.id}>
      <a className="dash-activity-title" href={activityRowHref(row)}>
        {row.title || t("Untitled")}
      </a>
      <span className="dash-kind">{row.kind}</span>
      <span className="dash-activity-time">{formatTimestamp(row.updatedAt)}</span>
    </div>
  );
}

/** The "Recently updated" panel's body — a flat if-chain over its four states (both-sources-
 *  failed / loading / empty / populated) rather than the nested ternary this replaces, which was
 *  most of `Dashboard`'s cognitive cost.
 *
 * Both sources failing is its own state, not "still loading". `setRecent` is only ever called from
 * a `.then()`, so if `listPosts` AND `listPages` both reject nothing will ever move `recent` off
 * `null` — the panel would sit on "Loading…" forever with no indication anything was wrong. That is
 * precisely the defect this file's header says exec-summary #5 fixed for the stat cards, and it
 * reached the panel because the panel has no error slot of its own. Derived from the two stat
 * errors rather than given a third error state: the panel has no independent fetch, so a separate
 * slot could disagree with the cards about what happened. A single failure deliberately still
 * renders — the surviving endpoint's rows are real and worth showing. */
function RecentActivityBody(props: {
  recent: AdminPost[] | null;
  postsError: string | null;
  pagesError: string | null;
  t: Translate;
}) {
  const { t } = props;
  if (props.recent === null && props.postsError && props.pagesError) {
    return (
      <div className="dash-panel-body">
        <p className="dash-stat-meta is-error" role="alert">
          {t("Could not load recent activity.")} {props.postsError}
        </p>
      </div>
    );
  }
  if (props.recent === null) {
    return (
      <div className="dash-panel-body">
        <p>{t("Loading…")}</p>
      </div>
    );
  }
  if (props.recent.length === 0) {
    return (
      <div className="empty-state">
        <p>{t("Nothing published or drafted yet.")}</p>
        <p className="page-description">{t("Create a post or page and it will show up here.")}</p>
      </div>
    );
  }
  return (
    <div className="dash-activity">
      {props.recent.slice(0, ACTIVITY_LIMIT).map((row) => (
        <ActivityRow row={row} key={row.id} t={t} />
      ))}
    </div>
  );
}

/** The Appearance panel's body — active theme, or its own error. */
function AppearanceBody(props: { themeError: string | null; themeId: string | null; t: Translate }) {
  const { t } = props;
  if (props.themeError) {
    return (
      <p className="dash-stat-meta is-error" role="alert">
        {props.themeError}
      </p>
    );
  }
  return (
    <>
      <p>
        {t("Active theme")}
        <br />
        <strong style={{ color: "var(--fg)", fontSize: "var(--text-md)" }}>{props.themeId ?? "…"}</strong>
      </p>
      <p>{t("Your public site is live and serving this theme.")}</p>
    </>
  );
}

/** The default-password nag — password-banner plan (2026-09-24), Slice 3. `.notice.warning` is this
 *  admin's current dismissable-nag idiom (`Sites.tsx`'s `SiteDirOverrideNotice`, `Themes.tsx`'s
 *  missing-theme notice, etc. — grepped live for this pass, since `.notice.error`/`.notice.warning`
 *  is the still-current full-border variant, not the retired left-accent one `styles.css:1187-1189`
 *  documents). `role="status"`: this renders on load rather than in response to an action, matching
 *  `SiteDirOverrideNotice`'s own `agentHandle` role. */
function DefaultPasswordBanner({ onDismiss, t }: { onDismiss: () => void; t: Translate }) {
  return (
    <div className="notice warning dash-password-banner" {...agentHandle("dashboard-password-banner", { role: "status", label: "Nag that the account is still on the default password" })}>
      <p>{t("It is recommended to change your password before deploying")}</p>
      <a
        href={adminHref("/users/change-password")}
        {...agentHandle("dashboard-password-banner-change", { role: "link", label: "Go change your own password" })}
      >
        {t("Change password")}
      </a>{" "}
      <button
        type="button"
        className="btn-ghost"
        onClick={onDismiss}
        {...agentHandle("dashboard-password-banner-dismiss", { role: "button", label: "Dismiss this nag for this browser" })}
      >
        {t("Dismiss")}
      </button>
    </div>
  );
}

export function Dashboard({ useDashboardHook = useWiredDashboard }: DashboardProps = {}) {
  const {
    posts,
    published,
    pages,
    drafts,
    media,
    comments,
    themeId,
    themeError,
    recent,
    t,
    isPublishDialogOpen,
    openPublishDialog,
    closePublishDialog,
    showDefaultPasswordBanner,
    dismissDefaultPasswordBanner,
  } = useDashboardHook();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Overview")}</p>
          <h1 className="page-title">{t("Dashboard")}</h1>
          <p className="page-description">{t("Everything happening on this site at a glance.")}</p>
        </div>
        <div className="page-actions dash-header-actions">
          <a
            className="btn-secondary"
            href={siteUrl("/")}
            target="_blank"
            rel="noreferrer"
            {...agentHandle("dashboard-view-site", { role: "link", label: "Open the public site in a new tab" })}
          >
            {t("View site ↗")}
          </a>
          {/* Orange/`.btn-primary`, directly under "View site" — a deliberate, meaningful action,
              not a nav link. See `PublishContentDialog.tsx` for why the dialog it opens exists and
              why its own Confirm is a stub. */}
          <button
            type="button"
            className="btn-primary"
            onClick={openPublishDialog}
            {...agentHandle("dashboard-publish-content", {
              role: "button",
              label: "Publish content to the live site",
            })}
          >
            {t("Publish Content")}
          </button>
        </div>
      </div>

      {isPublishDialogOpen ? (
        // No `onConfirm` prop any more: the dialog owns the whole plan -> confirm -> execute
        // ceremony itself (Task 11), and a confirm handler up here could only ever be a second,
        // weaker copy of the guard that already decides when a publish may fire. Closing stays the
        // Dashboard's to own, since it owns `isPublishDialogOpen`.
        <PublishContentDialog onCancel={closePublishDialog} t={t} />
      ) : null}

      {showDefaultPasswordBanner ? <DefaultPasswordBanner onDismiss={dismissDefaultPasswordBanner} t={t} /> : null}

      <div className="dash-stats">
        <Stat
          href="/admin/posts"
          label={t("Posts")}
          state={posts}
          meta={postsStatMeta(published, t)}
          agentHandleId="dashboard-stat-posts"
        />
        <Stat
          href="/admin/pages"
          label={t("Pages")}
          state={pages}
          meta={pagesStatMeta(drafts, t)}
          agentHandleId="dashboard-stat-pages"
        />
        <Stat
          href="/admin/media"
          label={t("Media")}
          state={media}
          meta={t("items in the library")}
          agentHandleId="dashboard-stat-media"
        />
        <Stat
          href="/admin/comments"
          label={t("Comments")}
          state={comments}
          meta={commentsStatMeta(comments.value, t)}
          agentHandleId="dashboard-stat-comments"
        />
      </div>

      <div className="dash-panels">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2 className="dash-panel-title">{t("Recently updated")}</h2>
            <a href="/admin/posts" {...agentHandle("dashboard-all-posts", { role: "link", label: "Go to the full posts list" })}>
              {t("All posts")}
            </a>
          </div>
          <RecentActivityBody recent={recent} postsError={posts.error} pagesError={pages.error} t={t} />
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2 className="dash-panel-title">{t("Appearance")}</h2>
            <a href="/admin/themes" {...agentHandle("dashboard-change-theme", { role: "link", label: "Go to Themes to change the active theme" })}>
              {t("Change")}
            </a>
          </div>
          <div className="dash-panel-body">
            <AppearanceBody themeError={themeError} themeId={themeId} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat(props: { href: string; label: string; state: StatState; meta: string; agentHandleId: string }) {
  const failed = props.state.error !== null;
  return (
    <a
      className="dash-stat"
      href={props.href}
      {...agentHandle(props.agentHandleId, { role: "link", label: `${props.label} stat card — go to ${props.href}` })}
    >
      <span className="dash-stat-label">{props.label}</span>
      <span className={`dash-stat-value${failed ? " is-error" : ""}`}>
        {failed ? "—" : (props.state.value ?? "…")}
      </span>
      <span className={`dash-stat-meta${failed ? " is-error" : ""}`}>{failed ? props.state.error : props.meta}</span>
    </a>
  );
}
