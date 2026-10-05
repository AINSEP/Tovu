import path from "node:path";
import { format } from "node:util";

import { redactSecretShapes } from "#src/contracts/core/secret-redaction";

import { installConsoleTee } from "./console-tee.js";
import { createLogBuffer, DEFAULT_MAX_ENTRIES, type ServerLogBuffer, type ServerLogEntry, type ServerLogSource } from "./log-buffer.js";
import { createRotatingLogFileSink, readLogFileTail, type LogFileFsPort } from "./log-file.js";

export { installConsoleTee, type TeeableConsole } from "./console-tee.js";
export { createLogBuffer, DEFAULT_MAX_BYTES, DEFAULT_MAX_ENTRIES, type ServerLogAppendInput, type ServerLogBuffer, type ServerLogEntry, type ServerLogLevel, type ServerLogSource } from "./log-buffer.js";
export { createRotatingLogFileSink, readLogFileTail, type LogFileFsPort } from "./log-file.js";

/**
 * @file The ONE process-wide server log buffer. Console is process-global, so its capture is too:
 * boot installs the tee once per process, and every reader (the admin route and the
 * `system_read_server_logs` chat tool) reads through `readProcessServerLogs`.
 *
 * Redaction uses Tovu's `redactSecretShapes` (secret VALUES only — paths, ids and prose stay
 * readable, per that helper's 2026-09-16 owner ruling).
 *
 * Two processes, two files, one log (L2): the main server (`index.ts`, `cli serve`) writes
 * `<site>/ops/logs/server.log`; the agent daemon (`agent-daemon-server.ts`, where the daemon-path
 * chat tool runs) writes `<site>/ops/logs/daemon.log`. One writer per file, so rotation never races.
 * Readers in either process merge both files by time, so each sees the whole picture, including
 * lines from before a crash/restart. Each process tees its OWN console because that is the only
 * place the real level is known: the daemon logs routine breadcrumbs with `console.error`, and its
 * piped stderr alone cannot tell those apart from real errors. The in-memory buffer is the fallback
 * when no file is attached (memory-DB runs, tests).
 */

let processBuffer: ServerLogBuffer | null = null;
let uninstallCapture: (() => void) | null = null;
let readFilePaths: readonly string[] = [];
let detachFile: (() => void) | null = null;

/** Created lazily so a test or tool that only reads gets an empty buffer, never a crash. */
export function getServerLogBuffer(): ServerLogBuffer {
  processBuffer ??= createLogBuffer({ redact: text => redactSecretShapes({ text }).text });
  return processBuffer;
}

/** True once boot has installed the console tee in this process. */
export function isServerLogCaptureInstalled(): boolean {
  return uninstallCapture !== null;
}

/**
 * Starts copying this process's console output into the process buffer, plus a fatal uncaught
 * exception (which Node prints without going through `console`). `uncaughtExceptionMonitor` only
 * observes: Node's default crash behavior is unchanged. Idempotent.
 * @param optional Which process this is (default "server").
 * @returns Uninstall (tests only; production keeps capture for the process lifetime).
 * @complexity O(1).
 */
export function installServerLogCapture(optional: { source?: ServerLogSource } = {}): () => void {
  if (uninstallCapture === null) {
    const source = optional.source ?? "server";
    const buffer = getServerLogBuffer();
    const untee = installConsoleTee({ buffer }, { source });
    const onFatal = (err: unknown) => {
      try { buffer.append({ level: "error", source, message: `[uncaughtException] ${format(err)}` }); } catch { /* never mask the crash */ }
    };
    process.on("uncaughtExceptionMonitor", onFatal);
    uninstallCapture = () => { untee(); process.off("uncaughtExceptionMonitor", onFatal); };
  }
  return () => {
    uninstallCapture?.();
    uninstallCapture = null;
  };
}

/** `<siteDir>/ops/logs/{server,daemon}.log` — the one place both processes agree the logs live. */
export function serverLogFilePaths(required: { siteDir: string }): Record<ServerLogSource, string> {
  const dir = path.join(required.siteDir, "ops", "logs");
  return { server: path.join(dir, "server.log"), daemon: path.join(dir, "daemon.log") };
}

/**
 * Persists every buffered line to this process's rotating log file, starting with the lines already
 * buffered before the site directory was known; reads then merge `filePath` with `alsoRead` (the
 * other process's file). Idempotent: a second call is ignored.
 * @param required This process's own log file (from `serverLogFilePaths`).
 * @param optional The other process's log file(s) and a filesystem port (tests).
 * @returns Detach (tests only).
 * @complexity O(buffered lines) once, then O(1) per line.
 */
export function attachServerLogFile(required: { filePath: string }, optional: { alsoRead?: readonly string[]; fs?: LogFileFsPort } = {}): () => void {
  if (detachFile === null) {
    const sink = createRotatingLogFileSink({ filePath: required.filePath }, { fs: optional.fs });
    const buffer = getServerLogBuffer();
    for (const entry of buffer.entries()) sink.write(entry);
    const unsubscribe = buffer.subscribe(entry => sink.write(entry));
    readFilePaths = [required.filePath, ...(optional.alsoRead ?? [])];
    detachFile = () => { unsubscribe(); readFilePaths = []; detachFile = null; };
  }
  return () => detachFile?.();
}

/**
 * Reads this process's view of the server log: the attached log files merged by time when attached,
 * otherwise the in-memory buffer.
 * @param optional Filesystem port (tests).
 * @returns Entries oldest first (at most the buffer cap), and whether anything is recording them.
 * @complexity O(tail bytes x files) plus an O(n log n) merge.
 */
export function readProcessServerLogs(optional: { fs?: LogFileFsPort } = {}): { entries: readonly ServerLogEntry[]; capturing: boolean } {
  if (readFilePaths.length > 0) {
    const perFile = readFilePaths.map(filePath => readLogFileTail({ filePath }, { maxEntries: DEFAULT_MAX_ENTRIES, fs: optional.fs }));
    // ISO-8601 UTC strings sort lexically; the stable sort keeps each file's own order for ties.
    const merged = perFile.flatMap(entries => entries ?? []).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return { entries: merged.slice(-DEFAULT_MAX_ENTRIES), capturing: perFile.some(entries => entries !== null) };
  }
  return { entries: getServerLogBuffer().entries(), capturing: isServerLogCaptureInstalled() };
}
