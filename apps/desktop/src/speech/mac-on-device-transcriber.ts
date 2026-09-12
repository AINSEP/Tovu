/**
 * @file The only concrete {@link TranscriptionPort} (see `transcription-port.ts`) that exists
 * today: macOS's own on-device `Speech` framework, reached by spawning
 * `tovu-speech-helper.swift`'s compiled binary as a child process — the same "spawn a small CLI,
 * read its stdout" shape `tovu-server.js` already uses for `tovu serve`.
 *
 * **Zero downloaded model data.** The helper links `Speech`/`SFSpeechRecognizer` against the
 * speech models macOS ships with the OS; nothing is fetched at install or first run. The owner
 * explicitly rejected whisper.cpp for its ~75MB model download — this path adds none.
 *
 * **No silent network fallback.** Every request the helper builds sets
 * `requiresOnDeviceRecognition = true` (`tovu-speech-helper.swift`). If on-device assets are not
 * installed for the recognizer's locale, `SFSpeechRecognizer` does not silently use the network
 * instead — it fails the request, and this module surfaces that failure as `available: false` /
 * a rejected `transcribe()` rather than papering over it. Silently transcribing over the network
 * would defeat the entire point (Tovu is local-first; browser speech recognition uploads audio to
 * a vendor's servers) and the caller would have no way to know it happened, so this module treats
 * "on-device unavailable" as a reportable stop condition, never a fallback trigger.
 *
 * The compiled helper binary is never committed — `ensureHelperCompiled` lazily runs `swiftc`
 * against the source the first time it's needed and caches the binary under `.build/` (gitignored
 * alongside every other build output in this repo). This keeps the repo Swift-toolchain-agnostic:
 * a checkout with no `swiftc` simply reports `unavailable` instead of failing to install.
 */

import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import type { TranscriptionAvailability, TranscriptionPort, TranscriptionResult } from "./transcription-port.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// {@link realDependencies} loads `node:child_process`/`node:util`/`node:fs` lazily, and ESM has no
// synchronous `import`. This keeps that laziness rather than hoisting the three into static imports.
const require = createRequire(import.meta.url);

const DEFAULT_SOURCE_PATH = path.join(__dirname, "tovu-speech-helper.swift");
const DEFAULT_BINARY_PATH = path.join(__dirname, ".build", "tovu-speech-helper");

/** The fields of `child_process.spawnSync`'s result {@link ensureHelperCompiled} reads. */
interface SpawnResult {
  status: number | null;
  stderr?: Buffer | string;
  error?: NodeJS.ErrnoException;
}

/** The slice of `node:fs` this module touches, so a test can inject an in-memory fake. */
interface TranscriberFs {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: true }): unknown;
  writeFileSync(path: string, data: Buffer): void;
  rmSync(path: string, options: { force: true }): void;
}

/** {@link ensureHelperCompiled}'s dependencies. */
interface CompileDeps {
  fs: Pick<TranscriberFs, "existsSync" | "mkdirSync">;
  spawnSync: (cmd: string, args: string[]) => SpawnResult;
  sourcePath: string;
  binaryPath: string;
}

/** {@link ensureHelperCompiled}'s outcome. `error?: undefined` on the success arm lets a loose (non-strictNullChecks)
 *  program, which cannot narrow on `ok`, still read `error` off the union. */
type CompileResult = { ok: true; error?: undefined } | { ok: false; error: string };

/** {@link checkAvailability}'s dependencies: the compile step's, plus a way to run the helper. */
interface AvailabilityDeps extends CompileDeps {
  execFileAsync: (file: string, args: string[]) => Promise<{ stdout: string }>;
}

/** The full dependency bundle {@link transcribeWav} and {@link createMacOnDeviceTranscriptionPort} use. */
interface MacTranscriberDeps extends AvailabilityDeps {
  fs: TranscriberFs;
  tempFilePath: () => string;
}

/** One line of the helper's JSON stdout, from either subcommand (see `tovu-speech-helper.swift`).
 *  {@link parseHelperJson} does not validate it, so every field is optional. */
interface HelperPayload {
  available?: unknown;
  reason?: string | null;
  ok?: boolean;
  text?: string;
  elapsedMs?: number;
  error?: string;
}

/**
 * Compiles the helper if it is not already built. A no-op (`{ok: true}`) once the binary exists —
 * this is the "lazy compile" step, not a rebuild-on-every-call step; delete `.build/` to force a
 * recompile (e.g. after editing the `.swift` source).
 *
 * @complexity O(1) plus `swiftc`'s own compile cost on a cache miss.
 */
function ensureHelperCompiled({ fs, spawnSync, sourcePath, binaryPath }: CompileDeps): CompileResult {
  if (fs.existsSync(binaryPath)) return { ok: true };

  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  const result = spawnSync("swiftc", ["-O", sourcePath, "-o", binaryPath]);

  if (result.error && result.error.code === "ENOENT") {
    return { ok: false, error: "swiftc-not-found: no Swift toolchain on this machine" };
  }
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : "unknown compiler error";
    return { ok: false, error: `swiftc-failed: ${stderr.trim()}` };
  }
  return { ok: true };
}

/**
 * Parses one line of the helper's JSON stdout, wrapping a parse failure with the raw text — a
 * malformed payload should be debuggable from the thrown message alone, not just "Unexpected
 * token".
 *
 * @complexity O(n) in `stdout`'s length (JSON.parse's own cost).
 */
function parseHelperJson(stdout: string): HelperPayload {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    throw new Error(`tovu speech: helper printed non-JSON output: ${stdout}`);
  }
}

