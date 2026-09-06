/**
 * @file Wires the {@link TranscriptionPort} (`transcription-port.cjs`) to the two IPC channels
 * `preload-speech.cjs`'s renderer-side bridge calls. This is the one module that knows both "there
 * is an Electron IPC channel" and "there is a transcription port" — neither
 * `transcription-port.cjs` nor `mac-on-device-transcriber.cjs` knows Electron exists, and this
 * file has no recognition logic of its own.
 *
 * **Not wired into `main.cjs` yet.** `createWindow`'s `webPreferences` needs a `preload` path
 * (`preload-speech.cjs`) and `app.whenReady()` needs one call to {@link registerSpeechIpc} — see
 * this feature's handoff notes for the exact snippet. Left undone deliberately: `main.cjs` already
 * carries unrelated uncommitted work from another session in this shared tree, and staging that
 * file would commit that work alongside this change with no way to separate the two at file-level
 * granularity.
 */

const { resolveTranscriptionPort } = require("./transcription-port.cjs");
const { createMacOnDeviceTranscriptionPort } = require("./mac-on-device-transcriber.cjs");
const { encodeMonoWav } = require("./pcm-wav-encoder.cjs");

/** Renderer asks "can I show the mic button at all" — see `preload-speech.cjs`. */
const IPC_CHANNEL_IS_AVAILABLE = "tovu:speech:isAvailable";
/** Renderer hands over one completed recording's raw samples — see `preload-speech.cjs`. */
const IPC_CHANNEL_TRANSCRIBE = "tovu:speech:transcribe";

/**
 * Resolves the real, platform-appropriate port. Takes `platform` as a plain argument rather than
 * a `= process.platform` default parameter (each default parameter costs a complexity point per
 * this repo's style rule) — a bare call from `registerSpeechIpc` passes `undefined`, which this
 * function maps to the real platform itself.
 *
 * @param {NodeJS.Platform | undefined} platform
 * @returns {import("./transcription-port.cjs").TranscriptionPort}
 * @complexity O(1).
 */
function buildDefaultPort(platform) {
  const resolvedPlatform = platform === undefined ? process.platform : platform;
  return resolveTranscriptionPort({ platform: resolvedPlatform, createMacPort: () => createMacOnDeviceTranscriptionPort() });
}

/**
 * Registers the two speech IPC handlers on `ipcMain`. Call once, after `app.whenReady()`, before
 * any window whose preload references `window.tovuVoice` loads.
 *
 * The sample rate crossing IPC (not hardcoded) is what lets the renderer capture at whatever rate
 * its `AudioContext` actually opened at — resampling in the browser to match a fixed constant here
 * would be one more failure mode for no benefit, since {@link encodeMonoWav} accepts any rate.
 *
 * @param {Object} args
 * @param {import("electron").IpcMain} args.ipcMain
 * @param {import("./transcription-port.cjs").TranscriptionPort} [args.port] - Injectable for
 *   tests; a real caller omits it and gets the real platform-resolved port.
 * @complexity O(1) to register; each handler's own body is O(1) beyond its port call.
 */
function registerSpeechIpc({ ipcMain, port }) {
  const resolvedPort = port || buildDefaultPort(undefined);

  ipcMain.handle(IPC_CHANNEL_IS_AVAILABLE, () => resolvedPort.isAvailable());
  ipcMain.handle(IPC_CHANNEL_TRANSCRIBE, (_event, samples, sampleRate) => {
    const wavBuffer = encodeMonoWav({ samples: Float32Array.from(samples), sampleRate });
    return resolvedPort.transcribe(wavBuffer);
  });
}

module.exports = { registerSpeechIpc, buildDefaultPort, IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE };
