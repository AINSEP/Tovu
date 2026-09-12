/**
 * Types Electron's `<webview>` as a JSX intrinsic element, and widens the DOM type React points
 * its `ref` at so `did-fail-load`/`did-finish-load` listeners come back properly typed.
 *
 * A project tab embeds that site's own `tovu serve` output in a `<webview>` rather than an
 * `<iframe>`, so the guest runs in its own process instead of the one holding the privileged
 * `window.tovuRunner` bridge. The tag is enabled by `webviewTag` in `main.js`'s `openSitesHomeWindow`,
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
 * Reloading is a `key` change (remounting the guest) rather than a `.reload()` call, which is why
 * no element-side API appears here.
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
 * `WebviewDidFailLoadEvent` below is declared locally rather than imported as Electron's own
 * `DidFailLoadEvent`: `renderer-no-electron` in `.dependency-cruiser.cjs` forbids importing the
 * `electron` package from anywhere under `src/renderer`, TYPE-ONLY imports included — that config
 * runs with `tsPreCompilationDeps: true` specifically so an `import type` does not slip past it.
 * The renderer has no `electron` module; this interface carries only the two fields the hook
 * actually reads, which is narrower than reaching for the real type but costs nothing it needed.
 */
import type { HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: HTMLAttributes<HTMLElement> & {
        src?: string;
        /** Names the guest's session partition. Set to the project's own `partition`
         *  (`contracts/project.ts`) so the guest's cookie jar is the one main already
         *  authenticated — see `ProjectWorkspace`'s own doc in `App.tsx`. */
        partition?: string;
      };
    }
  }
}

declare global {
  interface WebviewDidFailLoadEvent extends Event {
    readonly isMainFrame: boolean;
    readonly errorCode: number;
  }

  interface HTMLWebViewElement {
    // Only the two events `useWebviewLoadFailure` listens for. Electron's `WebviewTag` types
    // every event this tag can fire; widening just these keeps the merge legible against what
    // actually calls it, rather than declaring a whole surface nothing here uses.
    addEventListener(
      event: 'did-fail-load',
      listener: (event: WebviewDidFailLoadEvent) => void,
      useCapture?: boolean,
    ): void;
    addEventListener(event: 'did-finish-load', listener: (event: Event) => void, useCapture?: boolean): void;
    removeEventListener(event: 'did-fail-load', listener: (event: WebviewDidFailLoadEvent) => void): void;
    removeEventListener(event: 'did-finish-load', listener: (event: Event) => void): void;
  }
}
