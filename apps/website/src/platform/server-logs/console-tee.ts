import { format } from "node:util";
import { Writable } from "node:stream";

import type { ServerLogBuffer, ServerLogLevel, ServerLogSource } from "./log-buffer.js";

/**
 * @file Copies console output and piped child output into a `ServerLogBuffer` without changing what
 * the terminal sees. Generic (no Tovu concepts) — moves to `@jini-ai/diagnostics` with the buffer.
 *
 * Capture must never break logging: every buffer write is wrapped so a failing redactor or a full
 * buffer can only lose the captured copy, never the original console call or the child's output.
 */

type ConsoleMethod = "debug" | "log" | "info" | "warn" | "error";

const LEVEL_BY_METHOD: Record<ConsoleMethod, ServerLogLevel> = {
  debug: "debug", log: "info", info: "info", warn: "warn", error: "error",
};

/** The slice of `console` the tee replaces; injectable so tests never patch the real console. */
export type TeeableConsole = Record<ConsoleMethod, (...args: unknown[]) => void>;

export interface InstallConsoleTeeRequired {
  readonly buffer: ServerLogBuffer;
}

export interface InstallConsoleTeeOptional {
  /** Defaults to the global `console`. */
  readonly target?: TeeableConsole;
  readonly source?: ServerLogSource;
}

function safeAppend(buffer: ServerLogBuffer, level: ServerLogLevel, source: ServerLogSource, message: string): void {
  try {
    buffer.append({ level, source, message });
  } catch {
    // Losing one captured line is acceptable; throwing out of console.error is not.
  }
}

/**
 * Wraps console.debug/log/info/warn/error so each call is also appended to the buffer.
 * The original method still runs first with the original arguments.
 * @param required The buffer to append to.
 * @param optional Console to patch (tests) and the source tag.
 * @returns Uninstall, restoring exactly the methods this call replaced.
 * @complexity O(1) per console call plus util.format of its arguments.
 * @example const uninstall = installConsoleTee({ buffer });
 */
export function installConsoleTee(required: InstallConsoleTeeRequired, optional: InstallConsoleTeeOptional = {}): () => void {
  const target = optional.target ?? (console as unknown as TeeableConsole);
  const source = optional.source ?? "server";
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  for (const method of Object.keys(LEVEL_BY_METHOD) as ConsoleMethod[]) {
    const original = target[method];
    originals.set(method, original);
    target[method] = (...args: unknown[]) => {
      original.apply(target, args);
      safeAppend(required.buffer, LEVEL_BY_METHOD[method], source, format(...args));
    };
  }
  return () => {
    for (const [method, original] of originals) target[method] = original;
  };
}

const MAX_PENDING_LINE = 64_000;

export interface CreateLineCaptureStreamRequired {
  readonly buffer: ServerLogBuffer;
  /** Where the bytes still go (the parent's own stdout/stderr). */
  readonly passThrough: NodeJS.WritableStream;
  readonly level: ServerLogLevel;
  readonly source: ServerLogSource;
}

/**
 * A Writable that forwards every chunk unchanged and appends each complete line to the buffer.
 * Used for a supervised child's piped stdout/stderr, which never passes through this process's
 * console. A partial trailing line is held until its newline (or flushed on end).
 * @param required Buffer, pass-through sink, and the level/source to tag lines with.
 * @returns The stream to hand to the child's `pipe()`.
 * @complexity O(chunk length) per write.
 */
export function createLineCaptureStream(required: CreateLineCaptureStreamRequired): Writable {
  let pending = "";
  const capture = (line: string) => {
    if (line.trim() !== "") safeAppend(required.buffer, required.level, required.source, line);
  };
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      required.passThrough.write(chunk);
      try {
        const lines = (pending + chunk.toString()).split(/\r?\n/);
        pending = lines.pop() ?? "";
        lines.forEach(capture);
        // A child that never writes a newline must not grow this without bound.
        if (pending.length > MAX_PENDING_LINE) { capture(pending); pending = ""; }
      } catch {
        pending = "";
      }
      callback();
    },
    final(callback) {
      capture(pending);
      pending = "";
      callback();
    },
  });
}
