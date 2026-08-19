import { useCallback } from "react";

import { setPlaygroundRenderTarget } from "../../../lib/playground-render-target-bus";

/**
 * @file `Playground`'s own half of the render-target-bus handshake — extracted out of
 * `Playground.tsx` so the component stays props-and-JSX only, the same split
 * `hooks/use-routed-a2ui-surface-card.hooks.ts` (`components/AssistantDock/`) uses for the reading
 * side of this same bus. See that file's own doc for the paradigm this follows.
 *
 * ## Why no `*Port`/`*Dependencies` pair
 *
 * `setPlaygroundRenderTarget` is `lib/playground-render-target-bus.ts`'s own already-a-plain-module
 * write, and that module ships its own direct test seam (`getPlaygroundRenderTarget`/
 * `resetPlaygroundRenderTargetBus`) — this hook's own test drives it directly, no mock needed.
 * Nothing here reaches an HTTP client, a subscription, or any dependency this hook doesn't already
 * own outright, so per this workspace's ratified rule ("a hook doing NO I/O gets NO port"), wrapping
 * this call in a manufactured port would add a seam with nothing real on the other side of it.
 */

/** What `usePlaygroundCanvas` hands back to `Playground.tsx`. */
export interface PlaygroundCanvasController {
  /** Ref callback for the canvas `<div>` — registers it as the active render target on attach,
   *  clears it on detach. Pass directly as the element's `ref`. */
  registerCanvas: (node: HTMLDivElement | null) => void;
}

/**
 * Registers (and unregisters) `Playground`'s own canvas container as the active
 * render-target-bus target, so `RoutedA2uiSurfaceCard.tsx` knows where to portal a drawn surface
 * while this page is mounted.
 *
 * @returns {@link PlaygroundCanvasController}. `registerCanvas` is a stable ref callback: React
 *   invokes it with the real node on attach and with `null` on detach, which is exactly
 *   register/unregister with no extra render needed — a plain ref callback rather than a
 *   `useEffect` + ref for that reason.
 * @complexity Time/space: O(1) per call; unregistration fans out to the bus's subscriber count (see
 *   `setPlaygroundRenderTarget`'s own doc).
 * @example
 * const { registerCanvas } = usePlaygroundCanvas();
 * <div ref={registerCanvas} />
 */
export function usePlaygroundCanvas(): PlaygroundCanvasController {
  const registerCanvas = useCallback((node: HTMLDivElement | null) => {
    setPlaygroundRenderTarget(node);
  }, []);

  return { registerCanvas };
}
