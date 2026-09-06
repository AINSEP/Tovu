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
 * **Not wired into `main.cjs` yet** — see `speech-ipc.cjs`'s own header for why, and this
 * feature's handoff notes for the exact `webPreferences.preload` line `createWindow` needs.
 *
 * Deliberately NOT unit-tested: this file only runs inside Electron's preload context (`contextBridge`/
 * `ipcRenderer` do not exist under plain Node), so a `node --test` run cannot exercise it at all.
 * Verified by code review only — its whole body is two `ipcRenderer.invoke` calls with no branching
 * of its own, forwarding straight to the channels `speech-ipc.cjs` already tests end-to-end.
 */

const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE } = require("./speech-ipc.cjs");

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
