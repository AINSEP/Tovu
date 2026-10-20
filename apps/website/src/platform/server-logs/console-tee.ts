import { format } from "node:util";

import type { ServerLogBuffer, ServerLogLevel, ServerLogSource } from "./log-buffer.js";

/**
 * @file Formats console output once and redacts it before either the terminal or buffer sees it.
 * Generic (no Tovu concepts) — moves to `@jini-ai/diagnostics` with the buffer.
 *
 * Capture must never break logging: a failing redactor emits a safe placeholder, never raw text;
 * a failing or full buffer can only lose the captured copy, never the original console call.
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
  /** Applied before both copies; defaults to identity. Redactor failure never exposes raw text. */
  readonly redact?: (text: string) => string;
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
 * The original method receives the formatted, redacted string before the buffer copy is appended.
 * @param required The buffer to append to.
 * @param optional Console to patch (tests), source tag and injected redactor.
 * @returns Uninstall, restoring exactly the methods this call replaced.
 * @complexity O(n) formatting space/time for n output characters, plus the injected redactor and buffer.
 * @example const uninstall = installConsoleTee({ buffer });
 */
export function installConsoleTee(required: InstallConsoleTeeRequired, optional: InstallConsoleTeeOptional = {}): () => void {
  const target = optional.target ?? (console as unknown as TeeableConsole);
  const source = optional.source ?? "server";
  const redact = optional.redact ?? (text => text);
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  for (const method of Object.keys(LEVEL_BY_METHOD) as ConsoleMethod[]) {
    const original = target[method];
    originals.set(method, original);
    target[method] = (...args: unknown[]) => {
      let message = "[log redaction failed]";
      try {
        message = redact(format(...args));
      } catch {
        // Formatting or redaction failure must never send the raw arguments to a log shipper.
      }
      original.call(target, message);
      safeAppend(required.buffer, LEVEL_BY_METHOD[method], source, message);
    };
  }
  return () => {
    for (const [method, original] of originals) target[method] = original;
  };
}
