/**
 * @file The admin's half of the desktop Import hand-off (owner, 2026-11-10). `window.tovuImport` is
 * exposed by `apps/desktop/src/speech/preload-speech.cts` on admin pages only, beside `tovuFiles`: it
 * exists ONLY inside the desktop app, never in a plain browser tab or a hosted install. Its presence
 * IS the capability gate, the same shape as `folder-drop-port.ts` and `voice-input-port.ts`.
 *
 * Inside the desktop app this admin can't make a new site, so "From a live website" asks the app to
 * open its own Import tab, which makes the site, with the address typed in.
 */

/** What `preload-speech.cts` exposes. `opened: false` when the app has no sites home window open. */
export interface ImportHandoffPort {
  open: (input: { address?: string }) => Promise<{ opened: boolean }>;
}

declare global {
  interface Window {
    /** Present only inside the desktop app — see this file's own header. */
    tovuImport?: ImportHandoffPort;
  }
}

/**
 * The hand-off port for the current runtime.
 * @param targetWindow - Injected by tests; a real caller passes `undefined` (same convention as `getFolderDropPort`).
 * @returns The desktop's bridge, or `null` outside the desktop app.
 * @complexity O(1).
 */
export function getImportHandoffPort(targetWindow: Window | undefined): ImportHandoffPort | null {
  if (targetWindow !== undefined) return targetWindow.tovuImport ?? null;
  return typeof window === "undefined" ? null : (window.tovuImport ?? null);
}
