import { useSyncExternalStore } from "react";
import { DEFAULT_ADMIN_BASE, adminHref as adminHrefCore, currentRoutePath as currentRoutePathCore } from "@jini-ai/admin/core";
import { installInternalLinkInterceptor, navigate, subscribeToRoute } from "@jini-ai/admin/browser";

/**
 * @file Path-based routing for the admin SPA — `/admin/settings`, not `/admin/#/section/settings`.
 *
 * **This file is now a thin adapter over `@jini-ai/admin`.** The route model
 * (`adminHref`/`currentRoutePath`) lives in `@jini-ai/admin/core` and the `window`-bound half
 * (`navigate`, the link interceptor, route subscription) in `@jini-ai/admin/browser`. What stays
 * here is only what is genuinely Tovu-specific: the legacy `#/section/...` URL migration, and the
 * React hook. The full rationale for every rule below now lives in those modules' headers — this
 * file keeps the export surface its ~14 call sites already use so none of them had to change.
 *
 * Why paths at all: the hash was never load-bearing. Both places that serve this app already fall
 * back to `index.html` for any `/admin/*` depth — `src/server/middleware/admin-static.ts` does it
 * explicitly (SEA and static-build branches), and Vite dev does it by default under
 * `base: "/admin/"`. So a real URL survives a refresh, and the hash was only costing us shareable
 * links.
 *
 * ## The base is fixed at `/admin`
 *
 * Not configurable here, and deliberately so — it is already hard-coded in `vite.config.ts`
 * (`base: "/admin/"`) and in the server's route patterns. Changing it means changing all three.
 * `@jini-ai/admin` takes a base parameter so another product can mount elsewhere; Tovu does not
 * use that, and `ADMIN_BASE` below stays the one place this app names it.
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

export const ADMIN_BASE = DEFAULT_ADMIN_BASE;

/** `/settings` → `/admin/settings`; `/` → `/admin/`. */
export function adminHref(routePath: string): string {
  return adminHrefCore(routePath, ADMIN_BASE);
}

/**
 * The current route path, base stripped. Always starts with `/`.
 *
 * Keeps the `window.location.pathname` default this app's call sites rely on. The package
 * deliberately requires the argument — that default is what made the original untestable without
 * a DOM — so the default is reapplied here, at the edge that already assumes a browser.
 */
export function currentRoutePath(pathname: string = window.location.pathname): string {
  return currentRoutePathCore(pathname, ADMIN_BASE);
}

export { installInternalLinkInterceptor, navigate };

/**
 * Translates a legacy hash URL to its path equivalent, in place, and reports whether it did.
 *
 * Stays in Tovu rather than moving to `@jini-ai/admin`: it migrates URLs from *this app's* former
 * hash router, and no other product has that history to carry.
 *
 * Bookmarks, anything the assistant wrote down, and muscle memory all still point at
 * `#/section/settings`. Without this they would land on the dashboard — the parser's fallback for
 * an unrecognized route — which looks like the link rotted rather than moved.
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
   */
  if (currentRoutePath() !== "/") return false;
  const [rawPath, rawQuery] = hash.replace(/^#\/?/, "").split("?");
  /*
   * `section/` was an artifact of the hash router's own dispatch, never meaningful in a URL — but it
   * is only safe to strip when what remains is a single segment, which is the only shape the
   * parser's bare-section branch accepts.
   *
   * The case that forced the guard: `#/section/settings/foo` used to render Settings, because the old
   * parser matched on `section` + `settings` and ignored the trailing segment. Stripping
   * unconditionally turned it into `/admin/settings/foo`, which is multi-segment and falls through to
   * the dashboard — a silent behaviour change for a stored URL. Keeping the prefix in that case hands
   * it to the legacy `section/:id` branch, which still ignores extra segments as before.
   *
   * Known and accepted divergence: the segment count is taken on the RAW path, so an encoded slash
   * slips past it — `#/section/settings%2Ffoo` counts as one segment and gets stripped to
   * `/admin/settings%2Ffoo`, which resolves to the dashboard, where the old parser produced the
   * unknown-section placeholder. Decoding first would need a `try`/`catch` for malformed escapes, and
   * both outcomes are equally "you did not get a real screen" for a URL nobody has.
   */
  const path = rawPath ?? "";
  const stripped = path.replace(/^section\//, "");
  const canStrip = stripped.split("/").filter(Boolean).length === 1;
  const query = rawQuery ? `?${rawQuery}` : "";
  window.history.replaceState(null, "", `${adminHref(`/${canStrip ? stripped : path}`)}${query}`);
  return true;
}

/**
 * The address bar as an external store.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the URL is genuinely external state,
 * and reading it during render is what keeps the first paint from briefly showing the wrong route.
 * The snapshot is a string so React's identity check works without memoization — returning an
 * object here would re-render on every subscriber notification.
 *
 * Stays here rather than in `@jini-ai/admin/browser` because it imports React; it belongs in that
 * package's `/react` layer once that exists.
 */
export function useRouteLocation(): string {
  return useSyncExternalStore(
    subscribeToRoute,
    () => `${currentRoutePath()}${window.location.search}`,
    () => "/",
  );
}
