/**
 * @file Wires the {@link TranscriptionPort} (`transcription-port.ts`) to the two IPC channels
 * `preload-speech.cts`'s renderer-side bridge calls. This is the one module that knows both "there
 * is an Electron IPC channel" and "there is a transcription port" — neither
 * `transcription-port.ts` nor `mac-on-device-transcriber.ts` knows Electron exists, and this
 * file has no recognition logic of its own.
 *
 * Wired into `main.ts`: `createWindow`'s `webPreferences.preload` points at `preload-speech.cts`'s
 * compiled output (`dist/speech/preload-speech.cjs`),
 * and `app.whenReady()` calls {@link registerSpeechIpc} once, before either boot-mode branch opens
 * a window — see `main.ts`'s own `SPEECH_PRELOAD_PATH` doc.
 *
 * **Every call is validated before it costs anything.** The channels are reachable from every page
 * that runs a preload exposing `tovuVoice` — a site's admin AND its public pages (themes included),
 * and the sites home window. So the sender's page is checked first, then the sample rate, then the
 * samples' type and length, all before a single sample is copied. `samples` arrives by structured
 * clone, so `{ length: 2_000_000_000 }` crosses IPC in a few bytes; the old
 * `Float32Array.from(samples)` then allocated 8 GB in the main process.
 */
import type { IpcMain } from "electron";
import {
  registerSpeechIpc as registerIpc, speechChannels, MAX_TRANSCRIBE_SAMPLES,
  type TranscriptionPort, type SpeechIpcMessages,
} from "@jini-ai/desktop-host/speech";
import { resolveTranscriptionPort } from "./transcription-port.ts";
import { createMacOnDeviceTranscriptionPort } from "./mac-on-device-transcriber.ts";
export { MAX_TRANSCRIBE_SAMPLES } from "@jini-ai/desktop-host/speech";
const channels = speechChannels({ channelNamespace: "tovu:speech" });
export const IPC_CHANNEL_IS_AVAILABLE = channels.isAvailable;
export const IPC_CHANNEL_TRANSCRIBE = channels.transcribe;
const messages: SpeechIpcMessages = {
  senderRefused: "tovu:speech: refused — the sender is not a page this app serves.",
  invalidRate: "tovu:speech:transcribe: sampleRate must be a whole number of Hz from 8000 to 192000.",
  invalidSamples: "tovu:speech:transcribe: samples must be a Float32Array or an array of finite numbers.",
  missingSenderGuard: "registerSpeechIpc: isTrustedSender is required — without it every page could reach the recognizer.",
  tooManySamples: ({ maxSamples }) => `tovu:speech:transcribe: at most ${maxSamples} samples per recording.`,
};
/** Resolve a lazy host transcription port. @complexity O(1). */
export function buildDefaultPort({ platform }: { platform: NodeJS.Platform }, options: Parameters<typeof createMacOnDeviceTranscriptionPort>[1] = {}): TranscriptionPort {
  return resolveTranscriptionPort({ platform, createMacPort: () => createMacOnDeviceTranscriptionPort({}, options) });
}
interface RegisterSpeechIpcArgs {
  ipcMain: Pick<IpcMain, "handle"> & Partial<Pick<IpcMain, "removeHandler">>;
  isTrustedSender: (senderUrl: string) => boolean;
}
/** Adapt native IPC without changing the renderer's positional payloads. @complexity O(1) to register; O(n) per recording. */
export function registerSpeechIpc({ ipcMain, isTrustedSender }: RegisterSpeechIpcArgs,
  { port, maxSamples = MAX_TRANSCRIBE_SAMPLES }: { port?: TranscriptionPort; maxSamples?: number } = {}): () => void {
  // Fail before constructing native dependencies when the host forgot its sender policy.
  if (typeof isTrustedSender !== "function") throw new Error(messages.missingSenderGuard);
  return registerIpc({
    channelNamespace: "tovu:speech", messages,
    port: port ?? buildDefaultPort({ platform: process.platform }),
    isTrustedSender: ({ senderUrl }) => isTrustedSender(senderUrl),
    ipcMain: {
      handle: ({ channel, handler }) => ipcMain.handle(channel, (event, samples, sampleRate) => handler({ event, samples, sampleRate })),
      removeHandler: ({ channel }) => ipcMain.removeHandler?.(channel),
    },
  }, { maxSamples });
}
// Validation/allocation rationale: Jini/packages/desktop-host/src/speech/speech-ipc.ts.
// PCM encoding rationale: Jini/packages/desktop-host/src/speech/pcm-wav-encoder.ts.
