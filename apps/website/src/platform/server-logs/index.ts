import { redactSecretShapes } from "#src/contracts/core/secret-redaction";

import { installConsoleTee } from "./console-tee.js";
import { createLogBuffer, type ServerLogBuffer } from "./log-buffer.js";

export { createLineCaptureStream, installConsoleTee, type TeeableConsole } from "./console-tee.js";
export { createLogBuffer, DEFAULT_MAX_BYTES, DEFAULT_MAX_ENTRIES, type ServerLogAppendInput, type ServerLogBuffer, type ServerLogEntry, type ServerLogLevel, type ServerLogSource } from "./log-buffer.js";

/**
 * @file The ONE process-wide server log buffer. Console is process-global, so its capture is too:
 * boot (`index.ts` and `cli/commands/serve.ts`) installs the tee once, and every reader (the admin
 * route and the `system_read_server_logs` chat tool on the BYOK path) reads this same buffer.
 *
 * Redaction uses Tovu's `redactSecretShapes` (secret VALUES only — paths, ids and prose stay
 * readable, per that helper's 2026-09-16 owner ruling).
 */

let processBuffer: ServerLogBuffer | null = null;
let uninstallTee: (() => void) | null = null;

/** Created lazily so a test or tool that only reads gets an empty buffer, never a crash. */
export function getServerLogBuffer(): ServerLogBuffer {
  processBuffer ??= createLogBuffer({ redact: text => redactSecretShapes({ text }).text });
  return processBuffer;
}

/** True once boot has installed the console tee in this process. */
export function isServerLogCaptureInstalled(): boolean {
  return uninstallTee !== null;
}

/**
 * Starts copying this process's console output into the process buffer. Idempotent: a second call
 * is a no-op, so the two boot paths cannot double-capture if one ever calls the other.
 * @returns Uninstall (tests only; production keeps capture for the process lifetime).
 * @complexity O(1).
 */
export function installServerLogCapture(): () => void {
  uninstallTee ??= installConsoleTee({ buffer: getServerLogBuffer() });
  return () => {
    uninstallTee?.();
    uninstallTee = null;
  };
}
