// Jini source: /Users/la/Programming/Jini/packages/desktop-host/src/speech/macos/mac-on-device-transcriber.ts
/**
 * @file The only concrete {@link TranscriptionPort} (see `transcription-port.ts`) that exists
 * today: macOS's own on-device `Speech` framework, reached by spawning
 * `@jini-ai/desktop-host/speech/macos/speech-helper.swift`'s compiled binary as a child process — the same "spawn a small CLI,
 * read its stdout" shape `tovu-server.ts` already uses for `tovu serve`.
 *
 * **Zero downloaded model data.** The helper links `Speech`/`SFSpeechRecognizer` against the
 * speech models macOS ships with the OS; nothing is fetched at install or first run. The owner
 * explicitly rejected whisper.cpp for its ~75MB model download — this path adds none.
 *
 * **No silent network fallback.** Every request the helper builds sets
 * `requiresOnDeviceRecognition = true` (`@jini-ai/desktop-host/speech/macos/speech-helper.swift`). If on-device assets are not
 * installed for the recognizer's locale, `SFSpeechRecognizer` does not silently use the network
 * instead — it fails the request, and this module surfaces that failure as `available: false` /
 * a rejected `transcribe()` rather than papering over it. Silently transcribing over the network
 * would defeat the entire point (Tovu is local-first; browser speech recognition uploads audio to
 * a vendor's servers) and the caller would have no way to know it happened, so this module treats
 * "on-device unavailable" as a reportable stop condition, never a fallback trigger.
 *
 * Helper spike history: synthesized speech first proved this subprocess approach. Its initial
 * semaphore-based CLI starved the main queue's XPC callbacks and timed out on every run at the
 * 30s ceiling; Jini's Swift helper pumps the run loop instead. Keep its 15s authorization and
 * 30s recognition budgets, and never replace the loop with a blocking main-thread semaphore.
 *
 * The compiled helper binary is never committed — `ensureHelperCompiled` lazily runs `swiftc`
 * against the source the first time it's needed and caches the binary under `.build/` (gitignored
 * alongside every other build output in this repo). This keeps the repo Swift-toolchain-agnostic:
 * a checkout with no `swiftc` simply reports `unavailable` instead of failing to install.
 */
// Native-helper rationale: Jini packages/desktop-host/src/speech/macos/speech-helper.swift.
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createMacOnDeviceTranscriptionPort as createMacPort,
  type MacTranscriberDeps, type MacTranscriberMessages,
} from "@jini-ai/desktop-host/speech/macos";
import type { TranscriptionPort } from "@jini-ai/desktop-host/speech";
// ESM has no synchronous import; createRequire preserves lazy loading of the native Node adapters.
const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
// The Jini helper takes an explicit locale and has a non-prompting availability probe.
// Keep its cache separate so an existing legacy executable cannot bypass that protocol.
export const DEFAULT_BINARY_PATH = path.join(dirname, ".build", "jini-v1", "tovu-speech-helper");
export const macTranscriberMessages: MacTranscriberMessages = {
  compilerMissing: "swiftc-not-found: no Swift toolchain on this machine",
  compilerFailed: ({ stderr }) => `swiftc-failed: ${stderr || "unknown compiler error"}`,
  invalidOutput: ({ stdout }) => `tovu speech: helper printed non-JSON output: ${stdout}`,
  cannotTranscribe: ({ reason }) => `tovu speech: cannot transcribe (${reason})`,
  recognitionFailed: ({ reason }) => `tovu speech: recognition failed (${reason})`,
};
/** Resolve the published Swift asset only when macOS speech is constructed. @complexity O(1). */
export function speechHelperSourcePath(_requiredArgs: Record<string, never>): string {
  return require.resolve("@jini-ai/desktop-host/speech/macos/speech-helper.swift");
}
/** Bind Node's native signatures without running recognition. @complexity O(1). */
function realDependencies({ binaryPath, sourcePath }: { binaryPath: string; sourcePath: string }): MacTranscriberDeps {
  // Requiring inside the factory keeps non-macOS hosts from loading the process/promisify
  // adapters at module import; resolveTranscriptionPort selects platform eligibility first.
  const { execFile, spawnSync }: typeof import("node:child_process") = require("node:child_process");
  const { promisify }: typeof import("node:util") = require("node:util");
  const fs: typeof import("node:fs") = require("node:fs");
  const execFileAsync = promisify(execFile);
  return {
    fs: {
      existsSync: ({ path }) => fs.existsSync(path),
      mkdirSync: ({ path }, { recursive = false } = {}) => fs.mkdirSync(path, { recursive }),
      writeFileSync: ({ path, data }) => fs.writeFileSync(path, data),
      rmSync: ({ path }, { force = false } = {}) => fs.rmSync(path, { force }),
    },
    spawnSync: ({ command, args }) => spawnSync(command, args),
    execFileAsync: ({ file, args }) => execFileAsync(file, args),
    sourcePath, binaryPath, compilerPath: "swiftc", locale: "en-US", messages: macTranscriberMessages,
    tempFilePath: () => path.join(os.tmpdir(), `tovu-speech-${crypto.randomUUID()}.wav`),
  };
}
/**
 * Construct Jini recognition with host policy and optional injected ports.
 * Keep realDependencies separate so a caller can override only the few ports it needs
 * while every omitted dependency still follows the production path. Call only on darwin;
 * resolveTranscriptionPort decides platform eligibility before reaching this factory.
 * @complexity O(1) to construct; native compilation/recognition happens only when used.
 */
export function createMacOnDeviceTranscriptionPort(_requiredArgs: Record<string, never>, overrides: Partial<MacTranscriberDeps> = {}): TranscriptionPort {
  const sourcePath = overrides.sourcePath ?? speechHelperSourcePath({});
  const binaryPath = overrides.binaryPath ?? DEFAULT_BINARY_PATH;
  return createMacPort({ ...realDependencies({ sourcePath, binaryPath }), ...overrides });
}
