import { useSyncExternalStore } from "react";

/**
 * @file Path-based routing for the admin SPA — `/admin/settings`, not `/admin/#/section/settings`.
 *
 * Why paths at all: the hash was never load-bearing. Both places that serve this app already fall
 * back to `index.html` for any `/admin/*` depth — `src/server/middleware/admin-static.ts` does it
 * explicitly (SEA and static-build branches), and Vite dev does it by default under
 * `base: "/admin/"`. Verified live before this change: `/admin/settings` and `/admin/posts/abc`
 * both return the shell with HTTP 200. So a real URL survives a refresh, and the hash was only
 * costing us shareable links.
 *
 * ## The base is fixed at `/admin`
 *
 * Not configurable, and deliberately so — it is already hard-coded in `vite.config.ts`
 * (`base: "/admin/"`) and in the server's route patterns. Changing it means changing all three.
 * `ADMIN_BASE` exists so this file is the place you start from, not so it can be swapped at runtime.
 *
 * ## Route paths vs URLs
 *
 * The distinction this module exists to keep straight, because collapsing it is what produced
 * `/admin/#/section/settings` in the first place:
 *   - a **route path** is base-agnostic and is what `App.tsx`'s parser consumes: `/`, `/settings`,
 *     `/posts/abc`.
 *   - a **URL** is what goes in an `href` or the address bar: `/admin/`, `/admin/settings`.
 * `adminHref` converts the first into the second; `currentRoutePath` recovers the first from the
 * address bar. Nothing else should be doing string surgery on `location`.
 */

export const ADMIN_BASE = "/admin";

/** Fires on `navigate()`. `pushState` does not emit `popstate`, so subscribers need this too. */
const NAVIGATION_EVENT = "tovu:navigate";

