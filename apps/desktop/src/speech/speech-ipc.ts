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

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { resolveTranscriptionPort } from "./transcription-port.ts";
import type { TranscriptionPort } from "./transcription-port.ts";
import { createMacOnDeviceTranscriptionPort } from "./mac-on-device-transcriber.ts";
import { encodeMonoWav } from "./pcm-wav-encoder.ts";

/** Renderer asks "can I show the mic button at all" — see `preload-speech.cts`. */
const IPC_CHANNEL_IS_AVAILABLE = "tovu:speech:isAvailable";
/** Renderer hands over one completed recording's raw samples — see `preload-speech.cts`. */
const IPC_CHANNEL_TRANSCRIBE = "tovu:speech:transcribe";

/**
 * The longest recording `transcribe` accepts by default: five minutes at 48 kHz (57.6 MB as
 * float32). The mic is push-to-talk (`apps/admin/src/features/voice-input/hooks/mic-capture.ts`), so
 * a real utterance is far shorter. This bounds what one call can make the main process allocate,
 * encode and hand to the recognizer.
 */
const MAX_TRANSCRIBE_SAMPLES = 48_000 * 60 * 5;
/** The lowest and highest capture rates accepted, in Hz: telephone-band to high-end interfaces.
 *  A real `AudioContext` opens at the hardware rate, which is always a whole number in this range. */
const MIN_SAMPLE_RATE_HZ = 8_000;
const MAX_SAMPLE_RATE_HZ = 192_000;

/** The part of Electron's `IpcMainInvokeEvent` the sender check reads. `senderFrame` is `null`
 *  when the frame has already navigated away or been destroyed. */
interface SpeechIpcEvent {
  senderFrame?: { url: string } | null;
}

/** {@link registerSpeechIpc}'s arguments. */
interface RegisterSpeechIpcArgs {
  ipcMain: Pick<IpcMain, "handle">;
  port?: TranscriptionPort;
  /** Whether a sending page's url is one this app serves. Required: see {@link registerSpeechIpc}. */
  isTrustedSender: (senderUrl: string) => boolean;
  maxSamples?: number;
}

/**
 * Resolves the real, platform-appropriate port. Takes `platform` as a plain argument rather than
 * a `= process.platform` default parameter (each default parameter costs a complexity point per
 * this repo's style rule) — a bare call from `registerSpeechIpc` passes `undefined`, which this
 * function maps to the real platform itself.
 *
 * @complexity O(1).
 */
function buildDefaultPort(platform: NodeJS.Platform | undefined): TranscriptionPort {
  const resolvedPlatform = platform === undefined ? process.platform : platform;
  return resolveTranscriptionPort({ platform: resolvedPlatform, createMacPort: () => createMacOnDeviceTranscriptionPort() });
}

/**
 * Throw unless `event` came from a page `isTrustedSender` accepts.
 * @throws {Error} naming the refusal, for the renderer's `invoke` to reject with.
 * @complexity O(1) beyond `isTrustedSender`'s own cost.
 */
function assertTrustedSender(event: SpeechIpcEvent | undefined, isTrustedSender: (senderUrl: string) => boolean): void {
  const senderUrl = event?.senderFrame?.url;
  if (typeof senderUrl !== "string" || !isTrustedSender(senderUrl)) {
    throw new Error("tovu:speech: refused — the sender is not a page this app serves.");
  }
}

/**
 * The validated sample rate.
 * @throws {RangeError} unless a whole number of Hz from {@link MIN_SAMPLE_RATE_HZ} to {@link MAX_SAMPLE_RATE_HZ}.
 * @complexity O(1).
 */
function readSampleRate(sampleRate: unknown): number {
  if (!Number.isInteger(sampleRate) || (sampleRate as number) < MIN_SAMPLE_RATE_HZ || (sampleRate as number) > MAX_SAMPLE_RATE_HZ) {
    throw new RangeError(`tovu:speech:transcribe: sampleRate must be a whole number of Hz from ${MIN_SAMPLE_RATE_HZ} to ${MAX_SAMPLE_RATE_HZ}.`);
  }
  return sampleRate as number;
}

