/**
 * @file The transcription port the desktop speech feature is built behind: a tiny seam so the
 * concrete recognizer — macOS on-device Speech today, whisper.cpp or a hosted API later — can be
 * swapped without the IPC layer or the composer UI knowing which one is behind it. See
 * `mac-on-device-transcriber.js` for the only implementation that exists today, and
 * `speech-ipc.js` for the one caller that resolves a port and puts it behind two IPC handlers.
 *
 * @typedef {Object} TranscriptionResult
 * @property {string} text - The recognized transcript. Empty string, never null, when the
 *   recognizer ran successfully but understood nothing (e.g. silence).
 * @property {number} elapsedMs - Wall-clock recognition time, for latency logs.
 *
 * @typedef {Object} TranscriptionAvailability
 * @property {boolean} available - Whether this port can transcribe right now.
 * @property {string} [reason] - Present when `available` is false; a short machine-and-human
 *   readable code (e.g. "unsupported-platform:win32", "on-device-recognition-unavailable").
 *
 * @typedef {Object} TranscriptionPort
 * @property {() => Promise<TranscriptionAvailability>} isAvailable - Cheap capability probe. Must
 *   not prompt the user or start recording — callers use it to decide whether to render the mic
 *   affordance at all.
 * @property {(wavBuffer: Buffer) => Promise<TranscriptionResult>} transcribe - Transcribes one
 *   complete mono 16-bit PCM WAV recording. Rejects rather than silently transcribing over the
 *   network when on-device recognition is unavailable — see `mac-on-device-transcriber.js`'s own
 *   header for why silent network fallback is treated as a correctness bug, not a convenience.
 */

/**
 * A port that reports itself unavailable and refuses to transcribe. Used for every non-macOS
 * platform today, and as the terminal state when the real implementation's own capability probe
 * fails (helper missing, `swiftc` unavailable, on-device assets not installed).
 *
 * @param {string} reason
 * @returns {TranscriptionPort}
 * @complexity O(1).
 */
function unavailablePort(reason) {
  return {
    isAvailable: async () => ({ available: false, reason }),
    transcribe: async () => {
      throw new Error(`tovu speech: transcription unavailable (${reason})`);
    },
  };
}

/**
 * Resolves the transcription port for the current platform. Pure selection logic — no I/O of its
 * own — so it is directly testable without spawning a real process or touching Electron.
 *
 * @param {Object} deps
 * @param {NodeJS.Platform} deps.platform - Injected rather than read from `process.platform`
 *   directly, so a test can simulate any platform.
 * @param {() => TranscriptionPort} deps.createMacPort - Factory for the real macOS
 *   implementation, called lazily (only on `darwin`) so a non-mac platform never even requires
 *   the child-process-spawning module.
 * @returns {TranscriptionPort}
 * @complexity O(1).
 */
function resolveTranscriptionPort({ platform, createMacPort }) {
  if (platform !== "darwin") {
    return unavailablePort(`unsupported-platform:${platform}`);
  }
  return createMacPort();
}

export { resolveTranscriptionPort, unavailablePort };
