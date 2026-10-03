/**
 * @file The sites-home window's Zoom controls, spliced into `site-history-menu.ts`'s View menu:
 * Actual Size (Cmd+0), Zoom In (Cmd+Plus), Zoom Out (Cmd+-).
 *
 * Custom items, not Electron's built-in `role: 'zoomIn'/'zoomOut'/'resetZoom'` — those operate on
 * `focusedWindow.webContents`, which is the sites home window's own TOP-level page. While a project
 * tab is the visible surface, that is the wrong target: the same routing problem `find-menu.ts`
 * solved for Cmd+F. `use-zoom.hooks.ts` decides which surface each command actually reaches.
 *
 * A hidden `CmdOrCtrl+=` duplicate rides along with Zoom In, mirroring Electron's own default menu:
 * `Plus` requires Shift on most keyboards, and `=` is the unshifted key beneath it.
 *
 * The channel literal is inlined rather than imported from `contracts/zoom.ts`, for the reason
 * `runner-ipc-stubs.ts` gives. `zoom-menu.test.ts` fails if it drifts from the contract.
 *
 * No `electron` import, so it can be tested under plain `node --test`.
 */
// Renderer routing/keyboard rationale: Jini/packages/desktop-host/src/electron/usability/zoom-menu.ts.
import { zoomMenuItems as buildZoomMenuItems, sendZoomCommand as sendCommand } from "@jini-ai/desktop-host/electron/usability";
import type { ZoomDirection } from "./contracts/zoom.ts";
/** Mirrors the renderer contract; keep the main-only adapter out of preload imports. */
export const ZOOM_COMMAND_CHANNEL = "runner:zoom:command";
export type ZoomCommandDirection = ZoomDirection;
export interface ZoomCommandWindow {
  isDestroyed(): boolean;
  webContents?: { send(channel: string, direction: ZoomDirection): void };
}
export interface ZoomMenuItem {
  label: string;
  accelerator: string;
  visible?: boolean;
  click: (item: unknown, window: ZoomCommandWindow | undefined) => void;
}
/** Translate the native window's send signature. @complexity O(1). */
function windowPort({ window }: { window: ZoomCommandWindow | undefined }) {
  if (!window) return undefined;
  const contents = window.webContents;
  return {
    isDestroyed: () => window.isDestroyed(),
    ...(contents ? { webContents: { send: ({ channel, direction }: { channel: string; direction: ZoomDirection }) => contents.send(channel, direction) } } : {}),
  };
}
/** Send a Tovu zoom direction to the focused window. @complexity O(1). */
export function sendZoomCommand({ window, direction }: { window: ZoomCommandWindow | undefined; direction: ZoomDirection }): boolean {
  return sendCommand({ window: windowPort({ window }), direction, channel: ZOOM_COMMAND_CHANNEL });
}
/** Keep native menu callbacks and Tovu wording. @complexity O(1). */
export function zoomMenuItems(_requiredArgs: Record<string, never>): ZoomMenuItem[] {
  return buildZoomMenuItems({ channel: ZOOM_COMMAND_CHANNEL, labels: { reset: "Actual Size", in: "Zoom In", out: "Zoom Out" } })
    .map((item) => ({ ...item, click: (_item, window) => item.click({ window: windowPort({ window }) }) }));
}
