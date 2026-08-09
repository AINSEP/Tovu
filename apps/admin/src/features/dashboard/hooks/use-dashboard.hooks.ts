import { useEffect, useState } from "react";

import { api, describeApiError, type AdminPost } from "../../../lib/api";
import { mergeRecent } from "../rules";
import { useAdminLocale } from "../../../hooks/use-admin-locale.hooks";
import { t } from "../dashboard-i18n";

/**
 * @file Everything the Dashboard screen loads, so `Dashboard.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same effect, same error strings.
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

export interface StatState {
  value: number | null;
  error: string | null;
}

const PENDING: StatState = { value: null, error: null };

export interface DashboardController {
  posts: StatState;
  published: number | null;
  pages: StatState;
  drafts: number | null;
  media: StatState;
  comments: StatState;
  themeId: string | null;
  themeError: string | null;
  /** `null` until at least one of `listPosts`/`listPages` settles — the caller renders a loading
   *  state for the "Recently updated" panel. */
  recent: AdminPost[] | null;
}

export function useDashboard(): DashboardController {
  const locale = useAdminLocale();
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
      .catch((e) => setPosts({ value: null, error: describeApiError(e, t(locale, "failed to load posts")) }));

    api
      .listPages()
      .then((r) => {
        const rows = r.posts.map((entry) => entry.post);
        setPages({ value: rows.length, error: null });
        setDrafts(rows.filter((p) => p.status === "draft").length);
        setRecent((prev) => mergeRecent(prev, rows));
      })
      .catch((e) => setPages({ value: null, error: describeApiError(e, t(locale, "failed to load pages")) }));

    api
      .listMedia()
      .then((r) => setMedia({ value: r.media.filter((m) => m.status === "active").length, error: null }))
      .catch((e) => setMedia({ value: null, error: describeApiError(e, t(locale, "failed to load media")) }));

    api
      .listCommentsQueue({ status: "pending" })
      .then((r) => setComments({ value: r.items.length, error: null }))
      .catch((e) => setComments({ value: null, error: describeApiError(e, t(locale, "failed to load comments")) }));

    api
      .getPresentation()
      .then((r) => setThemeId(r.settings.activeThemeId))
      .catch((e) => setThemeError(describeApiError(e, t(locale, "failed to load the active theme"))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { posts, published, pages, drafts, media, comments, themeId, themeError, recent };
}
