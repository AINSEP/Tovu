/**
 * @file The sites home window's Zoom adapter: binds `@jini-ai/ui/zoom`'s `useZoom` (routing Cmd+Plus /
 * Cmd+- / Cmd+0 to the visible project tab's `<webview>` or the window's own page, and remembering
 * each project's zoom) to this app's preload bridge and its own `localStorage` key prefix. The
 * routing and persistence rules, and why they are shaped that way, live with that hook.
 */
import { useZoom as useWindowZoom, type UseZoom, type ZoomStorage } from '@jini-ai/ui/zoom';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';

/** Per-project zoom levels persist under `tovu:zoom:<projectId>`, the key existing installs hold. */
const ZOOM_KEY_PREFIX = 'tovu:zoom:';

/**
 * @param input.activeGuestId the visible project tab's id, or `null` when the Projects screen itself is on
 *   screen (`App`'s `showSiteTab ? visibleWorkspaceId : null` — identical argument to `useFindInPage`'s).
 * @param options.bridge the bridge port; defaults to the preload's `window.tovuRunner`.
 * @param options.storage where per-site zoom levels persist; defaults to the shell's own `localStorage`,
 *   resolved lazily.
 */
export function useZoom(
  { activeGuestId }: { activeGuestId: string | null },
  { bridge = runnerInventoryBridge(), storage }: { bridge?: RunnerInventoryBridge; storage?: ZoomStorage } = {},
): UseZoom {
  return useWindowZoom({ activeGuestId, bridge, keyPrefix: ZOOM_KEY_PREFIX }, storage ? { storage } : {});
}
