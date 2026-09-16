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
 * **Electron never loads this file; it loads what `tsconfig.preload.json` compiles it to,
 * `dist/speech/preload-speech.cjs`.** Electron's sandboxed-preload loader neither strips types nor
 * accepts ESM (desktop TypeScript migration, probe P2: a `.ts` or `.cts` preload fails there with a
 * SyntaxError, a `.cjs` one loads), so this is the same build-then-load pipeline that turns
 * `src/preload/preload.mts` into `dist/preload/preload.mjs`. `npm run desktop` builds it before
 * Electron starts; `npm run package` builds it before electron-builder. The `.cts` extension is what
 * makes that output CommonJS inside this `"type": "module"` package, and `import … = require(…)`
 * below is the one import form `verbatimModuleSyntax` accepts in a CommonJS file. tsc also emits
 * `Object.defineProperty(exports, "__esModule", …)` into that output; the sandboxed loader supplies
 * `exports` (and `module`) to every preload, so that line is inert there.
 *
 * **Nothing is imported but `"electron"`, on purpose.** Electron's sandboxed preload gives `require`
 * a restricted polyfill that resolves only `"electron"`, `"events"`, `"timers"` and `"url"` — a
 * relative specifier throws the moment the preload runs. So the two channel names below are INLINED
 * rather than imported from `speech-ipc.ts`, which stays their source of truth, and no sibling is
 * imported even for a type: that would add the sibling to `tsconfig.preload.json`'s program and emit
 * it into `dist/` beside this file. `preload-speech.test.ts` compiles this file with that tsconfig's
 * own options and checks the OUTPUT: exactly one `require`, of `"electron"`, and both channel
 * literals equal to `speech-ipc.ts`'s exports.
 *
 * The bridged calls themselves are NOT unit-tested: they only work inside Electron's real preload
 * context (`contextBridge`/`ipcRenderer` do not exist under plain Node — `require("electron")` there
 * resolves to a path string, not the API). Verified by code review only — two `ipcRenderer.invoke`
 * calls forwarding straight to the channels `speech-ipc.ts` already tests end-to-end, plus the one
 * synchronous `webUtils.getPathForFile` passthrough `tovuFiles` adds. The file's one branch — which
 * pages get `tovuFiles` — IS tested, by running the compiled output in a `vm` with a stubbed
 * `electron` (`preload-speech.test.ts`).
 */

import electron = require("electron");

const { contextBridge, ipcRenderer, webUtils } = electron;

/** The one DOM global this preload reads. `tsconfig.preload.json` compiles without the DOM lib
 *  (the ESM preload needs none), so it is declared here rather than widened for both preloads. */
declare const window: { readonly location: { readonly pathname: string } };

/** Mirrors `speech-ipc.ts`'s own `IPC_CHANNEL_IS_AVAILABLE` — see this file's header for why this
 *  is a literal instead of an import. */
const IPC_CHANNEL_IS_AVAILABLE = "tovu:speech:isAvailable";
/** Mirrors `speech-ipc.ts`'s own `IPC_CHANNEL_TRANSCRIBE` — see this file's header for why this is
 *  a literal instead of an import. */
const IPC_CHANNEL_TRANSCRIBE = "tovu:speech:transcribe";

contextBridge.exposeInMainWorld("tovuVoice", {
  /** @returns a promise of `transcription-port.ts`'s `TranscriptionAvailability` — typed `unknown`
   *  because this file may not import that type (see header). */
  isAvailable: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNEL_IS_AVAILABLE),
  /**
   * @param samples - Mono PCM samples in `[-1, 1]`.
   * @param sampleRate - In Hz, whatever the capturing `AudioContext` actually opened at.
   * @returns a promise of `transcription-port.ts`'s `TranscriptionResult` — typed `unknown` for the
   *   same reason as `isAvailable`.
   */
  transcribe: (samples: Float32Array | readonly number[], sampleRate: number): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNEL_TRANSCRIBE, samples, sampleRate),
});

/**
 * See this file's header ("`window.tovuFiles` (SPEC-053)") for why this bridge lives here rather than
 * in `preload.mts`. `getPathForFile` is Electron's own synchronous, in-process lookup — no IPC round
 * trip, because `webUtils` only exists in the preload's Node-capable context, not the isolated page it
 * bridges into (same rationale as `preload.mts`'s own copy of this call, which this mirrors byte-for-
 * byte for `apps/desktop/src/renderer/folder-drop.ts`'s admin-side counterpart,
 * `apps/admin/src/features/fs-files/folder-drop-port.ts`, to call).
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
    /** @param file - a `File` the page received. @returns the file's absolute OS path, or `''` if unresolvable. */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  });
}
