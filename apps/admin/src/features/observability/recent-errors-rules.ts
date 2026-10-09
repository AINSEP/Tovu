import type { AdminServerLogEntry } from "@/lib/api";

/**
 * @file Pure shaping for the Recent errors tab: one-line summaries, grouping of repeated errors,
 * shortened file paths for display, and the paste-ready text the Copy button puts on the
 * clipboard. No React, no I/O — `use-recent-server-errors.hooks.ts` calls these once per load.
 *
 * Redaction: every `message` reaching this file was already secret-redacted on write by the
 * server's log buffer (`apps/website/src/platform/server-logs/index.ts`, `redactSecretShapes`).
 * Nothing here un-redacts or re-reads anything, so the copied text carries exactly the same
 * `[REDACTED:…]` markers the screen shows. No second client-side pass: `@jini-ai/core`'s
 * `redactSecrets` also masks IPv4 addresses, which would turn the most useful part of an error
 * like "daemon unreachable at 127.0.0.1:51384" into a marker.
 */

/** A leading `[assistant]`-style tag the server prefixes some lines with. */
const SCOPE_PREFIX = /^\[([^\]\n]{1,40})\]\s*/;
/** A V8 stack frame line (`    at fn (file:1:2)`). */
const STACK_FRAME = /^\s*at\s/;
/** A thrown error's own line (`TypeError: fetch failed`, `Caused by: …`), capturing its text. */
const ERROR_LINE = /^\s*(?:(?:[A-Z][\w$]*)?(?:Error|Exception)|Caused by)\s*:\s*(.+?)\s*$/;
/** Summaries longer than this are cut — they become the toggle button's accessible name. */
export const SUMMARY_MAX_LENGTH = 200;

/**
 * An absolute POSIX path (optionally `file://`), with an optional `:line:col` suffix. The
 * lookbehind keeps it from matching the path part of an `http://host:port/path` URL.
 */
const ABSOLUTE_PATH = /(?<![\w.:/])(?:file:\/\/)?\/(?:[\w.@+-]+\/)+[\w.@+-]+(?::\d+(?::\d+)?)?/g;
/** Folders a repo-relative path starts at; `node_modules` matches its LAST occurrence. */
const REPO_ANCHORS = ["/apps/", "/packages/"] as const;
const HOME_PREFIX = /^\/(?:Users|home)\/[^/]+\//;

export interface ErrorSummary {
  /** The leading `[tag]`, without brackets, or `null`. */
  scope: string | null;
  /** One line: the first line (minus its tag), plus the thrown error's text when it adds any. */
  summary: string;
}

/**
 * One-line summary of a log message, e.g.
 * `"[assistant] agent daemon unreachable at http://127.0.0.1:51384\nTypeError: fetch failed\n    at …"`
 * → `{ scope: "assistant", summary: "agent daemon unreachable at http://127.0.0.1:51384 — fetch failed" }`.
 * @complexity O(n) in the message length.
 */
export function summarizeErrorMessage({ message }: { message: string }): ErrorSummary {
  const lines = message.split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstIndex === -1) return { scope: null, summary: "" };

  const first = lines[firstIndex].trim();
  const scopeMatch = SCOPE_PREFIX.exec(first);
  const headline = scopeMatch ? first.slice(scopeMatch[0].length) : first;
  const cause = findThrownErrorText(lines.slice(firstIndex + 1));
  const joined = !cause || headline.includes(cause) ? headline : headline ? `${headline} — ${cause}` : cause;
  // A line that is ONLY a tag ("[assistant]") with no error text after it keeps the tag visible.
  return { scope: scopeMatch ? scopeMatch[1] : null, summary: truncate(joined || first) };
}

/** The first `XError: text` line before the stack frames begin, or `null`. */
function findThrownErrorText(lines: string[]): string | null {
  for (const line of lines) {
    if (STACK_FRAME.test(line)) return null;
    const match = ERROR_LINE.exec(line);
    if (match) return match[1];
  }
  return null;
}

function truncate(text: string): string {
  return text.length > SUMMARY_MAX_LENGTH ? `${text.slice(0, SUMMARY_MAX_LENGTH - 1)}…` : text;
}

/**
 * Shortens an absolute path for display: from the last `node_modules/`, else from the first
 * `apps/` or `packages/` folder (the repo root is not known to the browser), else `~/` for a
 * home directory. Anything else is returned unchanged. A `:line:col` suffix is kept.
 * @example shortenSourcePath({ path: "/Users/me/Tovu/apps/website/src/a.ts:2:4" }) // "apps/website/src/a.ts:2:4"
 */
