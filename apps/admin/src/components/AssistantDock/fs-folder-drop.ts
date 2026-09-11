/**
 * @file The second surface for the `apps/desktop`-only folder-drop pattern already shipped for the
 * fleet chat (`apps/desktop/src/renderer/folder-drop.ts` + `App.tsx`'s `RunnerChatPane.onDropCapture`).
 * Extends it to this admin chat surface, which is embedded either as a standalone Electron
 * `BrowserWindow` (`main.cjs`'s `createWindow`) or as the fleet window's own `<webview>` guest
 * (`openFleetWindow`) — both get the SAME preload, `apps/desktop/src/speech/preload-speech.cjs`,
 * which now exposes `window.tovuFs.getPathForFile` alongside its existing `window.tovuVoice` (see
 * that file's own header). A plain browser tab gets neither: no absolute path is obtainable there
 * at all, which is a browser rule, not a gap this module works around — `getFsFolderDropPort`
 * returns `null` in that case, and `FsFolderIndicator.hooks.ts` leaves drops alone entirely when it
 * does, exactly the "typed/pasted path stays the browser path" contract this feature was scoped to.
 *
 * `folderPathsFromDataTransfer` below is ported, not imported, from
 * `apps/desktop/src/renderer/folder-drop.ts` — `apps/admin` and `apps/desktop` are separate app
 * packages with separate builds (Vite for admin, its own `tsc`+Vite for desktop) and no shared
 * package boundary between them today, so a cross-package import would reach across a build
 * boundary this repo doesn't otherwise cross. The function has zero repo-internal imports in its
 * source location for exactly this kind of reuse (see its own header there), so porting it keeps
 * the well-tested item/file index-alignment logic instead of re-deriving it (behavior-identical;
 * see this function's own doc below for the one structural difference and why). Keep the two
 * copies in sync if that logic ever changes.
 */

/** The bridge `preload-speech.cjs` exposes via `contextBridge.exposeInMainWorld("tovuFs", ...)`. */
export interface FsFolderDropPort {
  getPathForFile(file: File): string;
}

declare global {
  interface Window {
    /** Present only inside the Electron desktop shell (standalone window or fleet `<webview>`
     *  guest) — see this file's own header. */
    tovuFs?: FsFolderDropPort;
  }
}

/**
 * Resolves the folder-drop port for the current runtime — same shape and same
 * inject-for-testability rationale as `apps/admin/src/features/voice-input/voice-input-port.ts`'s
 * `getVoiceInputPort`.
 *
 * @param targetWindow - Injected so a test can simulate either runtime without touching the real
 *   `window` global. A real caller omits it.
 * @returns The real port when running inside the desktop shell, `null` in a plain browser tab.
 * @complexity Time/space: O(1).
 */
export function getFsFolderDropPort(targetWindow: Window | undefined): FsFolderDropPort | null {
  if (targetWindow !== undefined) return targetWindow?.tovuFs ?? null;
  return typeof window === "undefined" ? null : (window.tovuFs ?? null);
}

/**
 * Recovers the absolute OS path of every FOLDER in a raw drop.
 *
 * Behavior-identical to `apps/desktop/src/renderer/folder-drop.ts` — that file's own header
 * explains the two load-bearing subtleties this depends on: reading `dataTransfer.items`/`.files`
 * BEFORE `@jini-ai/chat`'s own bubble-phase drop handling expands a dropped folder into synthesized
 * per-leaf `File` objects (which lose the folder's own path), and why `.items`/`.files` need a
 * separately-tracked file-kind index rather than one shared loop index. Structured slightly
 * differently from that file (the per-item directory/path resolution split into
 * {@link directoryPathForItem}) only because this admin app's ESLint `complexity` ceiling (9) is
 * stricter than desktop's — the desktop original is one flat loop body at complexity 10 there,
 * unchanged since neither app enforces the other's config. Keep both in sync on any real logic
 * change.
 *
 * @complexity Time: O(n) in the number of dragged items; space: O(n).
 */
export function folderPathsFromDataTransfer(
  dataTransfer: DataTransfer,
  getPathForFile: (file: File) => string,
): string[] {
  const items = Array.from(dataTransfer.items ?? []);
  const files = Array.from(dataTransfer.files ?? []);
  const paths: string[] = [];
  let fileIndex = 0;
  for (const item of items) {
    if (item.kind !== "file") continue;
    const index = fileIndex;
    fileIndex += 1;
    const path = directoryPathForItem(item, files[index], getPathForFile);
    if (path !== null) paths.push(path);
  }
  return paths;
}

/**
 * Resolves one file-kind drag item to its real OS path, or `null` when it isn't a directory or
 * Electron can't resolve a path for it (`getPathForFile` returning `""`). Split out of
 * {@link folderPathsFromDataTransfer} purely to keep that function's own complexity under this
 * app's ESLint ceiling — same checks, same order, same result as the inlined version.
 *
 * @complexity Time/space: O(1).
 */
function directoryPathForItem(
  item: DataTransferItem,
  file: File | undefined,
  getPathForFile: (file: File) => string,
): string | null {
  const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.();
  if (entry?.isDirectory !== true) return null;
  if (file === undefined) return null;
  const path = getPathForFile(file);
  return path === "" ? null : path;
}
