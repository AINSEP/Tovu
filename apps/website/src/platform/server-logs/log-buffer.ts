/**
 * @file In-memory ring buffer of recent server log lines (2026-10-05 big-chat-capabilities plan,
 * slice L1, gap A-04 "Show me recent server errors").
 *
 * Why it exists: the server writes with bare `console.*` and nothing kept that output — recent
 * errors only existed in a terminal nobody (and no chat tool) could query. This buffer keeps the
 * last N lines in memory so `features/server-logs/` can answer "what went wrong" from the admin UI
 * and from the assistant chat.
 *
 * Generic, not Tovu-specific: nothing here knows about sites, workspaces or the admin. It belongs in
 * `@jini-ai/diagnostics` next to `observability` and should move there once Jini publishing allows.
 *
 * Redaction is applied ON WRITE, never on read: a secret must not sit in memory waiting for a reader
 * to forget the redaction step. The redactor is a required port so a caller cannot build a buffer
 * that skips it by accident.
 */

export type ServerLogLevel = "debug" | "info" | "warn" | "error";

/** Where a line came from: this process (`server`) or a supervised child whose output is piped through it. */
export type ServerLogSource = "server" | "daemon";

export interface ServerLogEntry {
  /** Monotonic within one process; lets a reader page forward without duplicates. */
  readonly seq: number;
  /** ISO-8601 time the line was captured. */
  readonly at: string;
  readonly level: ServerLogLevel;
  readonly source: ServerLogSource;
  /** Already redacted and length-capped. */
  readonly message: string;
}

export interface ServerLogAppendInput {
  readonly level: ServerLogLevel;
  readonly source: ServerLogSource;
  readonly message: string;
}

export interface ServerLogBuffer {
  append(input: ServerLogAppendInput): ServerLogEntry;
  /** Oldest first. A copy: callers may not mutate the buffer through it. */
  entries(): readonly ServerLogEntry[];
  /** Total lines ever appended, including ones already dropped by the caps. */
  appendedCount(): number;
}

export const DEFAULT_MAX_ENTRIES = 2_000;
/** About 2 MB of message text (UTF-16 code units, close enough for a cap). */
export const DEFAULT_MAX_BYTES = 2_000_000;
/** One runaway line (a dumped request body) must not evict the whole buffer. */
export const DEFAULT_MAX_MESSAGE_LENGTH = 8_000;

export interface CreateLogBufferRequired {
  /** Applied to every message before it is stored. */
  readonly redact: (text: string) => string;
}

export interface CreateLogBufferOptional {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly maxMessageLength?: number;
  readonly now?: () => Date;
}

function capMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength)}… [truncated ${message.length - maxLength} chars]`;
}

/**
 * Builds a bounded, redact-on-write log buffer.
 * @param required The redactor every message passes through.
 * @param optional Entry, byte and per-message caps plus a clock seam.
 * @returns The buffer; dropping is oldest-first when either cap is exceeded.
 * @complexity append is amortized O(1) plus the redactor's cost; entries() is O(n).
 * @example createLogBuffer({ redact: text => text }).append({ level: "error", source: "server", message: "boom" });
 */
export function createLogBuffer(required: CreateLogBufferRequired, optional: CreateLogBufferOptional = {}): ServerLogBuffer {
  const maxEntries = Math.max(1, optional.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const maxBytes = Math.max(1, optional.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxMessageLength = Math.max(1, optional.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH);
  const now = optional.now ?? (() => new Date());
  // A plain array with a moving head: shift() on every overflow would be O(n) per append.
  let items: ServerLogEntry[] = [];
  let head = 0;
  let bytes = 0;
  let seq = 0;

  function dropOldest(): void {
    bytes -= items[head].message.length;
    head += 1;
    // Compact once the dead prefix outweighs the live part, keeping memory bounded.
    if (head > 1_024 && head * 2 > items.length) {
      items = items.slice(head);
      head = 0;
    }
  }

  return {
    append(input) {
      seq += 1;
      const entry: ServerLogEntry = {
        seq,
        at: now().toISOString(),
        level: input.level,
        source: input.source,
        message: capMessage(required.redact(input.message), maxMessageLength),
      };
      items.push(entry);
      bytes += entry.message.length;
      while (items.length - head > maxEntries || (bytes > maxBytes && items.length - head > 1)) dropOldest();
      return entry;
    },
    entries: () => items.slice(head),
    appendedCount: () => seq,
  };
}
