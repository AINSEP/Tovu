import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { describeApiError } from "../lib/api";
import { siteUrl } from "../lib/site-url";
import { formatTimestamp } from "../lib/format-timestamp";

/**
 * @file Admin landing screen.
 *
 * Error handling: every fetch owns its own error slot rather than sharing one, because these are
 * independent data sources and a failed comment count should not blank a post count that loaded
 * fine (audit finding, `ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, exec
 * summary #5 — the original had no `.catch()` at all, so any rejection left the cards showing "…"
 * forever with no indication anything was wrong). A failed stat renders an em-dash plus the reason
 * in its own card, at the same size the healthy card occupies; see `.dash-stat-*.is-error`.
 *
 * @tradeoffs Five GETs on the landing screen instead of the previous two. Accepted because each is
 * a list this admin already serves elsewhere, they run concurrently, and none blocks render — the
 * screen paints its full layout immediately and each value fills in independently. The alternative
 * (a single aggregate `/dashboard` endpoint) would be one round trip but needs a new server route
 * and a new response contract to maintain; that is worth doing if this screen grows, and is not
 * worth it for five reads that already exist.
 *
 * Counts are `list().length`, not a server-side count, so they are bounded by whatever page size
 * those endpoints return. Correct for the scale this admin targets today; if any list grows past a
 * single page the count silently becomes "items on the first page" and would need a real count
 * endpoint. Flagged rather than pre-solved.
 */

/** Rows shown in the activity panel. Small enough to stay glanceable, large enough that a normal
 *  editing session shows more than the single post someone just touched. */
const ACTIVITY_LIMIT = 6;

interface StatState {
  value: number | null;
  error: string | null;
}

const PENDING: StatState = { value: null, error: null };

export function Dashboard() {
  const [posts, setPosts] = useState<StatState>(PENDING);
  const [published, setPublished] = useState<number | null>(null);
  const [pages, setPages] = useState<StatState>(PENDING);
  const [drafts, setDrafts] = useState<number | null>(null);
  const [media, setMedia] = useState<StatState>(PENDING);
  const [comments, setComments] = useState<StatState>(PENDING);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [recent, setRecent] = useState<AdminPost[] | null>(null);

  useEffect(() => {
    // Posts and pages each feed both a stat card and the merged activity list, so their handlers
    // do double duty rather than fetching the same list twice.
    api
      .listPosts()
      .then((r) => {
        const rows = r.posts.map((entry) => entry.post);
        setPosts({ value: rows.length, error: null });
        setPublished(rows.filter((p) => p.status === "published").length);
        setRecent((prev) => mergeRecent(prev, rows));
      })
      .catch((e) => setPosts({ value: null, error: describeApiError(e, "failed to load posts") }));

    api
      .listPages()
      .then((r) => {
        const rows = r.posts.map((entry) => entry.post);
        setPages({ value: rows.length, error: null });
        setDrafts(rows.filter((p) => p.status === "draft").length);
        setRecent((prev) => mergeRecent(prev, rows));
      })
      .catch((e) => setPages({ value: null, error: describeApiError(e, "failed to load pages") }));

    api
      .listMedia()
      .then((r) => setMedia({ value: r.media.filter((m) => m.status === "active").length, error: null }))
      .catch((e) => setMedia({ value: null, error: describeApiError(e, "failed to load media") }));

    api
      .listCommentsQueue({ status: "pending" })
      .then((r) => setComments({ value: r.items.length, error: null }))
      .catch((e) => setComments({ value: null, error: describeApiError(e, "failed to load comments") }));

    api
      .getPresentation()
      .then((r) => setThemeId(r.settings.activeThemeId))
      .catch((e) => setThemeError(describeApiError(e, "failed to load the active theme")));
  }, []);

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
                  <a className="dash-activity-title" href={`/admin/posts/${row.id}`}>
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

/** Merges one list into whatever the other fetch has already delivered and re-sorts, so the panel
 *  is correct whichever request lands first — the two are concurrent and neither can assume it is
 *  the one holding the existing state. Dedupes on id because a row is a post OR a page but the two
 *  endpoints are independent, and a future overlap should not double-render a row. */
function mergeRecent(prev: AdminPost[] | null, incoming: AdminPost[]): AdminPost[] {
  const byId = new Map((prev ?? []).map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
