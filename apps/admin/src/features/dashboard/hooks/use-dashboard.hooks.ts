import { useEffect, useState } from "react";

import { describeApiError, type AdminPost, type AdminSiteTokenState } from "@/lib/api";
import { mergeRecent, shouldShowDefaultPasswordBanner, shouldShowSiteKeyBanner, siteKeyBannerCopy } from "../rules";
import { useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../dashboard-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultDashboardPort } from "./dashboard-dependencies.hooks";
import type { DashboardPort } from "./dashboard-port.hooks";

/** Password-banner plan (2026-09-24), Slice 3 — per-browser dismiss for the default-password nag.
 *  Namespaced under `tovu.admin.` like `standing-draft-local-backup.ts`'s own keys, so it can never
 *  collide with an unrelated app key. The stored value is the principal id that dismissed it, so a
 *  different user signing in on the same browser still sees their own nag. */
const DEFAULT_PASSWORD_BANNER_DISMISSED_KEY = "tovu.admin.default-password-banner.dismissed";

/** Best-effort read — `localStorage` throws outright in some privacy modes (same caveat
 *  `standing-draft-local-backup.ts`'s header documents at length). A read that fails just shows the
 *  banner again, which is harmless: it is advisory and its truth is recomputed from the server on
 *  every load (see `rules.ts`'s `shouldShowDefaultPasswordBanner`).
 *  @complexity Time/space: O(1). */
