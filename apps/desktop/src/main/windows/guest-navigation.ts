/**
 * @file The navigation boundary for an embedded project's `<webview>` guest, extracted from
 * `main.ts`'s `registerGuestNavigationPolicy` so every decision — which contents it applies to,
 * which navigations stay, which are refused, and which are handed to the OS browser — is verified
 * without Electron. `main.ts` keeps only the `app.on("web-contents-created", ...)` line that hands
 * each new contents to {@link installWebviewGuestPolicy}.
 */
import { installGuestWindowOpenPolicy, isSameOrigin, type NavigableContents } from "../../window-navigation-policy.ts";

/** The slice of a `WebContents` the guest policy touches. */
type GuestContents = NavigableContents & {
  getType(): string;
  getURL(): string;
};

/**
 * Answers navigation/window-open requests an embedded project's `<webview>` guest makes — the same
 * two-part boundary Tovu-Runner's own `registerGuestNavigationPolicy` enforces
 * (`Tovu-Runner/src/main/main.ts`): a same-origin navigation (the site steering itself — a login
 * redirect, an admin route that round-trips the server) is left alone, since the tab IS that
 * project's admin and has to keep working; anything that would leave the guest's own origin is
 * denied INSIDE the guest and, when it targets a site this launch actually supervises OR is an
 * ordinary `isExternalBrowserUrl` (a `window.open` sign-in link, say — see
 * `installGuestWindowOpenPolicy`), handed to the operator's own default browser instead.
 * `allowpopups` on the tag (`App.tsx`) is the other half — without it Electron's guest-view manager
 * never lets a `target="_blank"` request reach this process at all, so the popup handler below would
 * never fire.
 *
 * Registered once, globally, from the sites-home boot branch: `web-contents-created` fires for every
 * guest ANY window's `<webview>` ever attaches, and `contents.getType() !== "webview"` filters out
 * everything else (the sites home window's own top-level content included).
 *
 * @param contents the newly created contents, of any type.
 * @param isSupervisedGuestUrl whether a URL is one of this launch's supervised sites, read per call.
 * @param openExternal hands a URL to the operator's own browser.
 * @complexity O(1) per event, beyond `isSupervisedGuestUrl`'s own cost.
 */
function installWebviewGuestPolicy(
  { contents, isSupervisedGuestUrl, openExternal }: {
    contents: GuestContents; isSupervisedGuestUrl: (url: string) => boolean; openExternal: (url: string) => void;
  },
  _optional = {},
): void {
  if (contents.getType() !== "webview") return;

  const openExternally = (url: string) => {
    if (isSupervisedGuestUrl(url)) openExternal(url);
  };

  installGuestWindowOpenPolicy(contents, { isSupervisedGuestUrl, openExternal });

  contents.on("will-navigate", (event, url) => {
    if (isSameOrigin(url, contents.getURL())) return;
    event.preventDefault();
    openExternally(url);
  });

  // A server-side 30x never fires `will-navigate`, and a site's redirect rules may name another
  // origin. Judged against the supervised sites rather than `getURL()`, which a redirect during
  // the guest's FIRST load has nothing committed to compare against. Main frame only: a subframe
  // never runs the preload. Nothing is handed to the OS browser: `openExternally` only ever opens
  // a supervised url, and a supervised url is allowed here.
  contents.on("will-redirect", (details) => {
    if (!details.isMainFrame || isSupervisedGuestUrl(details.url)) return;
    details.preventDefault();
  });
}

export { installWebviewGuestPolicy };
export type { GuestContents };
