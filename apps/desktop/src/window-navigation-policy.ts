/**
 * @file The popup and navigation boundary for every `createWindow` window and the sites home window
 * (`main.ts`), and the one
 * origin primitive both it and `registerGuestNavigationPolicy`'s `<webview>` guest policy use.
 *
 * **What it is defending.** A `createWindow` window runs the speech preload (`preload-speech.cts`),
 * and Electron gives a window it opens the same `webPreferences`, preload included. So anything this
 * window loads or opens in-app gets `window.tovuVoice` and, under `/admin`, `window.tovuFiles` —
 * which turns a dropped `File` into its absolute OS path. Only the app's own origin may have that.
 *
 * **Why a parsed origin and not a string prefix.** This used to be `target.startsWith(origin)`, and
 * `http://127.0.0.1:4567@evil.example/admin` starts with `http://127.0.0.1:4567` while its host is
 * `evil.example` (the prefix is userinfo). `http://127.0.0.1:45670/` passed the same way. Only
 * `new URL(...).origin` on BOTH sides, compared whole, answers "same origin".
 *
 * **Why only http(s) reaches the OS.** `shell.openExternal` hands a URL to whichever app claims its
 * scheme — `file:`, `smb:` and custom app schemes included — so a page choosing the URL chooses
 * what the OS launches. A web link is the only thing this window has any reason to hand off.
 *
 * Every function here is total: a malformed URL is "not same origin" and "not external", never a
 * throw, because a throw inside an Electron navigation callback is not a denial.
 *
 * No `electron` import, so this is testable under plain `node --test` — same convention as
 * `webview-guest-policy.ts`.
 */

/** What Electron passes a `setWindowOpenHandler` callback; only `url` is read. */
interface WindowOpenDetails {
  url: string;
}

/** The two answers this policy gives a popup request. Electron's own handler return type accepts both. */
type WindowOpenResponse = { action: "allow" } | { action: "deny" };

/** The part of a `will-navigate` event this policy uses. */
interface NavigationEvent {
  preventDefault(): void;
}

/** The part of a `will-redirect` event this policy uses — Electron's own `details` object. */
interface RedirectEvent extends NavigationEvent {
  url: string;
  isMainFrame: boolean;
}

/** The slice of Electron's `WebContents` this policy registers on. */
interface NavigableContents {
  setWindowOpenHandler(handler: (details: WindowOpenDetails) => WindowOpenResponse): void;
  on(event: "will-navigate", listener: (event: NavigationEvent, url: string) => void): unknown;
  on(event: "will-redirect", listener: (details: RedirectEvent) => void): unknown;
}

/** {@link installAppWindowNavigationPolicy}'s options. */
interface AppWindowPolicyOptions {
  /** The origin the window was created for — `new URL(loadedUrl).origin`. */
  appOrigin: string;
  /** Hands a URL to the OS browser — `shell.openExternal` in `main.ts`. Only ever given http(s). */
  openExternal: (url: string) => void;
}

/**
 * `raw`'s serialized origin, or `null` when it has none a comparison can trust: unparseable, or
 * opaque (`file:`, `data:`, `javascript:` all serialize as the string `"null"`, and two opaque
 * origins are never the same origin even though the strings match).
 * @complexity O(n) in the URL's length.
 */
function parseOrigin(raw: string): string | null {
  let origin;
  try {
    origin = new URL(raw).origin;
  } catch {
    return null;
  }
  return origin === "null" ? null : origin;
}

/**
 * Whether `candidate` and `reference` are the same origin (scheme, host and port). Fails closed:
 * false when either side is unparseable or opaque.
 * @complexity O(n) in the two URLs' lengths.
 */
function isSameOrigin(candidate: string, reference: string): boolean {
  const origin = parseOrigin(candidate);
  return origin !== null && origin === parseOrigin(reference);
}

/**
 * Whether `raw` may be handed to the OS browser: a parseable `http:` or `https:` URL, nothing else.
 * @complexity O(n) in the URL's length.
 */
function isExternalBrowserUrl(raw: string): boolean {
  let protocol;
  try {
    protocol = new URL(raw).protocol;
  } catch {
    return false;
  }
  return protocol === "http:" || protocol === "https:";
}

