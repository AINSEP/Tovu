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
 * Also exposes `window.tovuFs.getPathForFile` (2026-09-10), the SAME capability-gate shape as
 * `tovuVoice`: this file is the one preload every admin surface gets — both the standalone
 * site-admin window (`createWindow`) and the fleet window's embedded admin `<webview>` guest
 * (`openFleetWindow`'s `will-attach-webview` handler, `webview-guest-policy.cjs`) — since Electron
 * takes exactly one `preload` per window/guest (see `preload.mts`'s own header for the fleet
 * window's version of the same constraint). `apps/admin/src/components/AssistantDock/
 * fs-folder-drop.ts` checks for `window.tovuFs` the same way `voice-input-port.ts` checks for
 * `window.tovuVoice`, so `FsFolderIndicator` can resolve a dropped folder's real absolute path
 * inside this shell while staying a plain typed/pasted-path control in an ordinary browser tab,
 * where no absolute path is obtainable at all. Ported from `apps/desktop/src/renderer/preload.mts`'s
 * `getPathForFile` (the fleet window's own `tovuRunner.getPathForFile`): synchronous and
 * in-process, not an `ipcRenderer.invoke` round trip, because `webUtils` only exists in the
 * preload's Node-capable context — this function IS the bridge rather than a proxy for one.
 *
 * Wired into `main.cjs` as every window's `webPreferences.preload` — see `speech-ipc.cjs`'s own
 * header and `main.cjs`'s `SPEECH_PRELOAD_PATH` doc.
 *
 * **The two channel names below are INLINED, not `require("./speech-ipc.cjs")`'d, on purpose.**
 * `createWindow`'s `webPreferences` already sets `sandbox: true` (see above), and Electron's
 * sandboxed preload context gives `require` a restricted polyfill that resolves only `"electron"`,
 * `"events"`, `"timers"` and `"url"` — a relative specifier like `"./speech-ipc.cjs"` is not
 * resolvable there and would throw the moment this preload is actually wired up, a bug otherwise
 * invisible until then since nothing calls it yet. `preload-speech.test.cjs` guards these two
 * literals against drifting from `speech-ipc.cjs`'s own exports, which stay the source of truth.
 * `webUtils` needs no such guard — it is destructured straight off the same `require("electron")`
 * call, not a second `require`, so `preload-speech.test.cjs`'s "requires nothing but electron"
 * assertion already covers it.
 *
 * Deliberately NOT unit-tested beyond that guard: this file's `contextBridge.exposeInMainWorld` call
 * only runs inside Electron's real preload context (`contextBridge`/`ipcRenderer` do not exist under
 * plain Node — `require("electron")` there resolves to a path string, not the API), so a
 * `node --test` run cannot exercise the bridging itself. Verified by code review only — its whole
 * body beyond the two constants is two `ipcRenderer.invoke` calls plus one synchronous `webUtils`
 * call, none of which branch, forwarding straight to the channels `speech-ipc.cjs` already tests
 * end-to-end (or, for `getPathForFile`, straight to Electron's own `webUtils`).
 */

const { contextBridge, ipcRenderer, webUtils } = require("electron");

/** Mirrors `speech-ipc.cjs`'s own `IPC_CHANNEL_IS_AVAILABLE` — see this file's header for why this
 *  is a literal instead of an import. */
const IPC_CHANNEL_IS_AVAILABLE = "tovu:speech:isAvailable";
/** Mirrors `speech-ipc.cjs`'s own `IPC_CHANNEL_TRANSCRIBE` — see this file's header for why this is
 *  a literal instead of an import. */
const IPC_CHANNEL_TRANSCRIBE = "tovu:speech:transcribe";

contextBridge.exposeInMainWorld("tovuVoice", {
  /** @returns {Promise<import("./transcription-port.cjs").TranscriptionAvailability>} */
  isAvailable: () => ipcRenderer.invoke(IPC_CHANNEL_IS_AVAILABLE),
  /**
   * @param {Float32Array|number[]} samples - Mono PCM samples in `[-1, 1]`.
   * @param {number} sampleRate - In Hz, whatever the capturing `AudioContext` actually opened at.
   * @returns {Promise<import("./transcription-port.cjs").TranscriptionResult>}
   */
  transcribe: (samples, sampleRate) => ipcRenderer.invoke(IPC_CHANNEL_TRANSCRIBE, samples, sampleRate),
});

/**
 * PATH ONLY — see this file's header. `getPathForFile` resolves a `File` handed across the
 * `contextBridge` (Electron structured-clones `File` arguments specifically to make this possible)
 * to its real OS path; it does not open, stat, or read the file. `apps/admin/src/components/
 * AssistantDock/fs-folder-drop.ts`'s `folderPathsFromDataTransfer` is what decides which dropped
 * items are folders (via `webkitGetAsEntry().isDirectory`, metadata only) before ever calling this.
 */
contextBridge.exposeInMainWorld("tovuFs", {
  /** @param {File} file @returns {string} the absolute OS path, or `""` if Electron can't resolve one. */
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
