import fs from "node:fs";
import path from "node:path";

import type { ServerLogEntry } from "./log-buffer.js";

/**
 * @file Persisted tail of the server log buffer (slice L2, gap A-04): one JSON entry per line in
 * `<file>`, rotated to `<file>.1` at a size cap, so recent errors survive a crash/restart and so a
 * SECOND process (the agent daemon, where the daemon-path chat tool runs) can read what the main
 * process captured. Generic — moves to `@jini-ai/diagnostics` with the buffer.
 *
 * One writer per file: only the process that owns the console tee writes; readers only read. Entries
 * arrive already redacted from the buffer, so nothing unredacted ever reaches disk.
 *
 * Writes are synchronous, like `console.*` itself to a file or pipe, so a crash right after an error
 * line still leaves that line on disk. A write failure (disk full, permissions) silently disables
 * the sink: it must never log about itself, because its own log line would come straight back here.
 */

export const DEFAULT_LOG_FILE_MAX_BYTES = 5_000_000;
export const DEFAULT_LOG_TAIL_BYTES = 2_000_000;

/** The filesystem calls the sink and reader need; injectable so rotation is testable in memory. */
export interface LogFileFsPort {
  appendFile(filePath: string, data: string): void;
  /** Size in bytes, or null when the file does not exist. */
  size(filePath: string): number | null;
  rename(from: string, to: string): void;
  mkdirp(dir: string): void;
  /** The last `maxBytes` of the file as UTF-8, or null when it does not exist. */
  readTail(filePath: string, maxBytes: number): string | null;
}

export const nodeLogFileFs: LogFileFsPort = {
  appendFile: (filePath, data) => fs.appendFileSync(filePath, data, { mode: 0o600 }),
  size: filePath => {
    try { return fs.statSync(filePath).size; } catch { return null; }
  },
  rename: (from, to) => fs.renameSync(from, to),
  mkdirp: dir => { fs.mkdirSync(dir, { recursive: true }); },
  readTail: (filePath, maxBytes) => {
    let fd: number;
    try { fd = fs.openSync(filePath, "r"); } catch { return null; }
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, maxBytes);
      const bytes = Buffer.alloc(length);
      fs.readSync(fd, bytes, 0, length, size - length);
      return bytes.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  },
};

export interface LogFileSink {
  write(entry: ServerLogEntry): void;
  /** False once a write has failed; the sink then drops everything. */
  isHealthy(): boolean;
}

/**
 * Appends entries as JSON lines, rotating `<file>` to `<file>.1` (replacing any older `.1`) before
 * a write would push it past `maxBytes`. At most about 2 x maxBytes on disk.
 * @param required The log file path.
 * @param optional Size cap and filesystem port.
 * @returns The sink.
 * @complexity O(entry size) per write; one stat at creation.
 */
export function createRotatingLogFileSink(required: { filePath: string }, optional: { maxBytes?: number; fs?: LogFileFsPort } = {}): LogFileSink {
  const io = optional.fs ?? nodeLogFileFs;
  const maxBytes = optional.maxBytes ?? DEFAULT_LOG_FILE_MAX_BYTES;
  let healthy = true;
  let size: number | null = null;
  return {
    write(entry) {
      if (!healthy) return;
      try {
        if (size === null) {
          io.mkdirp(path.dirname(required.filePath));
          size = io.size(required.filePath) ?? 0;
        }
        const line = `${JSON.stringify(entry)}\n`;
        const lineBytes = Buffer.byteLength(line);
        if (size > 0 && size + lineBytes > maxBytes) {
          io.rename(required.filePath, `${required.filePath}.1`);
          size = 0;
        }
        io.appendFile(required.filePath, line);
        size += lineBytes;
      } catch {
        healthy = false;
      }
    },
    isHealthy: () => healthy,
  };
}

function isEntry(value: unknown): value is ServerLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.seq === "number" && typeof e.at === "string" && typeof e.level === "string" && typeof e.source === "string" && typeof e.message === "string";
}

function parseLines(text: string, dropFirst: boolean): ServerLogEntry[] {
  const lines = text.split("\n");
  // A tail read usually starts mid-line; that first fragment is not a whole entry.
  if (dropFirst) lines.shift();
  const out: ServerLogEntry[] = [];
  for (const line of lines) {
    if (line === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isEntry(parsed)) out.push(parsed);
    } catch {
      // A torn final line from a crash mid-write is skipped, not fatal.
    }
  }
  return out;
}

/**
 * Reads the newest entries from `<file>.1` then `<file>`, at most `maxBytes` in total.
 * @param required The log file path.
 * @param optional Byte budget, entry cap and filesystem port.
 * @returns Entries oldest first, or null when neither file exists.
 * @complexity O(maxBytes).
 */
export function readLogFileTail(required: { filePath: string }, optional: { maxBytes?: number; maxEntries?: number; fs?: LogFileFsPort } = {}): ServerLogEntry[] | null {
  const io = optional.fs ?? nodeLogFileFs;
  const budget = optional.maxBytes ?? DEFAULT_LOG_TAIL_BYTES;
  const currentSize = io.size(required.filePath);
  const rotatedPath = `${required.filePath}.1`;
  const rotatedSize = io.size(rotatedPath);
  if (currentSize === null && rotatedSize === null) return null;
  const current = currentSize === null ? [] : parseLines(io.readTail(required.filePath, budget) ?? "", currentSize > budget);
  const remaining = budget - Math.min(currentSize ?? 0, budget);
  const rotated = rotatedSize === null || remaining <= 0 ? [] : parseLines(io.readTail(rotatedPath, remaining) ?? "", rotatedSize > remaining);
  const all = [...rotated, ...current];
  return optional.maxEntries === undefined ? all : all.slice(-optional.maxEntries);
}
