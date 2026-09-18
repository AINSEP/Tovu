/**
 * Zoom in/out/reset: Cmd+Plus/Cmd+-/Cmd+0, routed to whichever surface the sites home window is
 * currently showing — the Projects screen itself, or an open project tab's embedded `<webview>`.
 *
 * **Same two-target split `contracts/find-in-page.ts` documents, one fewer moving part.** A project
 * tab's `<webview>` exposes `getZoomLevel`/`setZoomLevel` directly on the DOM element (Electron's
 * `WebviewTag` API), so that target needs no IPC. The window's OWN top-level page has no such
 * element from the renderer's side — `webFrame` is the renderer-process API for a frame's OWN zoom,
 * so unlike `findInPage` (which only `webContents`, main-process-only, can run against the top
 * page), the top target here is reachable straight from the preload with no round trip to main at
 * all. {@link ZOOM_COMMAND_CHANNEL} is the one channel this feature needs — the menu accelerator
 * pushing a direction to whichever renderer has focus.
 *
 * A menu accelerator, not a `keydown` listener, for the same reason `find-menu.ts` is one: it is the
 * one key binding that still fires while focus is inside a project tab's `<webview>` guest.
 */

/** push (main → renderer): the app menu's Zoom In / Zoom Out / Actual Size fired. */
export const ZOOM_COMMAND_CHANNEL = 'runner:zoom:command';

/** Which way one zoom command moves. `'reset'` returns to 100% (zoom level 0) outright rather than
 *  stepping toward it. */
export type ZoomDirection = 'in' | 'out' | 'reset';
