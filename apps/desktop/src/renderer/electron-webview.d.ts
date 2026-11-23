/**
 * Types Electron's `<webview>` as a JSX intrinsic element, and widens the DOM type React points
 * its `ref` at so `did-fail-load`/`did-finish-load` listeners come back properly typed.
 *
 * A project tab embeds that site's own `tovu serve` output in a `<webview>` rather than an
 * `<iframe>`, so the guest runs in its own process instead of the one holding the privileged
 * `window.tovuRunner` bridge. The tag is enabled by `webviewTag` in `main.ts`'s `openSitesHomeWindow`,
 * which also pins the guest's `webPreferences` from `will-attach-webview` — nothing the renderer
 * writes here can widen them.
 *
 * The JSX augmentation right below is INERT as of `@types/react` 19, and left in place only as
 * the landing spot for the day that changes: React now ships its OWN `webview` entry
 * (`WebViewHTMLAttributes`) in the JSX namespace its jsx-runtime resolves, and that is the
 * declaration `App.tsx` actually typechecks against. This augmentation lands somewhere nothing
 * reads and merges with nothing — measured, not assumed: deleting this file changes no
 * `npm run typecheck` result for the JSX props. So an attribute added here does NOT take effect,
 * which is why `App.tsx` has to cast past React's entry to set `allowpopups`.
 *
 * This file must stay a module (hence the import) — a `declare module 'react'` in a global script
 * would REPLACE React's types rather than extend them, which typechecks the whole renderer against
 * an empty React.
 *
 * The element methods merged in below (via Jini's `WebviewTagMethods`) are the ones `use-site-workspace.hooks.ts` calls: history
 * (`canGoBack`/`goBack`/…), `reload()`, which keeps that history where a `key` remount would not,
 * and `loadURL()`. `findInPage`/`stopFindInPage`/`found-in-page` are the ones
 * `use-find-in-page.hooks.ts` calls — Electron's `WebviewTag` exposes these directly on the DOM
 * element itself, so a project tab's find target needs no IPC at all; see that file's own header.
 * `getZoomLevel`/`setZoomLevel` are `use-zoom.hooks.ts`'s, same reasoning, same tag.
 *
 * The `HTMLWebViewElement` merge further down is a DIFFERENT kind of augmentation, and it is NOT
 * inert. React's own `webview` entry types `ref` against `HTMLWebViewElement`
 * (`@types/react/global.d.ts`), and that interface ships empty — `extends HTMLElement {}`, nothing
 * else — so `webviewRef.current?.addEventListener('did-fail-load', …)` would otherwise resolve to
 * `EventTarget`'s generic overload and hand back a bare `Event` with no `isMainFrame` or
 * `errorCode` to read. Declaration-merging typed overloads onto that SAME global interface is what
 * makes a `ref`-typed listener see the real event shape without a cast — see
 * `useWebviewLoadFailure` in `App.hooks.ts`, the one caller that needs it.
 *
 * `WebviewDidFailLoadEvent` below is built from Jini's structural `@jini-ai/desktop-host/electron/webview`
 * types rather than imported as Electron's own `DidFailLoadEvent`: `renderer-no-electron` in
 * `.dependency-cruiser.cjs` forbids importing the `electron` package from anywhere under
 * `src/renderer`, TYPE-ONLY imports included — that config runs with `tsPreCompilationDeps: true`
 * specifically so an `import type` does not slip past it. Jini's types are DOM-free, so the
 * `Event`/`HTMLElement` combination, the globals and the JSX registration stay here.
 */
import type { HTMLAttributes } from 'react';
import type {
  WebviewDidFailLoadDetail,
  WebviewDidNavigateDetail,
  WebviewDidNavigateInPageDetail,
  WebviewFoundInPageDetail,
  WebviewFoundInPageResult as JiniWebviewFoundInPageResult,
  WebviewTagMethods,
} from '@jini-ai/desktop-host/electron/webview';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: HTMLAttributes<HTMLElement> & {
        src?: string;
        /** Names the guest's session partition. Set to the project's own `partition`
         *  (`contracts/project.ts`) so the guest's cookie jar is the one main already
         *  authenticated — see `SiteWorkspace`'s own doc in `App.tsx`. */
        partition?: string;
      };
    }
  }
}

declare global {
  interface WebviewDidFailLoadEvent extends Event, WebviewDidFailLoadDetail {}

  interface WebviewDidNavigateEvent extends Event, WebviewDidNavigateDetail {}

  interface WebviewDidNavigateInPageEvent extends Event, WebviewDidNavigateInPageDetail {}

  /** Narrowed to the two fields `use-find-in-page.hooks.ts` reads off Electron's own `Result`. */
  interface WebviewFoundInPageResult extends JiniWebviewFoundInPageResult {}

  interface WebviewFoundInPageEvent extends Event, WebviewFoundInPageDetail {}

  // The element methods (history, reload, find, zoom, executeJavaScript) come from Jini's
  // `WebviewTagMethods`; the event-listener overloads stay here because they merge with
  // `HTMLElement`'s own `addEventListener`, which a DOM-free package cannot see.
  interface HTMLWebViewElement extends WebviewTagMethods {
    // Only what `useWebviewLoadFailure` and `use-site-workspace.hooks.ts` use. Electron's
    // `WebviewTag` types every event and method this tag has; widening just these keeps the merge
    // legible against what actually calls it, rather than declaring a whole surface nothing here uses.
    addEventListener(
      event: 'did-fail-load',
      listener: (event: WebviewDidFailLoadEvent) => void,
      useCapture?: boolean,
    ): void;
    addEventListener(event: 'did-finish-load', listener: (event: Event) => void, useCapture?: boolean): void;
    addEventListener(
      event: 'did-navigate',
      listener: (event: WebviewDidNavigateEvent) => void,
      useCapture?: boolean,
    ): void;
    addEventListener(
      event: 'did-navigate-in-page',
      listener: (event: WebviewDidNavigateInPageEvent) => void,
      useCapture?: boolean,
    ): void;
    removeEventListener(event: 'did-fail-load', listener: (event: WebviewDidFailLoadEvent) => void): void;
    removeEventListener(event: 'did-finish-load', listener: (event: Event) => void): void;
    removeEventListener(event: 'did-navigate', listener: (event: WebviewDidNavigateEvent) => void): void;
    removeEventListener(event: 'did-navigate-in-page', listener: (event: WebviewDidNavigateInPageEvent) => void): void;
    addEventListener(event: 'found-in-page', listener: (event: WebviewFoundInPageEvent) => void, useCapture?: boolean): void;
    removeEventListener(event: 'found-in-page', listener: (event: WebviewFoundInPageEvent) => void): void;
    /** Fires once the guest is usable. Until it has, every `WebviewTagMethods` method throws — which is why
     *  `use-zoom.hooks.ts`'s `applyStoredZoom` waits on it before re-applying a remembered zoom. */
    addEventListener(event: 'dom-ready', listener: (event: Event) => void, useCapture?: boolean): void;
    removeEventListener(event: 'dom-ready', listener: (event: Event) => void): void;
  }
}
