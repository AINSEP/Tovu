/**
 * @file Turns the machine-readable `reason` codes the transcription port emits into one short line
 * an operator can act on. Pure — no React, no DOM — so every code's copy is directly assertable.
 *
 * The codes themselves are produced by two places and are NOT invented here:
 * - `apps/desktop/src/speech/transcription-port.cjs` — `unsupported-platform:<platform>`.
 * - `apps/desktop/src/speech/tovu-speech-helper.swift` (surfaced through
 *   `mac-on-device-transcriber.cjs`) — `speech-recognition-not-authorized:<status>`,
 *   `no-recognizer-for-locale`, `on-device-recognition-unavailable`, `swiftc-not-found: …`,
 *   `swiftc-failed: …`.
 *
 * {@link NO_DESKTOP_SHELL_REASON} is the one code this side originates, for the case no port exists
 * at all — a plain browser tab, where `window.tovuVoice` was never injected.
 */

/**
 * Reason code used when the admin app is running outside the Electron desktop shell.
 *
 * Kept in the same code vocabulary as the desktop-side reasons so the renderer has exactly one
 * unavailability channel rather than a `reason` string plus a separate "is there a port" boolean.
 */
export const NO_DESKTOP_SHELL_REASON = "no-desktop-shell";

/**
 * Longest-prefix-wins copy table. Prefixes (not exact keys) because two of the real codes carry a
 * trailing colon-delimited detail — the platform name, the authorization status — that an operator
 * has no use for.
 */
const REASON_COPY: ReadonlyArray<readonly [prefix: string, copy: string]> = [
  [
    NO_DESKTOP_SHELL_REASON,
    "Voice input needs the Tovu desktop app — transcription runs on your Mac, never in the cloud.",
  ],
  ["unsupported-platform", "Voice input needs macOS — on-device transcription is not available here."],
  ["speech-recognition-not-authorized", "Tovu is not allowed to use speech recognition. Grant it in System Settings › Privacy & Security."],
  ["on-device-recognition-unavailable", "macOS on-device dictation is not installed. Turn it on in System Settings › Keyboard › Dictation."],
  ["no-recognizer-for-locale", "macOS has no on-device recognizer for this language."],
  ["swiftc-not-found", "Voice input needs Xcode command line tools (no Swift toolchain found)."],
  ["swiftc-failed", "The speech helper failed to build on this machine."],
];

/** Shown for an unrecognized or absent code — honest about the state without inventing a cause. */
const FALLBACK_COPY = "Voice input is not available on this machine.";

/**
 * Maps a transcription-port reason code to one short operator-facing line.
 *
 * @param reason - The code, or `undefined` when the port reported unavailability without one.
 * @returns Copy suitable for a tooltip or an `aria-label`. English, doubling as its own i18n key
 *   per this app's convention — the caller passes it through `t()`.
 * @complexity Time: O(k) in the (fixed, small) table size. Space: O(1).
 */
export function describeVoiceUnavailability(reason: string | undefined): string {
  if (reason === undefined) return FALLBACK_COPY;
  const match = REASON_COPY.find(([prefix]) => reason.startsWith(prefix));
  return match ? match[1] : FALLBACK_COPY;
}
