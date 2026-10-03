// Jini source: /Users/la/Programming/Jini/packages/desktop-host/src/electron/navigation-policy/window-navigation-policy.ts
/** Bind native Electron contents to Jini while keeping the desktop shell's host callbacks. */
import {
  installAppWindowNavigationPolicy as installAppPolicy,
  installGuestWindowOpenPolicy as installGuestPolicy,
  installRendererNavigationPolicy,
  isSameOrigin as compareOrigins,
  isExternalBrowserUrl as admitExternalUrl,
  isShellPageUrl as admitShellPage,
} from "@jini-ai/desktop-host/electron/navigation-policy";
import type { WindowOpenResponse } from "@jini-ai/desktop-host/electron/navigation-policy";

interface NavigableContents {
  setWindowOpenHandler(handler: (details: { url: string }) => WindowOpenResponse): void;
  on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): unknown;
  on(event: "will-redirect", listener: (details: { preventDefault(): void; url: string; isMainFrame: boolean }) => void): unknown;
}
interface AppWindowPolicyOptions {
  appOrigin: string;
  openExternal: (url: string) => void;
}
interface GuestWindowOpenOptions {
  isSupervisedGuestUrl: (url: string) => boolean;
  openExternal: (url: string) => void;
}
interface ShellPages {
  isSupervisedSite: (url: string) => boolean;
  attachUrl?: string;
  rendererFileUrl: string;
}

/** Preserve positional host callers; opaque/malformed origins fail closed. @complexity O(n) URL lengths. */
function isSameOrigin(candidate: string, reference: string): boolean {
  return compareOrigins({ candidate, reference });
}

/** Translate the host's external-link predicate. @complexity O(n) URL length. */
function isExternalBrowserUrl(raw: string): boolean {
  return admitExternalUrl({ raw });
}

/** Bind the initial site origin and Electron browser handoff. @complexity O(1) registration. */
function installAppWindowNavigationPolicy(contents: NavigableContents, options: AppWindowPolicyOptions): void {
  installAppPolicy({
    contents,
    appOrigin: options.appOrigin,
    openExternal: ({ url }) => options.openExternal(url),
  });
}

/** Bind the sites-home file to Jini's renderer boundary. @complexity O(1) registration. */
function installSitesHomeNavigationPolicy(
  contents: NavigableContents,
  options: { rendererFileUrl: string; openExternal: (url: string) => void },
): void {
  installRendererNavigationPolicy({
    contents,
    rendererFileUrl: options.rendererFileUrl,
    openExternal: ({ url }) => options.openExternal(url),
  });
}

/** Adapt the guest's popup-only Electron surface; every popup stays denied. @complexity O(1). */
function installGuestWindowOpenPolicy(contents: Pick<NavigableContents, "setWindowOpenHandler">, options: GuestWindowOpenOptions): void {
  installGuestPolicy({
    contents,
    isSupervisedGuestUrl: ({ url }) => options.isSupervisedGuestUrl(url),
    openExternal: ({ url }) => options.openExternal(url),
  });
}

/** Adapt Tovu's supervised-site predicate and optional attach-mode origin. @complexity O(n) URL length. */
function isShellPageUrl(raw: string, pages: ShellPages): boolean {
  return admitShellPage({
    raw,
    pages: {
      isSupervisedSite: ({ url }) => pages.isSupervisedSite(url),
      rendererFileUrl: pages.rendererFileUrl,
    },
  }, { attachUrl: pages.attachUrl });
}

export { isSameOrigin, isExternalBrowserUrl, installAppWindowNavigationPolicy, installGuestWindowOpenPolicy, installSitesHomeNavigationPolicy, isShellPageUrl };
export type { NavigableContents, AppWindowPolicyOptions, GuestWindowOpenOptions, WindowOpenResponse, ShellPages };
