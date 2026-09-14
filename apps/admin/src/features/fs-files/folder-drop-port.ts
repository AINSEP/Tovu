/**
 * @file The renderer-side half of the desktop folder-drop bridge (SPEC-053). `window.tovuFiles` is
 * injected by `apps/desktop/src/speech/preload-speech.cts` via `contextBridge` — it exists ONLY when
 * this admin app is running inside the Electron desktop shell (standalone window or the sites-home
 * `<webview>` guest AssistantDock actually renders in), never in a plain browser tab. Mirrors
 * `voice-input-port.ts`'s own shape byte-for-byte: presence of the global IS the capability gate.
 *
 * A `null` port means "recover no folder path" — `use-folder-drop.hooks.ts` then leaves a folder drop
 * alone entirely, so it falls through to `ChatPane`'s own attachment-upload handling, exactly as any
 * other drop already does in a plain browser (see `feature.spec.md` EC-05: this feature does not, and
 * cannot, fix browser-only admin).
 */

/** The bridge `preload-speech.cts` exposes via `contextBridge.exposeInMainWorld("tovuFiles", ...)`. */
export interface FolderDropPort {
  /** Electron's synchronous `webUtils.getPathForFile`, passed straight through. Returns `''` for a
   *  `File` it cannot resolve an OS path for (e.g. one synthesized from a `FileSystemEntry` rather
   *  than handed directly off `dataTransfer.files` — see `folder-drop.ts`'s header). */
  getPathForFile(file: File): string;
}

declare global {
  interface Window {
    /** Present only inside the Electron desktop shell — see this file's own header. */
    tovuFiles?: FolderDropPort;
  }
}

/**
 * Resolves the folder-drop port for the current runtime.
 *
 * @param targetWindow - Injected so a test can simulate either runtime without touching the real
 *   `window` global. A real caller omits it — same convention as `getVoiceInputPort`.
 * @returns The real port when running inside the desktop shell, `null` in a plain browser tab.
 * @complexity Time/space: O(1).
 */
export function getFolderDropPort(targetWindow: Window | undefined): FolderDropPort | null {
  if (targetWindow !== undefined) return targetWindow?.tovuFiles ?? null;
  return typeof window === "undefined" ? null : (window.tovuFiles ?? null);
}