function readDefaultPasswordBannerDismissedBy(): string | null {
  try {
    return localStorage.getItem(DEFAULT_PASSWORD_BANNER_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Best-effort write — silent no-op on any storage failure, for the same reason the read above is.
 *  @complexity Time/space: O(1). */
function writeDefaultPasswordBannerDismissedBy(principalId: string): void {
  try {
    localStorage.setItem(DEFAULT_PASSWORD_BANNER_DISMISSED_KEY, principalId);
  } catch {
    // best-effort; see this file's header note on the Dismiss control.
  }
}

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
 *
 * `deps.port` is injected (see `dashboard-port.hooks.ts`) rather than reaching for `lib/api`'s
 * `api` directly, so a test can describe each of the five reads against `createFakeDashboardPort`
 * instead of stubbing global `fetch`. `useWiredDashboard` below is the zero-argument-dependencies
 * pair `Dashboard.tsx` actually mounts.
 *
 * `deps.t`/`deps.locale` (2026-08-11, standing i18n rule — a component with a hook gets a BOUND
 * `t` from that hook, not its own `useAdminLocale()`/dictionary import) are ALSO now injected
 * dependencies rather than values this hook resolved for itself: `Dashboard.tsx` needs a bound
 * translator, and `deps.locale` is what THIS hook's own error strings resolve against via the
 * `translate(locale, key)` two-arg import (aliased to avoid colliding with the injected one-arg
 * `t`) — same split `media-dependencies.hooks.ts` documents for its identical `translate`
 * alias/`t` pass-through pair. `useWiredDashboard` resolves both from the real `useWiredAdminLocale()`.
 *
 * 2026-08-14: this closes the port-conversion gap an earlier pass in this file's history left
 * disclosed ("NOT converted to the full port pattern... scoped as i18n-only... left as a disclosed
 * gap, not silently expanded") — the dispatch that added `deps.t` deliberately deferred the
 * 5-endpoint port because it was a materially larger diff than that pass's own scope; this pass's
 * scope is exactly "convert the admin DI seams still missing one," so the deferred half lands now.
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
  /** Bound translator — `key` already resolved against the caller's locale, so `Dashboard.tsx`
   *  never imports `useAdminLocale`/`DASHBOARD_DICT` itself. See this file's header. */
  t: Translate;

  /** Password-banner plan (2026-09-24), Slice 3 — whether the default-password nag should render.
   *  `rules.ts`'s `shouldShowDefaultPasswordBanner`, applied to this hook's own fetched status and
   *  dismissed flag. */
  showDefaultPasswordBanner: boolean;
  /** Hides the banner for this browser and persists that choice (best-effort). */
  dismissDefaultPasswordBanner: () => void;

  /** Site-key plan (2026-09-24) §A.6 — whether the site-key warning banner should render.
   *  `rules.ts`'s `shouldShowSiteKeyBanner`, applied to this hook's own fetched state. */
  showSiteKeyBanner: boolean;
  /** The banner's own copy for the current state (`rules.ts`'s `siteKeyBannerCopy`) — `""` whenever
   *  {@link showSiteKeyBanner} is `false`. */
  siteKeyBannerMessage: string;
}

export interface DashboardDependencies {
  port: DashboardPort;
  /** Resolves this hook's OWN `describeApiError` fallback strings via the direct `translate`
   *  import above — see this file's header for why that's a separate concern from `t`. */
  locale: string;
  /** Bound translator, passed straight through to {@link DashboardController.t} — see this file's
   *  header for why it arrives as a dependency rather than this hook calling `useAdminLocale()`
   *  itself. */
  t: Translate;
}

/**
 * @param deps `port`/`locale`/`t` — see {@link DashboardDependencies}.
 * @returns The dashboard screen's full controller — see {@link DashboardController}.
 * @complexity Time/space: O(1) per call — five independent, concurrent round trips on mount.
 */
export function useDashboard({ port, locale, t }: DashboardDependencies): DashboardController {
  const [posts, setPosts] = useState<StatState>(PENDING);
  const [published, setPublished] = useState<number | null>(null);
  const [pages, setPages] = useState<StatState>(PENDING);
  const [drafts, setDrafts] = useState<number | null>(null);
  const [media, setMedia] = useState<StatState>(PENDING);
  const [comments, setComments] = useState<StatState>(PENDING);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [recent, setRecent] = useState<AdminPost[] | null>(null);
  // `null` until the status fetch settles (or forever, if it fails — swallowed below since the
  // banner is advisory) — `shouldShowDefaultPasswordBanner` treats `null` as "don't show", the same
  // fail-closed default a security nag should have.
  const [passwordStatus, setPasswordStatus] = useState<{ usesDefaultPassword: boolean; principalId: string } | null>(null);
  // Lazy initializer: read once, at mount, not on every render.
  const [dismissedBy, setDismissedBy] = useState<string | null>(readDefaultPasswordBannerDismissedBy);
  // `undefined` until the site-key status fetch settles (or forever, if it fails — swallowed below,
  // same as `passwordStatus` above). `shouldShowSiteKeyBanner` treats `undefined` as "don't show".
  const [siteKeyState, setSiteKeyState] = useState<AdminSiteTokenState | undefined>(undefined);

  // Deliberately `[]`, not `[port, locale]` — preserved from the pre-port version, which had no
  // dependency to list either. A caller changing `port`/`locale` after mount does not re-fetch;
  // unchanged behavior, not a new gap introduced by this conversion.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately `[]`, preserved from the pre-port version; port/locale changes after mount don't re-fetch.
  useEffect(() => {
    // Posts and pages each feed both a stat card and the merged activity list, so their handlers
    // do double duty rather than fetching the same list twice.
    port
      .listPosts()
      .then((r) => {
        const rows = r.posts.map((entry) => entry.post);
        setPosts({ value: rows.length, error: null });
        setPublished(rows.filter((p) => p.status === "published").length);
        setRecent((prev) => mergeRecent(prev, rows));
      })
      .catch((e) => setPosts({ value: null, error: describeApiError(e, translate(locale, "failed to load posts")) }));

    port
      .listPages()
      .then((r) => {
        const rows = r.posts.map((entry) => entry.post);
        setPages({ value: rows.length, error: null });
        setDrafts(rows.filter((p) => p.status === "draft").length);
        setRecent((prev) => mergeRecent(prev, rows));
      })
      .catch((e) => setPages({ value: null, error: describeApiError(e, translate(locale, "failed to load pages")) }));

    port
      .listMedia()
      .then((r) => setMedia({ value: r.media.filter((m) => m.status === "active").length, error: null }))
      .catch((e) => setMedia({ value: null, error: describeApiError(e, translate(locale, "failed to load media")) }));

    port
      .listCommentsQueue({ status: "pending" })
      .then((r) => setComments({ value: r.items.length, error: null }))
      .catch((e) => setComments({ value: null, error: describeApiError(e, translate(locale, "failed to load comments")) }));

    port
      .getPresentation()
      .then((r) => setThemeId(r.settings.activeThemeId))
      .catch((e) => setThemeError(describeApiError(e, translate(locale, "failed to load the active theme"))));

    // No `.catch()` sets an error state here — a failed status read means no banner (see this
    // file's `passwordStatus` declaration), not a card showing an em-dash. It's advisory, not
    // a stat the operator came to this screen to see.
    port.getPasswordStatus().then(setPasswordStatus).catch(() => {});

    // Site-key plan §A.6 — same advisory, swallowed-on-failure shape as the password status read
    // just above: a failed fetch means no banner, not an error card.
    port
      .getSiteTokenState()
      .then((result) => setSiteKeyState(result.state))
      .catch(() => {});
  }, []);

  return {
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

    showDefaultPasswordBanner: shouldShowDefaultPasswordBanner(
      passwordStatus?.usesDefaultPassword ?? null,
      passwordStatus !== null && dismissedBy === passwordStatus.principalId,
    ),
    dismissDefaultPasswordBanner: () => {
      if (passwordStatus === null) return;
      writeDefaultPasswordBannerDismissedBy(passwordStatus.principalId);
      setDismissedBy(passwordStatus.principalId);
    },

    showSiteKeyBanner: shouldShowSiteKeyBanner(siteKeyState),
    siteKeyBannerMessage: siteKeyBannerCopy(siteKeyState, t),
  };
}

/**
 * Binds the real `/api` client, the real `useWiredAdminLocale()`, and a `DASHBOARD_DICT`-bound
 * translator — see `dashboard-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Dashboard.tsx` composes this and a test composes {@link useDashboard} with
 * `createFakeDashboardPort`.
 *
 * @returns The dashboard screen's full controller — see {@link DashboardController}.
 */
export function useWiredDashboard(): DashboardController {
  const locale = useWiredAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return useDashboard({ port: defaultDashboardPort, locale, t });
}
