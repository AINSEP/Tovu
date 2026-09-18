/**
 * @file Find-in-page: Cmd+F search over whatever the sites home window is currently showing — the
 * Projects screen itself, or an open project tab's embedded `<webview>`.
 *
 * **Two different targets, two different mechanisms — see `use-find-in-page.hooks.ts`'s own header
 * for the full reasoning.** A project tab's `<webview>` exposes `findInPage`/`stopFindInPage` and a
 * `found-in-page` event directly on the DOM element (Electron's `WebviewTag` API), so THAT target
 * needs no IPC at all. The window's OWN top-level page (shown when no project tab is on screen) has
 * no such element to call methods on from the renderer — `webContents` is main-process-only — so
 * {@link FIND_IN_PAGE_CHANNELS} and {@link FIND_RESULT_CHANNEL} exist only to reach THAT one surface.
 *
 * {@link FIND_TOGGLE_CHANNEL} is the one channel every target needs: the app menu's Find (Cmd+F) is
 * the only key binding that still fires while focus is inside a project tab's `<webview>` guest
 * (same gap `contracts/project.ts`'s `SITE_HISTORY_CHANNEL` documents for Back/Forward), so opening
 * the bar has to go through main. Everything after that — typing, Enter, Shift+Enter, Escape — is
 * an ordinary keydown on the bar's own input, which lives in this document.
 */

/** push (main → renderer): the app menu's Find (Cmd+F) fired. Opens the find bar, or refocuses it
 *  if already open. Carries no payload. Inlined in `find-menu.ts`, which tests that the two match. */
export const FIND_TOGGLE_CHANNEL = 'runner:find:toggle';

/** invoke (renderer → main): run/re-run a search, or stop one, against the SITES HOME WINDOW'S OWN
 *  top-level `webContents` — used only when no project tab's `<webview>` is the visible surface.
 *  Real handlers in `find-in-page-ipc.ts`. */
export const FIND_IN_PAGE_CHANNELS = {
  find: 'runner:find:query',
  stop: 'runner:find:stop',
} as const;

/** push (main → renderer): one `found-in-page` result, relayed from the window's own `webContents`
 *  — the top-level counterpart of a `<webview>`'s own `found-in-page` DOM event. */
export const FIND_RESULT_CHANNEL = 'runner:find:result';

/**
 * One `findInPage` request. Mirrors the subset of Electron's own `FindInPageOptions` this app
 * uses — `matchCase` is left at its default (case-insensitive), matching Chrome's own Cmd+F.
 *
 * `findNext` keeps Electron's own (counterintuitive) meaning: `true` begins a NEW search session —
 * the right value for a fresh query — and `false` is a follow-up within the current session — the
 * right value for stepping to the next/previous match. See `use-find-in-page.hooks.ts`'s `runFind`.
 */
export interface FindInPageQuery {
  text: string;
  forward: boolean;
  findNext: boolean;
}

/** One `found-in-page` result: `activeMatchOrdinal` is 1-based, `matches` is the total count (0
 *  when nothing matched). Mirrors the two fields of Electron's own `Result` this app reads. */
export interface FindInPageResult {
  activeMatchOrdinal: number;
  matches: number;
}