export function shortenSourcePath({ path }: { path: string }): string {
  const bare = path.startsWith("file://") ? path.slice("file://".length) : path;
  const nodeModules = bare.lastIndexOf("/node_modules/");
  if (nodeModules !== -1) return bare.slice(nodeModules + 1);
  for (const anchor of REPO_ANCHORS) {
    const index = bare.indexOf(anchor);
    if (index !== -1) return bare.slice(index + 1);
  }
  return bare.replace(HOME_PREFIX, "~/");
}

/** A run of message text; `fullPath` is set when `text` is a shortened file path. */
export interface ErrorMessageSegment {
  text: string;
  fullPath?: string;
}

/**
 * Splits a message into plain runs and shortened paths, so the panel can show the short form
 * with the full path in a `title`. Paths that do not shorten stay part of the plain text.
 * @complexity O(n) in the message length.
 */
export function segmentErrorPaths({ message }: { message: string }): ErrorMessageSegment[] {
  const segments: ErrorMessageSegment[] = [];
  let plain = "";
  let cursor = 0;
  for (const match of message.matchAll(ABSOLUTE_PATH)) {
    const fullPath = match[0];
    const short = shortenSourcePath({ path: fullPath });
    plain += message.slice(cursor, match.index);
    cursor = match.index + fullPath.length;
    if (short === fullPath) {
      plain += fullPath;
      continue;
    }
    if (plain) segments.push({ text: plain });
    segments.push({ text: short, fullPath });
    plain = "";
  }
  plain += message.slice(cursor);
  if (plain) segments.push({ text: plain });
  return segments;
}

/** An ISO-8601 timestamp, e.g. `2026-10-09T01:04:17.785Z`. */
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
/**
 * A labeled per-request id (`requestId: 'abc'`, `"request_id":"abc"`, `traceId=abc`): the label is
 * kept, the value dropped. The `:`/`=` is required so prose ("request id was missing") is untouched.
 */
const LABELED_REQUEST_ID = /\b((?:request|req|trace|correlation)[-_ ]?id\b["']?\s*[:=]\s*["']?)[\w.-]+/gi;

/**
 * The part of a message that identifies WHICH error it is, for grouping: stack-frame lines are
 * dropped (the same failure reached from two call sites — e.g. `proxyPassthrough` and
 * `respondWithEnrichedAgentList` both hitting "agent daemon unreachable" — differs only there),
 * as are timestamps and labeled request/trace ids. Everything else is kept verbatim: the tag,
 * the headline, ports, paths outside stack frames, and the `[cause]` block (`code: 'ECONNREFUSED'`).
 * @complexity O(n) in the message length.
 */
export function normalizeErrorMessage({ message }: { message: string }): string {
  return message
    .split(/\r?\n/)
    .filter((line) => !STACK_FRAME.test(line))
    .map((line) => line.replace(ISO_TIMESTAMP, "<time>").replace(LABELED_REQUEST_ID, "$1<id>").trimEnd())
    .join("\n");
}

/** One distinct error (same source and normalized message) and how often it appeared in the window. */
export interface RecentErrorGroup {
  /** Stable across reloads: the same error keeps the same key, so an open row stays open. */
  key: string;
  latest: AdminServerLogEntry;
  earliest: AdminServerLogEntry;
  count: number;
}

/**
 * Groups the same error (same `source` and `normalizeErrorMessage` text — the `[tag]` is part of
 * that text), newest occurrence first. Grouping by the raw message split one visible error into
 * several rows whenever only its stack frames differed. Anything else that differs — a port, a
 * path in the headline, an error code — stays separate: merging "similar" errors could hide a
 * different failure behind a count. `latest` keeps the newest occurrence's full message for Copy.
 * @param required `entries` oldest first, as the server returns them.
 * @complexity O(n) time and space.
 */
export function groupErrorEntries({ entries }: { entries: readonly AdminServerLogEntry[] }): RecentErrorGroup[] {
  const groups = new Map<string, RecentErrorGroup>();
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const key = `${entry.source}\u0000${normalizeErrorMessage({ message: entry.message })}`;
    const existing = groups.get(key);
    if (existing) {
      existing.earliest = entry;
      existing.count += 1;
    } else {
      groups.set(key, { key, latest: entry, earliest: entry, count: 1 });
    }
  }
  return [...groups.values()];
}

/**
 * The paste-ready block the Copy button puts on the clipboard: ISO time, source, how often, and
 * the FULL message with unshortened paths (the reader of a paste needs the real paths).
 * Deliberately English and not localized: it is a log record for pasting into a chat or issue,
 * like the server's own log text, not on-screen copy.
 */
export function formatErrorCopyText({ group }: { group: RecentErrorGroup }): string {
  const { latest, earliest, count } = group;
  const lines = [`Time: ${latest.at}`, `Source: ${latest.source}`];
  if (count > 1) lines.push(`Occurrences: ${count} (first ${earliest.at}, last ${latest.at})`);
  lines.push("Message:", latest.message);
  return lines.join("\n");
}
