import { siteUrl } from "../../lib/site-url";
import { formatTimestamp } from "../../lib/format-timestamp";
import { useDashboard, type StatState } from "./hooks/use-dashboard.hooks";
import { activityRowHref } from "./rules";

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
  useDashboardHook?: typeof useDashboard;
}

export function Dashboard({ useDashboardHook = useDashboard }: DashboardProps = {}) {
  const { posts, published, pages, drafts, media, comments, themeId, themeError, recent } = useDashboardHook();

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Overview</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">Everything happening on this site at a glance.</p>
        </div>
        <div className="page-actions">
          <a className="btn-secondary" href={siteUrl("/")} target="_blank" rel="noreferrer">
            View site ↗
          </a>
        </div>
      </div>

      <div className="dash-stats">
        <Stat href="/admin/posts" label="Posts" state={posts} meta={published === null ? "" : `${published} published`} />
        <Stat href="/admin/pages" label="Pages" state={pages} meta={drafts === null ? "" : `${drafts} draft${drafts === 1 ? "" : "s"}`} />
        <Stat href="/admin/media" label="Media" state={media} meta="items in the library" />
        <Stat
          href="/admin/comments"
          label="Comments"
          state={comments}
          meta={comments.value === 0 ? "nothing to review" : "awaiting moderation"}
        />
      </div>

      <div className="dash-panels">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2 className="dash-panel-title">Recently updated</h2>
            <a href="/admin/posts">All posts</a>
          </div>
          {/* Both sources failing is its own state, not "still loading". `setRecent` is only ever
              called from a `.then()`, so if `listPosts` AND `listPages` both reject nothing will
              ever move `recent` off `null` — the panel would sit on "Loading…" forever with no
              indication anything was wrong. That is precisely the defect this file's header says
              exec-summary #5 fixed for the stat cards, and it reached the panel because the panel
              has no error slot of its own. Derived from the two stat errors rather than given a
              third error state: the panel has no independent fetch, so a separate slot could
              disagree with the cards about what happened. A single failure deliberately still
              renders — the surviving endpoint's rows are real and worth showing. */}
          {recent === null && posts.error && pages.error ? (
            <div className="dash-panel-body">
              <p className="dash-stat-meta is-error" role="alert">
                Could not load recent activity. {posts.error}
              </p>
            </div>
          ) : recent === null ? (
            <div className="dash-panel-body">
              <p>Loading…</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <p>Nothing published or drafted yet.</p>
              <p className="page-description">Create a post or page and it will show up here.</p>
            </div>
          ) : (
            <div className="dash-activity">
              {recent.slice(0, ACTIVITY_LIMIT).map((row) => (
                <div className="dash-activity-row" key={row.id}>
                  <a className="dash-activity-title" href={activityRowHref(row)}>
                    {row.title || "Untitled"}
                  </a>
                  <span className="dash-kind">{row.kind}</span>
                  <span className="dash-activity-time">{formatTimestamp(row.updatedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2 className="dash-panel-title">Appearance</h2>
            <a href="/admin/themes">Change</a>
          </div>
          <div className="dash-panel-body">
            {themeError ? (
              <p className="dash-stat-meta is-error" role="alert">
                {themeError}
              </p>
            ) : (
              <>
                <p>
                  Active theme
                  <br />
                  <strong style={{ color: "var(--fg)", fontSize: "var(--text-md)" }}>{themeId ?? "…"}</strong>
                </p>
                <p>Your public site is live and serving this theme.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat(props: { href: string; label: string; state: StatState; meta: string }) {
  const failed = props.state.error !== null;
  return (
    <a className="dash-stat" href={props.href}>
      <span className="dash-stat-label">{props.label}</span>
      <span className={`dash-stat-value${failed ? " is-error" : ""}`}>
        {failed ? "—" : (props.state.value ?? "…")}
      </span>
      <span className={`dash-stat-meta${failed ? " is-error" : ""}`}>{failed ? props.state.error : props.meta}</span>
    </a>
  );
}
