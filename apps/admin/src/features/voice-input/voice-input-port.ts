/**
 * @file The renderer-side half of the desktop speech feature's seam. `window.tovuVoice` is
 * injected by `apps/desktop/src/speech/preload-speech.cjs` via `contextBridge` — it exists ONLY
 * when this admin app is running inside the Electron desktop shell, never in a plain browser tab.
 * That presence check IS the capability gate: `getVoiceInputPort()` returns `null` outside
 * Electron, and every caller in this feature treats `null` as "render nothing", the same posture
 * `AssistantDock.tsx` already documents for its working-directory control ("no working-directory
 * control renders in the web admin... the real feature belongs to Tovu-Runner, which has an actual
 * filesystem").
 *
 * This module knows nothing about recording, keybindings, or UI — see
 * `hooks/push-to-talk-state.hooks.ts` for the state machine and `hooks/use-push-to-talk.hooks.ts`
 * for the hook that drives this port.
 */

/** Mirrors `apps/desktop/src/speech/transcription-port.cjs`'s `TranscriptionAvailability`. */
export interface VoiceInputAvailability {
  available: boolean;
  reason?: string;
}

/** Mirrors `apps/desktop/src/speech/transcription-port.cjs`'s `TranscriptionResult`. */
export interface VoiceInputTranscriptionResult {
  text: string;
  elapsedMs: number;
}

/** The bridge `preload-speech.cjs` exposes via `contextBridge.exposeInMainWorld("tovuVoice", ...)`. */
export interface VoiceInputPort {
  isAvailable(): Promise<VoiceInputAvailability>;
  transcribe(samples: Float32Array | number[], sampleRate: number): Promise<VoiceInputTranscriptionResult>;
}

declare global {
  interface Window {
    /** Present only inside the Electron desktop shell — see this file's own header. */
    tovuVoice?: VoiceInputPort;
  }
}

/**
 * Resolves the voice input port for the current runtime.
 *
 * @param targetWindow - Injected so a test can simulate either runtime without touching the real
 *   `window` global. A real caller omits it (kept as a plain parameter, not a `= window` default,
 *   per this repo's style rule that a default parameter costs a complexity point).
 * @returns The real port when running inside the desktop shell, `null` in a plain browser tab.
 * @complexity Time/space: O(1).
 */
export function getVoiceInputPort(targetWindow: Window | undefined): VoiceInputPort | null {
  if (targetWindow !== undefined) return targetWindow?.tovuVoice ?? null;
  return typeof window === "undefined" ? null : (window.tovuVoice ?? null);
}
