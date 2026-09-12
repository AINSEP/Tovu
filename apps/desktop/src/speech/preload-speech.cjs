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
 * **The two channel names below are INLINED, not `require("./speech-ipc.cjs")`'d, on purpose.**
 * `createWindow`'s `webPreferences` already sets `sandbox: true` (see above), and Electron's
 * sandboxed preload context gives `require` a restricted polyfill that resolves only `"electron"`,
 * `"events"`, `"timers"` and `"url"` — a relative specifier like `"./speech-ipc.cjs"` is not
 * resolvable there and would throw the moment this preload is actually wired up, a bug otherwise
 * invisible until then since nothing calls it yet. `preload-speech.test.cjs` guards these two
 * literals against drifting from `speech-ipc.cjs`'s own exports, which stay the source of truth.
 *
 * Deliberately NOT unit-tested beyond that guard: this file's `contextBridge.exposeInMainWorld` call
 * only runs inside Electron's real preload context (`contextBridge`/`ipcRenderer` do not exist under
 * plain Node — `require("electron")` there resolves to a path string, not the API), so a
 * `node --test` run cannot exercise the bridging itself. Verified by code review only — its whole
 * body beyond the two constants is two `ipcRenderer.invoke` calls with no branching of its own,
 * forwarding straight to the channels `speech-ipc.cjs` already tests end-to-end.
 */

const { contextBridge, ipcRenderer } = require("electron");

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
