import { format } from "node:util";

import type { ServerLogBuffer, ServerLogLevel, ServerLogSource } from "./log-buffer.js";

/**
 * @file Copies console output into a `ServerLogBuffer` without changing what the terminal sees. Generic (no Tovu concepts) — moves to `@jini-ai/diagnostics` with the buffer.
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