/**
 * The validated samples, as a `Float32Array`. A `Float32Array` is returned as is, not copied, and
 * its values need no check: every element is already a float, and the encoder clamps to `[-1, 1]`.
 * A plain array is checked element by element, and copied only after that passes and after its
 * length does.
 *
 * @throws {TypeError} for anything but a `Float32Array` or an array of finite numbers.
 * @throws {RangeError} for more than `maxSamples` samples.
 * @complexity O(1) for a `Float32Array`; O(n) for an array, with n already capped at `maxSamples`.
 */
function readSamples(samples: unknown, maxSamples: number): Float32Array {
  const isFloat32 = samples instanceof Float32Array;
  if (!isFloat32 && !Array.isArray(samples)) throw samplesTypeError();
  if (samples.length > maxSamples) {
    throw new RangeError(`tovu:speech:transcribe: at most ${maxSamples} samples per recording.`);
  }
  if (isFloat32) return samples;
  if (!samples.every((sample) => Number.isFinite(sample))) throw samplesTypeError();
  return Float32Array.from(samples as number[]);
}

/** @complexity O(1). */
function samplesTypeError(): TypeError {
  return new TypeError("tovu:speech:transcribe: samples must be a Float32Array or an array of finite numbers.");
}

/**
 * Registers the two speech IPC handlers on `ipcMain`. Call once, after `app.whenReady()`, before
 * any window whose preload references `window.tovuVoice` loads.
 *
 * The sample rate crossing IPC (not hardcoded) is what lets the renderer capture at whatever rate
 * its `AudioContext` actually opened at — resampling in the browser to match a fixed constant here
 * would be one more failure mode for no benefit, since {@link encodeMonoWav} accepts any rate.
 *
 * @param args
 * @param args.ipcMain - Electron's `ipcMain`, or a fake with its `handle`.
 * @param args.port - Injectable for tests; a real caller omits it and gets the real
 *   platform-resolved port.
 * @param args.isTrustedSender - Whether the sending frame's url is a page this app serves (`main.ts`
 *   passes `isShellPageUrl`). Required rather than defaulted: a default that trusted everyone would
 *   make a wiring mistake silently reopen both channels to every page.
 * @param args.maxSamples - The per-recording cap; defaults to {@link MAX_TRANSCRIBE_SAMPLES}.
 * @throws {Error} when `isTrustedSender` is missing.
 * @complexity O(1) to register. Each handler rejects a bad call in O(1), except an over-long plain
 *   array's O(n) element check; an accepted call is O(n) in samples plus the port's own cost.
 */
function registerSpeechIpc({ ipcMain, port, isTrustedSender, maxSamples = MAX_TRANSCRIBE_SAMPLES }: RegisterSpeechIpcArgs): void {
  if (typeof isTrustedSender !== "function") {
    throw new Error("registerSpeechIpc: isTrustedSender is required — without it every page could reach the recognizer.");
  }
  const resolvedPort = port || buildDefaultPort(undefined);

  ipcMain.handle(IPC_CHANNEL_IS_AVAILABLE, (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event, isTrustedSender);
    return resolvedPort.isAvailable();
  });
  // `samples` arrives through IPC's structured clone, so it is whatever the page sent: checked, not trusted.
  ipcMain.handle(IPC_CHANNEL_TRANSCRIBE, (event: IpcMainInvokeEvent, samples: unknown, sampleRate: unknown) => {
    assertTrustedSender(event, isTrustedSender);
    const validRate = readSampleRate(sampleRate);
    const wavBuffer = encodeMonoWav({ samples: readSamples(samples, maxSamples), sampleRate: validRate });
    return resolvedPort.transcribe(wavBuffer);
  });
}

export { registerSpeechIpc, buildDefaultPort, IPC_CHANNEL_IS_AVAILABLE, IPC_CHANNEL_TRANSCRIBE, MAX_TRANSCRIBE_SAMPLES };