/**
 * Register the popup handler and the `will-navigate` and `will-redirect` listeners on a
 * `createWindow` window.
 *
 * Same origin as `appOrigin`: allowed in the app — the admin opening its own routes, the site's own
 * pages. Anything else: kept out of the window, and handed to the OS browser only when it is an
 * http(s) URL (a "view site ↗" link); any other scheme is dropped.
 *
 * Navigation is checked against `appOrigin`, the origin the window was CREATED for, not against
 * wherever it currently is — so there is no second origin a navigation could be judged relative to.
 * `will-redirect` is the half `will-navigate` misses: a server-side 30x never fires `will-navigate`,
 * and a site's own redirect rules may name another origin. Only a MAIN-frame redirect is checked —
 * a subframe never runs the preload, and an embed redirecting across origins is not this window's
 * boundary.
 *
 * @param contents the window's `webContents`, or a stand-in with the same two methods.
 * @param options see {@link AppWindowPolicyOptions}.
 * @complexity O(1) to register; each callback is O(n) in the URL's length.
 */
function installAppWindowNavigationPolicy(contents: NavigableContents, options: AppWindowPolicyOptions): void {
  installNavigationBoundary(contents, (url) => isSameOrigin(url, options.appOrigin), options.openExternal);
}

/**
 * The same boundary for the sites home window (`openSitesHomeWindow` in `main.ts`), whose only
 * in-app page is the renderer's own `index.html`. That window runs `sandbox: false` with the
 * `tovuRunner` bridge, and its `script-src 'self'` CSP covers only the page it is declared on — a
 * link dropped onto the window, or any other top-level navigation, would otherwise swap in a remote
 * (or any local) page that inherits the same preload and none of the CSP. `file:` origins are opaque,
 * so the renderer is matched as a whole url, the way {@link isShellPageUrl} does.
 *
 * @complexity O(1) to register; each callback is O(n) in the URL's length.
 */
function installSitesHomeNavigationPolicy(
  contents: NavigableContents,
  options: { rendererFileUrl: string; openExternal: (url: string) => void },
): void {
  const renderer = withoutQueryOrHash(options.rendererFileUrl);
  installNavigationBoundary(contents, (url) => renderer !== null && withoutQueryOrHash(url) === renderer, options.openExternal);
}

/**
 * Registers the popup handler and the `will-navigate`/`will-redirect` listeners, keeping everything
 * `isInApp` refuses out of the window and handing only http(s) urls to the OS browser.
 * @complexity O(1) to register.
 */
function installNavigationBoundary(contents: NavigableContents, isInApp: (url: string) => boolean, openExternal: (url: string) => void): void {
  const handOff = (url: string) => {
    if (isExternalBrowserUrl(url)) openExternal(url);
  };

  contents.setWindowOpenHandler(({ url }) => {
    if (isInApp(url)) return { action: "allow" };
    handOff(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (isInApp(url)) return;
    event.preventDefault();
    handOff(url);
  });

  contents.on("will-redirect", (details) => {
    if (!details.isMainFrame || isInApp(details.url)) return;
    details.preventDefault();
    handOff(details.url);
  });
}

/** The pages this shell itself serves — {@link isShellPageUrl}'s second argument. */
interface ShellPages {
  /** Whether a url is a site this launch supervises — `main.ts`'s `isSupervisedGuestUrl`. */
  isSupervisedSite: (url: string) => boolean;
  /** Attach mode's one url (`TOVU_DESKTOP_URL`); absent or empty in every other mode. */
  attachUrl?: string;
  /** The sites home renderer's `index.html`, as a `file:` url. */
  rendererFileUrl: string;
}

/**
 * `raw` without its query and fragment, or `null` when it does not parse.
 * @complexity O(n) in the URL's length.
 */
function withoutQueryOrHash(raw: string): string | null {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

/**
 * Whether `raw` is a page this shell serves: a supervised site, attach mode's origin (compared as a
 * parsed origin, like everything else here), or the sites home renderer's own file (compared whole,
 * host and path, since `file:` origins are opaque). The sender check for IPC that should only answer
 * this app's own pages. Never throws.
 * @complexity O(n) in the URL's length, beyond `isSupervisedSite`'s own cost.
 */
function isShellPageUrl(raw: string, pages: ShellPages): boolean {
  if (pages.isSupervisedSite(raw)) return true;
  if (pages.attachUrl && isSameOrigin(raw, pages.attachUrl)) return true;
  const page = withoutQueryOrHash(raw);
  return page !== null && page === withoutQueryOrHash(pages.rendererFileUrl);
}

export { isSameOrigin, isExternalBrowserUrl, installAppWindowNavigationPolicy, installSitesHomeNavigationPolicy, isShellPageUrl };
export type { NavigableContents, AppWindowPolicyOptions, WindowOpenResponse, ShellPages };
