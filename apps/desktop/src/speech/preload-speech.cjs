/**
 * @file The renderer-facing half of the speech feature: exposes `window.tovuVoice` via
 * `contextBridge` so the admin web app (loaded by `createWindow` in `main.cjs`, running with
 * `contextIsolation: true, sandbox: true, nodeIntegration: false`) can reach the two IPC handlers
 * `speech-ipc.cjs` registers, without gaining any other Node/Electron access.
 *
 * `window.tovuVoice` existing at all is also the renderer's own capability signal: the composer
 * slot on the Tovu-admin side (`apps/admin/src/features/voice-input/`) checks for its presence to
 * decide whether it is even running inside this desktop shell. Its absence does not hide the mic
 * affordance — the button still renders in a plain browser tab, disabled, saying that voice input
 * needs the desktop app because transcription runs on-device (see
 * `apps/admin/src/features/voice-input/voice-unavailability.ts`).
 *
 * Wired into `main.cjs` as every window's `webPreferences.preload` — see `speech-ipc.cjs`'s own
 * header and `main.cjs`'s `SPEECH_PRELOAD_PATH` doc.
 *
 * **`window.tovuFiles` (SPEC-053) is this file's second, unrelated bridge — same file for the same
 * structural reason `tovuVoice` lives here in the first place: Electron grants exactly ONE `preload`
 * per window, and `SPEECH_PRELOAD_PATH` is already the one every admin surface (standalone window
 * AND the sites-home `<webview>` guest, see `webview-guest-policy.ts`) receives.** Before this, the
 * admin's own chat (`AssistantDock`) had no way to recover a dropped folder's real OS path at all —
 * unlike the sites-home shell's own separate "Runner chat" (`apps/desktop/src/renderer/App.tsx`),
 * which gets `preload.mts`'s full `tovuRunner` bridge (including `getPathForFile`) because it runs in
 * the sites-home window itself, not this guest. Exposing ONLY `getPathForFile` here — not the rest of
 * `tovuRunner` — keeps the admin's sandboxed surface exactly as narrow as `tovuVoice` already is: one
 * synchronous, side-effect-free call, no IPC channel, no filesystem read (`webUtils.getPathForFile`
 * reads a `File` handle's own OS path, already-Chromium-known metadata — it does not open or stat
 * anything). `window.tovuFiles` existing is the renderer's own capability signal here too, the same
 * shape `voice-input-port.ts` uses for `tovuVoice`: `apps/admin/src/features/fs-files/folder-drop-port.ts`
 * checks for its presence before attempting to recover a folder path, and does nothing (falls through
 * to the ordinary attachment-upload path) when it is absent — a plain browser tab, not this shell.
 *
 * **The two channel names below are INLINED, not `require("./speech-ipc.cjs")`'d, on purpose.**
 * `createWindow`'s `webPreferences` already sets `sandbox: true` (see above), and Electron's
 * sandboxed preload context gives `require` a restricted polyfill that resolves only `"electron"`,
 * `"events"`, `"timers"` and `"url"` — a relative specifier like `"./speech-ipc.cjs"` is not
 * resolvable there and would throw the moment this preload is actually wired up, a bug otherwise
 * invisible until then since nothing calls it yet. `preload-speech.test.cjs` guards these two
 * literals against drifting from `speech-ipc.cjs`'s own exports, which stay the source of truth.
 * `webUtils`, by contrast, needs no such guard — it is not a channel name, just another named export
 * of the same already-required `"electron"` module `contextBridge`/`ipcRenderer` come from below, so
 * adding it costs no new `require()` call (`preload-speech.test.ts` asserts exactly one).
 *
 * The bridged calls themselves are NOT unit-tested: they only work inside Electron's real preload
 * context (`contextBridge`/`ipcRenderer` do not exist under plain Node — `require("electron")` there
 * resolves to a path string, not the API). Verified by code review only — two `ipcRenderer.invoke`
 * calls forwarding straight to the channels `speech-ipc.cjs` already tests end-to-end, plus the one
 * synchronous `webUtils.getPathForFile` passthrough `tovuFiles` adds. The file's one branch — which
 * pages get `tovuFiles` — IS tested, by running this source in a `vm` with a stubbed `electron`
 * (`preload-speech.test.ts`).
 */

const { contextBridge, ipcRenderer, webUtils } = require("electron");

/** Mirrors `speech-ipc.cjs`'s own `IPC_CHANNEL_IS_AVAILABLE` — see this file's header for why this
 *  is a literal instead of an import. */
const IPC_CHANNEL_IS_AVAILABLE = "tovu:speech:isAvailable";
/** Mirrors `speech-ipc.cjs`'s own `IPC_CHANNEL_TRANSCRIBE` — see this file's header for why this is
 *  a literal instead of an import. */
const IPC_CHANNEL_TRANSCRIBE = "tovu:speech:transcribe";

contextBridge.exposeInMainWorld("tovuVoice", {
  /** @returns {Promise<import("./transcription-port.ts").TranscriptionAvailability>} */
  isAvailable: () => ipcRenderer.invoke(IPC_CHANNEL_IS_AVAILABLE),
  /**
   * @param {Float32Array|number[]} samples - Mono PCM samples in `[-1, 1]`.
   * @param {number} sampleRate - In Hz, whatever the capturing `AudioContext` actually opened at.
   * @returns {Promise<import("./transcription-port.ts").TranscriptionResult>}
   */
  transcribe: (samples, sampleRate) => ipcRenderer.invoke(IPC_CHANNEL_TRANSCRIBE, samples, sampleRate),
});

/**
 * See this file's header ("`window.tovuFiles` (SPEC-053)") for why this bridge lives here rather than
 * in `preload.mts`. `getPathForFile` is Electron's own synchronous, in-process lookup — no IPC round
 * trip, because `webUtils` only exists in the preload's Node-capable context, not the isolated page it
 * bridges into (same rationale as `preload.mts`'s own copy of this call, which this mirrors byte-for-
 * byte for `apps/desktop/src/renderer/folder-drop.ts`'s admin-side counterpart,
 * `apps/admin/src/features/fs-files/folder-drop.ts`, to call).
 */
/**
 * The admin surface only: `/admin` and everything under `/admin/`. This preload also runs on the
 * site's same-origin PUBLIC pages — `createWindow`'s popup handler allows any same-origin URL,
 * in-window navigation stays in the app, and a `<webview>` guest is confined only to its origin — so
 * without this check a theme's own scripts on `/` would receive absolute OS paths too. Read once, at
 * preload time: moving between the admin SPA and the public site is a full navigation, which re-runs
 * this file.
 *
 * Defense in depth, not an origin boundary. Script on the public site shares the admin's origin and
 * its session cookie, so it can already call admin APIs, or `window.open("/admin/")` and reach into
 * that window. What this removes is handing the path lookup to every page script that receives a File.
 */
const ADMIN_PATH_PREFIX = "/admin";
const pathname = window.location.pathname;
if (pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)) {
  contextBridge.exposeInMainWorld("tovuFiles", {
    /** @param {File} file @returns {string} the file's absolute OS path, or `''` if unresolvable. */
    getPathForFile: (file) => webUtils.getPathForFile(file),
  });
}
