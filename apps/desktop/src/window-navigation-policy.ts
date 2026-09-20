/**
 * @file The popup and navigation boundary for every `createWindow` window (`main.ts`), and the one
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

/** The slice of Electron's `WebContents` this policy registers on. */
interface NavigableContents {
  setWindowOpenHandler(handler: (details: WindowOpenDetails) => WindowOpenResponse): void;
  on(event: "will-navigate", listener: (event: NavigationEvent, url: string) => void): unknown;
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
 * Register the popup handler and the `will-navigate` listener on a `createWindow` window.
 *
 * Same origin as `appOrigin`: allowed in the app — the admin opening its own routes, the site's own
 * pages. Anything else: kept out of the window, and handed to the OS browser only when it is an
 * http(s) URL (a "view site ↗" link); any other scheme is dropped.
 *
 * Navigation is checked against `appOrigin`, the origin the window was CREATED for, not against
 * wherever it currently is — so there is no second origin a navigation could be judged relative to.
 *
 * @param contents the window's `webContents`, or a stand-in with the same two methods.
 * @param options see {@link AppWindowPolicyOptions}.
 * @complexity O(1) to register; each callback is O(n) in the URL's length.
 */
function installAppWindowNavigationPolicy(contents: NavigableContents, options: AppWindowPolicyOptions): void {
  const handOff = (url: string) => {
    if (isExternalBrowserUrl(url)) options.openExternal(url);
  };

  contents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, options.appOrigin)) return { action: "allow" };
    handOff(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (isSameOrigin(url, options.appOrigin)) return;
    event.preventDefault();
    handOff(url);
  });
}

export { isSameOrigin, isExternalBrowserUrl, installAppWindowNavigationPolicy };
export type { NavigableContents, AppWindowPolicyOptions, WindowOpenResponse };
