/**
 * @file The renderer-facing half of the speech feature: exposes `window.tovuVoice` via
 * `contextBridge` so the admin web app (loaded by `createWindow` in `main.ts`, running with
 * `contextIsolation: true, sandbox: true, nodeIntegration: false`) can reach the two IPC handlers
 * `speech-ipc.ts` registers, without gaining any other Node/Electron access.
 *
 * `window.tovuVoice` existing at all is also the renderer's own capability signal: the composer
 * slot on the Tovu-admin side (`apps/admin/src/features/voice-input/`) checks for its presence to
 * decide whether it is even running inside this desktop shell. Its absence does not hide the mic
 * affordance — the button still renders in a plain browser tab, disabled, saying that voice input
 * needs the desktop app because transcription runs on-device (see
 * `apps/admin/src/features/voice-input/voice-unavailability.ts`).
 *
 * Wired into `main.ts` as every site window's `webPreferences.preload` — see `speech-ipc.ts`'s own
 * header and `main.ts`'s `SPEECH_PRELOAD_PATH` doc.
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
 * **Electron loads dist/speech/preload-speech.cjs, never this source.** Its sandbox neither
 * strips types nor accepts ESM (desktop TypeScript migration, probe P2). Keep the .cts source
 * checked by tsconfig.preload.json, then bundle it to CommonJS with only electron external.
 * A plain tsc emit now leaves the shared package require unresolved by the restricted sandbox.
 * Build before desktop launch and before packaging; a source edit cannot update a running preload.
 *
 * Electron's restricted require resolves only electron, events, timers and url; package or
 * relative requires fail immediately. Bundle Jini's bridge rather than loading the package at
 * runtime, and never import the main-process speech-ipc.ts/native-transcriber dependency tree.
 * preload-speech.test.ts checks the deployed bundle's sole electron require, admin-only file
 * capability, channel names and positional sample payloads in a recording VM. Real Electron
 * contextBridge isolation and microphone permission prompts still need the owner smoke check.
 */
import electron = require("electron");
// Speech bridge implementation and rationale: Jini/packages/desktop-host/src/speech/speech-bridge.ts.
// A static require lets the preload bundler inline the ESM package into its CommonJS output.
const { createSpeechBridge }: typeof import("@jini-ai/desktop-host/speech", { with: { "resolution-mode": "import" } }) = require("@jini-ai/desktop-host/speech");
const { contextBridge, ipcRenderer, webUtils } = electron;
declare const window: { readonly location: { readonly pathname: string } };
// Declare only this DOM global: the shared preload tsconfig omits DOM so the ESM preload needs
// no browser library; widening its program just to read pathname would broaden both preloads.
const speech = createSpeechBridge({
  channelNamespace: "tovu:speech",
  ipcRenderer: { invoke: ({ channel }, { args = [] } = {}) => ipcRenderer.invoke(channel, ...args) },
});
contextBridge.exposeInMainWorld("tovuVoice", {
  isAvailable: () => speech.isAvailable(),
  /** Convert the host renderer's positional call; preserve sample identity and native IPC order. */
  transcribe: (samples: Float32Array | readonly number[], sampleRate: number) =>
    speech.transcribe({ samples, sampleRate }),
});
/**
 * `webview-guest-policy.ts`'s `DESKTOP_EMBEDDED_ARG`, inlined: this preload is bundled to CommonJS on
 * its own and must not pull main-process modules in. Present only in a shell `<webview>` guest (a
 * standalone site window never gets it), where the site admin hides its own chat because the
 * shell's is the one chat (SPEC-051).
 */
const DESKTOP_EMBEDDED_ARG = "--tovu-desktop-embedded";
if (process.argv.includes(DESKTOP_EMBEDDED_ARG)) {
  contextBridge.exposeInMainWorld("tovuDesktop", { embedded: true });
}
/** File paths are a host capability granted only to the admin document. */
const ADMIN_PATH_PREFIX = "/admin";
// This preload also runs on same-origin public pages. Gate OS-path metadata to the admin document
// so theme scripts do not receive it directly. This is defense in depth, not an origin boundary:
// public/admin pages share an origin and session. Full navigation reruns the preload and this check.
const pathname = window.location.pathname;
if (pathname === ADMIN_PATH_PREFIX || pathname.startsWith(`${ADMIN_PATH_PREFIX}/`)) {
  contextBridge.exposeInMainWorld("tovuFiles", {
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  });
}
