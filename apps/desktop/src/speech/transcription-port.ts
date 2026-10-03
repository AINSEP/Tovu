/**
 * @file The transcription port the desktop speech feature is built behind: a tiny seam so the
 * concrete recognizer — macOS on-device Speech today, whisper.cpp or a hosted API later — can be
 * swapped without the IPC layer or the composer UI knowing which one is behind it. See
 * `mac-on-device-transcriber.ts` for the only implementation that exists today, and
 * `speech-ipc.ts` for the one caller that resolves a port and puts it behind two IPC handlers.
 */
// Recognizer contracts and lazy selection: Jini/packages/desktop-host/src/speech/transcription-port.ts.
import {
  resolveTranscriptionPort as resolvePort, unavailablePort as unavailable,
  type TranscriptionPort, type TranscriptionMessages,
} from "@jini-ai/desktop-host/speech";
export type { TranscriptionAvailability, TranscriptionPort, TranscriptionResult } from "@jini-ai/desktop-host/speech";
export interface ResolveTranscriptionPortDeps { platform: NodeJS.Platform; createMacPort: () => TranscriptionPort }
const messages: TranscriptionMessages = {
  unsupportedPlatform: ({ platform }) => `unsupported-platform:${platform}`,
  unavailable: ({ reason }) => `tovu speech: transcription unavailable (${reason})`,
};
/** Construct an unavailable port with Tovu wording. @complexity O(1). */
export function unavailablePort({ reason }: { reason: string }): TranscriptionPort {
  return unavailable({ reason, message: messages.unavailable });
}
/** Keep Tovu's platform policy and lazy macOS factory. @complexity O(1). */
export function resolveTranscriptionPort(args: ResolveTranscriptionPortDeps): TranscriptionPort {
  return resolvePort({ ...args, messages });
}
