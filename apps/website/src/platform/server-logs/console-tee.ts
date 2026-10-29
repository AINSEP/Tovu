import { format } from "node:util";
import { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import type { ServerLogBuffer, ServerLogLevel, ServerLogSource } from "./log-buffer.js";

/**
 * @file Formats console output once and redacts it before either the terminal or buffer sees it.
 * Generic (no Tovu concepts) — moves to `@jini-ai/diagnostics` with the buffer.
 *
 * Capture must never break logging: a failing redactor emits a safe placeholder, never raw text;
 * a failing or full buffer can only lose the captured copy, never the original console call.
 */

type ConsoleMethod = "debug" | "log" | "info" | "warn" | "error";

/**
 * Frames child output before invoking the caller's existing redactor, including an unterminated
 * final line. Never closes the parent sink. Oversized lines are discarded whole so cutting a
 * credential before redaction cannot expose a fragment. Redactor failures emit fixed copy.
 * @param required Parent sink and redaction policy; no process globals are read.
 * @param optional Input-line and rendered-line limits, in characters.
 * @returns A writable for one child stream; ending it, or its source unpiping at EOF, flushes the last line.
 * @complexity O(n) time for n input characters; O(maxLineLength) retained space.
 * @example child.stderr.pipe(createRedactedOutputSink({ sink: process.stderr, redact }));
 */
export function createRedactedOutputSink(
  { sink, redact }: { sink: Pick<Writable, "write">; redact: (text: string) => string },
  { maxLineLength = 65_536, maxLength = 2_000 }: { maxLineLength?: number; maxLength?: number } = {},
): Writable {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let oversized = false;
  const emit = () => {
    let safe = "[output redaction failed]";
    try { safe = oversized ? "[oversized output line omitted]" : redact(pending); }
    catch { /* Raw child bytes must never be the fallback. */ }
    if (safe) sink.write(`${safe.slice(0, maxLength)}\n`);
    pending = "";
    oversized = false;
  };
  const append = (text: string) => {
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf("\n", start);
      const end = newline === -1 ? text.length : newline;
      if (!oversized && pending.length + end - start > maxLineLength) { pending = ""; oversized = true; }
      if (!oversized) pending += text.slice(start, end);
      if (newline === -1) return;
      emit();
      start = newline + 1;
    }
  };
  const flush = () => { append(decoder.end()); if (pending || oversized) emit(); };
  const writable = new Writable({
    write(chunk: Buffer, _encoding, done) { append(decoder.write(chunk)); done(); },
    final(done) { flush(); done(); },
  });
  // A source piped with { end: false } (Jini's daemon adapter keeps host sinks open across respawns)
  // never calls end(); its EOF only unpipes, and the unterminated last line is often the native crash.
  writable.on("unpipe", flush);
  return writable;
}

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