/** `"/admin/settings/"` → `"/admin/settings"`; leaves a lone `"/"` alone. */
function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** `/settings` → `/admin/settings`; `/` → `/admin/`. */
export function adminHref(routePath: string): string {
  const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${ADMIN_BASE}${normalized}`;
}

/**
 * The current route path, base stripped. Always starts with `/`.
 *
 * A bare `/admin` (no trailing slash) and `/admin/` both mean the dashboard, so the base is
 * removed by prefix rather than by assuming a trailing separator.
 */
export function currentRoutePath(pathname: string = window.location.pathname): string {
  if (pathname === ADMIN_BASE) return "/";
  if (pathname.startsWith(`${ADMIN_BASE}/`)) return pathname.slice(ADMIN_BASE.length) || "/";
  // Reached only if this app is mounted somewhere unexpected; treat the whole path as the route
  // rather than silently returning the dashboard, so the mismatch is visible in the URL.
  return pathname || "/";
}

/**
 * Navigates without a page load.
 *
 * Takes a *route path*, not a URL — passing `/admin/settings` here would produce
 * `/admin/admin/settings`, which is exactly the class of mistake `adminHref` is meant to prevent.
 */
export function navigate(routePath: string, options: { readonly replace?: boolean } = {}): void {
  const url = adminHref(routePath);
  /*
   * Navigating to where you already are is a no-op, not a history entry. Without this, clicking the
   * already-active sidebar link five times pushes five identical entries and Back appears stuck on
   * the same screen — a regression against the hash router, where re-assigning an unchanged
   * `location.hash` created no entry at all.
   *
   * Both sides are run through `URL` before comparing, rather than string-matching `url` against
   * `location`. `pushState` stores a *normalized* URL, so a path containing anything the browser
   * percent-encodes (a space, any non-ASCII character) comes back out of `location.pathname` in a
   * different spelling than `adminHref` produced — `/admin/collections/my recipe` vs
   * `/admin/collections/my%20recipe`. Comparing raw strings there silently fails to match and pushes
   * the duplicate entry anyway, which is the exact bug this guard exists to prevent.
   *
   * The full path+query+fragment is compared, not just the path: a same-path/different-query
   * navigation is a real one.
   */
  const target = new URL(url, window.location.href);
  const isCurrent =
    // Trailing slash normalized away, because `parseRoute` splits on `/` and drops empty segments —
    // so `/admin/settings/` and `/admin/settings` are the same screen. Comparing raw pathnames means
    // loading `/admin/settings/` and then clicking the active Settings link pushes a second entry for
    // a screen that never changed, which is the duplicate-history bug in a different spelling.
    stripTrailingSlash(target.pathname) === stripTrailingSlash(window.location.pathname) &&
    target.search === window.location.search &&
    target.hash === window.location.hash;
  if (isCurrent) return;
  if (options.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

/**
 * Translates a legacy hash URL to its path equivalent, in place, and reports whether it did.
 *
 * Bookmarks, anything the assistant wrote down, and muscle memory all still point at
 * `#/section/settings`. Without this they would land on the dashboard — the old parser's fallback
 * for an unrecognized route — which looks like the link rotted rather than moved.
 *
 * `replaceState`, not `pushState`: the hash URL should not become a Back-button stop, or Back from
 * the redirected page would land on the hash URL and redirect forward again.
 */
export function redirectLegacyHashUrl(): boolean {
  const { hash } = window.location;
  if (!hash.startsWith("#/")) return false;
  /*
   * Only when the PATH carries no route of its own.
   *
   * A genuine legacy URL is always `/admin/#/section/seo`: the path is the bare base and the entire
   * route lives in the hash. If the path already names a route, then a `#/…` is an ordinary document
   * fragment that merely looks route-shaped, and rewriting on it throws the real route away —
   * `/admin/posts/abc#/section/seo` reloaded as `/admin/seo`, losing `/posts/abc` entirely.
   *
   * The hole predates the fragment-preservation change (this function never looked at the path), but
   * that change is what made it reachable by clicking a link rather than only by hand-typing a URL.
   */
  if (currentRoutePath() !== "/") return false;
  const [rawPath, rawQuery] = hash.replace(/^#\/?/, "").split("?");
  /*
   * `section/` was an artifact of the hash router's own dispatch, never meaningful in a URL — but it
   * is only safe to strip when what remains is a single segment, which is the only shape
   * `parseRoute`'s bare-section branch accepts.
   *
   * The case that forced the guard: `#/section/settings/foo` used to render Settings, because the old
   * parser matched on `section` + `settings` and ignored the trailing segment. Stripping
   * unconditionally turned it into `/admin/settings/foo`, which is multi-segment and falls through to
   * the dashboard — a silent behaviour change for a stored URL. Keeping the prefix in that case hands
   * it to `parseRoute`'s legacy `section/:id` branch, which still ignores extra segments as before.
   *
   * Known and accepted divergence: the segment count is taken on the RAW path, so an encoded slash
   * slips past it — `#/section/settings%2Ffoo` counts as one segment and gets stripped to
   * `/admin/settings%2Ffoo`, which resolves to the dashboard, where the old parser produced the
   * unknown-section placeholder. Decoding first would need a `try`/`catch` for malformed escapes, and
   * both outcomes are equally "you did not get a real screen" for a URL nobody has. Not worth the
   * added failure mode.
   */
  const path = rawPath ?? "";
  const stripped = path.replace(/^section\//, "");
  const canStrip = stripped.split("/").filter(Boolean).length === 1;
  const query = rawQuery ? `?${rawQuery}` : "";
  window.history.replaceState(null, "", `${adminHref(`/${canStrip ? stripped : path}`)}${query}`);
  return true;
}

/**
 * Turns clicks on internal `<a href="/admin/...">` links into SPA navigations.
 *
 * A document-level listener rather than a `<Link>` component: every one of these links is already
 * a plain anchor across ~20 section files, and they should stay plain anchors — they are real URLs
 * that middle-click, cmd-click and "copy link address" should all treat normally. Intercepting
 * only the plain-left-click case preserves every one of those behaviours for free, where a `<Link>`
 * component would have to re-implement them.
 *
 * @returns a teardown function.
 */
export function installInternalLinkInterceptor(): () => void {
  const onClick = (event: MouseEvent) => {
    // Anything but an unmodified primary click is the browser's to handle: cmd/ctrl-click opens a
    // tab, shift-click a window, alt-click downloads.
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    if (anchor.hasAttribute("download")) return;
    // An explicit target (`_blank`, a frame name) is an explicit request not to navigate in place.
    const target = anchor.getAttribute("target");
    if (target && target !== "_self") return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    // `anchor.href` is the resolved absolute form, which is what makes relative hrefs and
    // cross-origin links both fall out correctly.
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname !== ADMIN_BASE && !url.pathname.startsWith(`${ADMIN_BASE}/`)) return;

    event.preventDefault();
    // `url.hash` is carried through: an in-page fragment (`/admin/settings#seo-defaults`) is not a
    // routing concern, but dropping it silently loses the anchor. It never reaches the parser —
    // `useRouteLocation`'s snapshot is path + query only — so preserving it cannot affect routing.
    navigate(`${currentRoutePath(url.pathname)}${url.search}${url.hash}`);
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATION_EVENT, onChange);
  };
}

/**
 * The address bar as an external store.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the URL is genuinely external state,
 * and reading it during render is what keeps the first paint from briefly showing the wrong route.
 * The snapshot is a string so React's identity check works without memoization — returning an
 * object here would re-render on every subscriber notification.
 */
export function useRouteLocation(): string {
  return useSyncExternalStore(
    subscribe,
    () => `${currentRoutePath()}${window.location.search}`,
    () => "/",
  );
}
