/**
 * @file The only concrete {@link TranscriptionPort} (see `transcription-port.cjs`) that exists
 * today: macOS's own on-device `Speech` framework, reached by spawning
 * `tovu-speech-helper.swift`'s compiled binary as a child process — the same "spawn a small CLI,
 * read its stdout" shape `tovu-server.cjs` already uses for `tovu serve`.
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

const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const DEFAULT_SOURCE_PATH = path.join(__dirname, "tovu-speech-helper.swift");
const DEFAULT_BINARY_PATH = path.join(__dirname, ".build", "tovu-speech-helper");

/**
 * Compiles the helper if it is not already built. A no-op (`{ok: true}`) once the binary exists —
 * this is the "lazy compile" step, not a rebuild-on-every-call step; delete `.build/` to force a
 * recompile (e.g. after editing the `.swift` source).
 *
 * @param {Object} deps
 * @param {{existsSync: Function, mkdirSync: Function}} deps.fs
 * @param {(cmd: string, args: string[]) => {status: number|null, stderr: Buffer|string, error?: Error}} deps.spawnSync
 * @param {string} deps.sourcePath
 * @param {string} deps.binaryPath
 * @returns {{ok: true} | {ok: false, error: string}}
 * @complexity O(1) plus `swiftc`'s own compile cost on a cache miss.
 */
function ensureHelperCompiled({ fs, spawnSync, sourcePath, binaryPath }) {
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
 * @param {string} stdout
 * @returns {Object}
 * @complexity O(n) in `stdout`'s length (JSON.parse's own cost).
 */
function parseHelperJson(stdout) {
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
 * @param {Object} deps
 * @param {(file: string, args: string[]) => Promise<{stdout: string}>} deps.execFileAsync
 * @param {string} deps.binaryPath
 * @param {string[]} deps.args
 * @returns {Promise<Object>}
 * @complexity O(1) beyond the child process's own cost.
 */
async function runHelperJson({ execFileAsync, binaryPath, args }) {
  try {
    const { stdout } = await execFileAsync(binaryPath, args);
    return parseHelperJson(stdout);
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.trim().length > 0) {
      return parseHelperJson(error.stdout);
    }
    throw error;
  }
}

/**
 * The cheap capability probe — compiles the helper if needed, then asks it to check
 * authorization + on-device-recognition support without touching a microphone or any audio file.
 *
 * @param {Object} deps - Same shape `createMacOnDeviceTranscriptionPort` closes over.
 * @returns {Promise<import("./transcription-port.cjs").TranscriptionAvailability>}
 * @complexity O(1) beyond the child process's own cost.
 */
async function checkAvailability(deps) {
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
 * @param {Buffer} wavBuffer
 * @param {Object} deps - Same shape `createMacOnDeviceTranscriptionPort` closes over.
 * @returns {Promise<import("./transcription-port.cjs").TranscriptionResult>}
 * @complexity O(1) beyond the child process's own cost, which scales with clip length.
 */
async function transcribeWav(wavBuffer, deps) {
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
 * @returns {Object} the full dependency bundle {@link checkAvailability}/{@link transcribeWav} need.
 * @complexity O(1).
 */
function realDependencies() {
  // Required lazily (not at module top) so a non-mac platform, which never calls this function,
  // never pays for requiring `node:child_process`'s promisified wrapper either.
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  const fs = require("node:fs");
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
 * `transcription-port.cjs`'s `resolveTranscriptionPort`, which is the one caller that decides
 * platform eligibility before ever reaching this factory.
 *
 * @param {Object} overrides - Partial dependency overrides for testing (e.g. a fake `fs` and
 *   `execFileAsync` that never touch the real filesystem or spawn a real process). Every field not
 *   present here falls back to {@link realDependencies}'s real implementation.
 * @returns {import("./transcription-port.cjs").TranscriptionPort}
 * @complexity O(1) to construct.
 */
function createMacOnDeviceTranscriptionPort(overrides) {
  const deps = { ...realDependencies(), ...(overrides || {}) };
  return {
    isAvailable: () => checkAvailability(deps),
    transcribe: (wavBuffer) => transcribeWav(wavBuffer, deps),
  };
}

module.exports = {
  createMacOnDeviceTranscriptionPort,
  ensureHelperCompiled,
  checkAvailability,
  transcribeWav,
  parseHelperJson,
  DEFAULT_SOURCE_PATH,
  DEFAULT_BINARY_PATH,
};