/**
 * Runs the compiled helper with `args` and returns its parsed JSON stdout, whether the process
 * exited 0 or not — both `check` and `transcribe` print a structured payload on failure and exit
 * non-zero (see `tovu-speech-helper.swift`), and `execFile` attaches `stdout` to the rejection in
 * that case, so the structured error is not lost.
 *
 * @complexity O(1) beyond the child process's own cost.
 */
async function runHelperJson({ execFileAsync, binaryPath, args }: Pick<AvailabilityDeps, "execFileAsync" | "binaryPath"> & { args: string[] }): Promise<HelperPayload> {
  try {
    const { stdout } = await execFileAsync(binaryPath, args);
    return parseHelperJson(stdout);
  } catch (error) {
    // `execFile` rejects with an Error carrying the child's `stdout`; the typeof check narrows it.
    if (typeof (error as { stdout?: unknown }).stdout === "string" && (error as { stdout: string }).stdout.trim().length > 0) {
      return parseHelperJson((error as { stdout: string }).stdout);
    }
    throw error;
  }
}

/**
 * The cheap capability probe — compiles the helper if needed, then asks it to check
 * authorization + on-device-recognition support without touching a microphone or any audio file.
 *
 * @param deps - The subset of the bundle `createMacOnDeviceTranscriptionPort` closes over.
 * @complexity O(1) beyond the child process's own cost.
 */
async function checkAvailability(deps: AvailabilityDeps): Promise<TranscriptionAvailability> {
  const compiled = ensureHelperCompiled(deps);
  if (!compiled.ok) return { available: false, reason: compiled.error };

  const result = await runHelperJson({ execFileAsync: deps.execFileAsync, binaryPath: deps.binaryPath, args: ["check"] });
  return { available: Boolean(result.available), reason: result.reason ?? undefined };
}

/**
 * Writes `wavBuffer` to a scratch file, hands it to the helper's `transcribe` subcommand, and
 * always removes the scratch file afterward (success or failure) — a recording is transient input,
 * never a file Tovu itself needs to keep.
 *
 * @param wavBuffer
 * @param deps - Same shape `createMacOnDeviceTranscriptionPort` closes over.
 * @complexity O(1) beyond the child process's own cost, which scales with clip length.
 */
async function transcribeWav(wavBuffer: Buffer, deps: MacTranscriberDeps): Promise<TranscriptionResult> {
  const compiled = ensureHelperCompiled(deps);
  if (!compiled.ok) throw new Error(`tovu speech: cannot transcribe (${compiled.error})`);

  const tempPath = deps.tempFilePath();
  deps.fs.writeFileSync(tempPath, wavBuffer);
  try {
    const result = await runHelperJson({ execFileAsync: deps.execFileAsync, binaryPath: deps.binaryPath, args: ["transcribe", tempPath] });
    if (!result.ok) throw new Error(`tovu speech: recognition failed (${result.error})`);
    return { text: result.text ?? "", elapsedMs: result.elapsedMs ?? 0 };
  } finally {
    deps.fs.rmSync(tempPath, { force: true });
  }
}

/**
 * The real dependency bundle — actual `fs`, actual `child_process`, a fresh random temp path per
 * call. Split out from {@link createMacOnDeviceTranscriptionPort} so a test can override exactly
 * the handful of fields it cares about (`overrides`) while every untouched field still behaves
 * like production, without the factory itself taking a `= {}` default parameter (each default
 * parameter costs a complexity point per this repo's style rule; merging inside the body instead
 * keeps the factory's own complexity at its structural minimum).
 *
 * @returns the full dependency bundle {@link checkAvailability}/{@link transcribeWav} need.
 * @complexity O(1).
 */
function realDependencies(): MacTranscriberDeps {
  // Required lazily (not at module top) so a non-mac platform, which never calls this function,
  // never pays for requiring `node:child_process`'s promisified wrapper either. `require` returns
  // an untyped value, so each binding names its module's type; `spawnSync` alone is read straight
  // off the untyped value and meets the declared return type unchecked.
  const { execFile }: typeof import("node:child_process") = require("node:child_process");
  const { promisify }: typeof import("node:util") = require("node:util");
  const fs: typeof import("node:fs") = require("node:fs");
  return {
    fs,
    spawnSync: require("node:child_process").spawnSync,
    execFileAsync: promisify(execFile),
    sourcePath: DEFAULT_SOURCE_PATH,
    binaryPath: DEFAULT_BINARY_PATH,
    tempFilePath: () => path.join(os.tmpdir(), `tovu-speech-${crypto.randomUUID()}.wav`),
  };
}

/**
 * Builds the macOS on-device {@link TranscriptionPort}. Call only on `darwin` — see
 * `transcription-port.ts`'s `resolveTranscriptionPort`, which is the one caller that decides
 * platform eligibility before ever reaching this factory.
 *
 * @param overrides - Partial dependency overrides for testing (e.g. a fake `fs` and
 *   `execFileAsync` that never touch the real filesystem or spawn a real process). Every field not
 *   present here falls back to {@link realDependencies}'s real implementation.
 * @complexity O(1) to construct.
 */
function createMacOnDeviceTranscriptionPort(overrides?: Partial<MacTranscriberDeps>): TranscriptionPort {
  const deps: MacTranscriberDeps = { ...realDependencies(), ...(overrides || {}) };
  return {
    isAvailable: () => checkAvailability(deps),
    transcribe: (wavBuffer) => transcribeWav(wavBuffer, deps),
  };
}

export {
  createMacOnDeviceTranscriptionPort,
  ensureHelperCompiled,
  checkAvailability,
  transcribeWav,
  parseHelperJson,
  DEFAULT_SOURCE_PATH,
  DEFAULT_BINARY_PATH,
};
export type { AvailabilityDeps, CompileDeps, CompileResult, HelperPayload, MacTranscriberDeps, SpawnResult, TranscriberFs };
