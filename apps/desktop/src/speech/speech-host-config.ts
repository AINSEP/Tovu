/**
 * @file Tovu's product values for the desktop speech feature, injected into
 * `@jini-ai/desktop-host/shell/speech/speech-ipc` by `main/index.ts`. Values only: the IPC wiring,
 * the lazy port choice and the native macOS adapters live in Jini.
 *
 * `"tovu:speech"` is the IPC namespace `preload-speech.cts`'s renderer bridge calls; the two must
 * match (`preload-speech.test.ts`, `preload/preload.test.ts`).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { speechChannels } from "@jini-ai/desktop-host/speech";
import type { NativeSpeechHost } from "@jini-ai/desktop-host/shell/speech/speech-ipc";
import type { MacTranscriberMessages } from "@jini-ai/desktop-host/speech/macos";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEECH_CHANNEL_NAMESPACE = "tovu:speech";
const channels = speechChannels({ channelNamespace: SPEECH_CHANNEL_NAMESPACE });
export const IPC_CHANNEL_IS_AVAILABLE = channels.isAvailable;
export const IPC_CHANNEL_TRANSCRIBE = channels.transcribe;
// The Jini helper takes an explicit locale and has a non-prompting availability probe.
// Keep its cache separate so an existing legacy executable cannot bypass that protocol.
// Resolved from THIS module's own directory (`src/speech/`), where the cache has always lived.
export const DEFAULT_BINARY_PATH = path.join(dirname, ".build", "jini-v1", "tovu-speech-helper");
export const macTranscriberMessages: MacTranscriberMessages = {
  compilerMissing: "swiftc-not-found: no Swift toolchain on this machine",
  compilerFailed: ({ stderr }) => `swiftc-failed: ${stderr || "unknown compiler error"}`,
  invalidOutput: ({ stdout }) => `tovu speech: helper printed non-JSON output: ${stdout}`,
  cannotTranscribe: ({ reason }) => `tovu speech: cannot transcribe (${reason})`,
  recognitionFailed: ({ reason }) => `tovu speech: recognition failed (${reason})`,
};
export const SPEECH_HOST: NativeSpeechHost = {
  channelNamespace: SPEECH_CHANNEL_NAMESPACE,
  messages: {
    senderRefused: "tovu:speech: refused — the sender is not a page this app serves.",
    invalidRate: "tovu:speech:transcribe: sampleRate must be a whole number of Hz from 8000 to 192000.",
    invalidSamples: "tovu:speech:transcribe: samples must be a Float32Array or an array of finite numbers.",
    missingSenderGuard: "registerSpeechIpc: isTrustedSender is required — without it every page could reach the recognizer.",
    tooManySamples: ({ maxSamples }) => `tovu:speech:transcribe: at most ${maxSamples} samples per recording.`,
  },
  transcriptionMessages: {
    unsupportedPlatform: ({ platform }) => `unsupported-platform:${platform}`,
    unavailable: ({ reason }) => `tovu speech: transcription unavailable (${reason})`,
  },
  mac: { binaryPath: DEFAULT_BINARY_PATH, messages: macTranscriberMessages, tempFilePrefix: "tovu-speech-" },
};
