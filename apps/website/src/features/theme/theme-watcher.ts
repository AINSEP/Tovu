import { watch } from "node:fs";

import { requestThemePreviewRefresh } from "./preview-refresh.js";
import { syncThemeRoster } from "./theme-roster-sync.js";
import type { DiscoveredTheme } from "./theme.js";

/** Theme-directory I/O seam; tests deliver filesystem events without opening an OS watcher. */
export interface ThemeWatchPort {
  open(input: {
    themesDir: string;
    onChange: (filename: string | null) => void;
    onError: (error: unknown) => void;
  }, options?: Record<string, never>): { close(): void };
}

const nativeThemeWatch: ThemeWatchPort = {
  open({ themesDir, onChange, onError }) {
    const watcher = watch(themesDir, { recursive: true, persistent: false }, (_event, filename) => onChange(filename));
    watcher.on("error", onError);
    return watcher;
  },
};

// Only the website serving runtime starts this service. Recomposition/site switches replace its
// active site's watcher; exporter apps and the separate agent daemon never own another one.
let stopActiveWatcher: (() => void) | undefined;

/** Ignore metadata, dependency trees and editor scratch files, including nested path components. */
function ignoredThemeWatchPath(filename: string | null): boolean {
  if (filename === null) return false; // Node can report a change without its filename: rescan safely.
  return filename.split(/[\\/]/).some((part) =>
    part.startsWith(".") || part === "node_modules" || part.startsWith("#") ||
    /(?:~|\.(?:sw[a-z]|tmp|temp|bak)|___jb_(?:tmp|old)___)$/i.test(part)
  );
}

/**
 * Watches the serving site's themes, settles a burst, then refreshes discovery before notifying the
 * existing admin SSE feed via its durable marker. Dotfile filtering prevents that marker looping.
 * Replaces the previous watcher synchronously; stop cancels queued work and closes exactly once.
 * I/O failures are reported, never thrown from an event callback; a later edit retries a failed scan.
 * @complexity O(path length) per event; one discovery pass per settled burst (see syncThemeRoster).
 * @example const watcher = startThemeWatcher({ themes, themesDir }); await watcher.stop();
 */
export function startThemeWatcher(
  required: { themes: DiscoveredTheme[]; themesDir: string },
  {
    watchPort = nativeThemeWatch,
    settleMs = 400,
    onError = ({ error }) => console.error("[theme-watcher] theme refresh failed", error),
  }: {
    watchPort?: ThemeWatchPort;
    settleMs?: number;
    onError?: (input: { error: unknown }) => void;
  } = {},
): { stop(): Promise<void> } {
  stopActiveWatcher?.();
  let closed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let watcher: { close(): void } | undefined;

  /** A stale handle must never close a replacement site's watcher. */
  const stop = (): void => {
    if (closed) return;
    closed = true;
    clearTimeout(pending);
    watcher?.close();
    if (stopActiveWatcher === stop) stopActiveWatcher = undefined;
  };
  stopActiveWatcher = stop;

  /** Refresh loaded source maps as well as roster membership; nested edits evade the fingerprint. */
  // No `closed` check here: `pending` is this refresh's only scheduler, and every path that sets
  // `closed` (stop(), reached from replacement, watch errors and open failures) clears `pending`
  // synchronously first, so a refresh never runs after close.
  const refresh = (): void => {
    pending = undefined;
    try {
      syncThemeRoster(required, { force: true });
      requestThemePreviewRefresh({ themesDir: required.themesDir });
    } catch (error) { onError({ error }); }
  };

  try {
    watcher = watchPort.open({
      themesDir: required.themesDir,
      onChange: (filename) => {
        if (closed || ignoredThemeWatchPath(filename)) return;
        clearTimeout(pending);
        pending = setTimeout(refresh, settleMs);
        pending.unref();
      },
      onError: (error) => { stop(); onError({ error }); },
    });
  } catch (error) { stop(); onError({ error }); }
  return { stop: async () => stop() };
}
