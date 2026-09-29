/**
 * @file Keeps a repeating status probe off the network while the page is hidden.
 *
 * `@jini-ai/chat/react`'s `useChatPaneRuntimeInventory` calls the dock's `daemonOnline` every 5s on
 * a bare `setInterval` for as long as the dock is mounted, hidden or not. Each call is a
 * `GET /api/agents` that the site server proxies to the agent daemon — work in two processes, every
 * five seconds, for a window nobody is looking at. This wrapper answers a hidden page's call with
 * the last known result instead; the first call after the page is shown again probes for real.
 */

/** Whether the page is hidden right now; `false` where there is no `document` (SSR, tests). */
function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Wrap `probe` so that, while `isHidden()` is true and a previous probe has answered, the call
 * returns that answer without probing. A rejected probe clears the remembered answer, so a hidden
 * page never keeps reporting a result the last real probe no longer supports.
 *
 * @returns the gated probe.
 * @complexity O(1) per call, plus the probe itself when it runs.
 */
export function skipProbeWhileHidden<T>(probe: () => Promise<T>, isHidden: () => boolean = documentHidden): () => Promise<T> {
  let known: { value: T } | null = null;
  return async () => {
    if (known !== null && isHidden()) return known.value;
    try {
      const value = await probe();
      known = { value };
      return value;
    } catch (error) {
      known = null;
      throw error;
    }
  };
}
