/**
 * @file The `theme_read_file` tool's input normalisation, window/find selection and UTF-8-safe paging.
 * A verbatim move out of `tool-registrations.ts` (its size ratchet), no behavior change.
 */

import { ToolInputError } from "@jini-ai/core";

export type ThemeReadSelection =
  | { mode: "full" }
  | { mode: "window"; startLine: number; lineCount: number }
  | { mode: "find"; find: string; context: number; startLine: number; lineCount?: number };


/** Clamp oversized integer context at the gate, preserving invalid values for normal validation.
 * @returns Unchanged input or a copy with a per-item normalization note; performs no I/O.
 * @complexity O(k) for copying k fields only when clamping.
 */
export function normalizeThemeReadInput(
  { input }: { input: Readonly<Record<string, unknown>> },
  _options: Record<string, never> = {},
) {
  const context = input.context;
  if (typeof context !== 'number' || !Number.isInteger(context) || context <= 20) return { input, notes: [] };
  // MOVE: a generous context request should still read the file within the published item budget.
  return { input: { ...input, context: 20 }, notes: ['context clamped to 20 (maximum)'] };
}

/**
 * Reads an optional integer selector from tool input and enforces its published bounds.
 * @param required.input - Raw tool input.
 * @param required.key - Selector name.
 * @param required.minimum - Inclusive lower bound.
 * @param required.maximum - Inclusive upper bound (Infinity for an unbounded start line).
 * @returns The integer, or undefined when omitted.
 * @throws {ToolInputError} For an invalid type, fraction or out-of-range value.
 * @complexity O(1).
 */
export function optionalThemeReadInteger(
  { input, key, minimum, maximum }: { input: Record<string, unknown>; key: string; minimum: number; maximum: number },
  _optional = {}
): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    const range = maximum === Infinity ? `>= ${minimum}` : `from ${minimum} to ${maximum}`;
    throw new ToolInputError({ message: `theme_read_file: ${key} must be an integer ${range}.` });
  }
  return value;
}

/**
 * Validates selection options before reading a file, choosing full, window or substring mode.
 * @param input - Raw input; windows default to line 1/2000 lines, find context to 3.
 * @returns A mutually exclusive selection with validated limits.
 * @throws {ToolInputError} For invalid selectors.
 * @complexity O(1).
 */
export function themeReadSelection(input: Record<string, unknown>): ThemeReadSelection {
  const hasWindow = input.startLine !== undefined || input.lineCount !== undefined;
  if (input.find !== undefined && (typeof input.find !== "string" || input.find.length > 200)) {
    throw new ToolInputError({ message: "theme_read_file: find must be a string of at most 200 characters." });
  }
  const startLine = optionalThemeReadInteger({ input, key: "startLine", minimum: 1, maximum: Infinity }) ?? 1;
  const lineCount = optionalThemeReadInteger({ input, key: "lineCount", minimum: 1, maximum: 2000 });
  const context = optionalThemeReadInteger({ input, key: "context", minimum: 0, maximum: 20 }) ?? 3;
  if (typeof input.find === "string") return { mode: "find", find: input.find, context, startLine, lineCount };
  if (hasWindow) return { mode: "window", startLine, lineCount: lineCount ?? 2000 };
  return { mode: "full" };
}

/** One merged `[start, end)` line interval of a find result. */
interface ThemeReadWindow {
  start: number;
  end: number;
}

/**
 * Finds up to 50 matching lines and merges overlapping or adjacent context intervals.
 * Caps each window at 2,000 characters and each result at 4,000; the existing 20-item
 * batch limit therefore bounds find content at 80,000 characters per batch.
 * @param required.lines - File lines retaining their original terminators.
 * @param required.options - Validated substring and context count.
 * @returns Text in file order, capped match count, overflow signal and narrowing hint when cut.
 * @complexity O(b) time/space in file text size; returned text is bounded even for minified lines.
 */
function findThemeReadWindows(
  { lines, options }: { lines: string[]; options: Extract<ThemeReadSelection, { mode: "find" }> },
  _optional = {}
) {
  const found = collectThemeReadMatches({ lines, options });
  const rendered = renderThemeReadWindows({ lines, windows: found.windows, find: options.find });
  const truncated = found.truncated || rendered.truncated;
  return {
    content: rendered.content,
    returned: { matches: found.matches, truncated,
      ...(truncated ? { hint: "Search results were truncated; narrow the find pattern and reduce context." } : {}),
    },
  };
}

/**
 * The find pass of {@link findThemeReadWindows}: every matching line inside the selected range (up
 * to 50; a 51st sets `truncated`), each widened by `context` lines clamped to the range, merged
 * into file-ordered windows.
 * @complexity O(r) in the selected range's line count.
 */
function collectThemeReadMatches(required: { lines: string[]; options: Extract<ThemeReadSelection, { mode: "find" }> }): {
  windows: ThemeReadWindow[];
  matches: number;
  truncated: boolean;
} {
  const { lines, options } = required;
  const windows: ThemeReadWindow[] = [];
  let matches = 0;
  const rangeStart = options.startLine - 1;
  const rangeEnd = Math.min(lines.length, options.lineCount === undefined ? lines.length : rangeStart + options.lineCount);
  for (let index = rangeStart; index < rangeEnd; index++) {
    if (!lines[index]?.includes(options.find)) continue;
    if (matches === 50) return { windows, matches, truncated: true };
    matches++;
    mergeThemeReadWindow({
      windows,
      window: { start: Math.max(rangeStart, index - options.context), end: Math.min(rangeEnd, index + options.context + 1) },
    });
  }
  return { windows, matches, truncated: false };
}

/**
 * Append `window` to the file-ordered `windows`, extending the last one instead when the two overlap
 * or touch. Mutates `windows` (the caller's own accumulator).
 * @complexity O(1).
 */
function mergeThemeReadWindow(required: { windows: ThemeReadWindow[]; window: ThemeReadWindow }): void {
  const { windows, window } = required;
  const previous = windows.at(-1);
  if (previous && window.start <= previous.end) previous.end = window.end;
  else windows.push(window);
}

/**
 * The text pass of {@link findThemeReadWindows}: join each window's lines, capping each at 2,000
 * characters and the whole result at 4,000. `truncated` when any text was cut or windows remained.
 * @complexity O(b) in the windows' text size.
 */
function renderThemeReadWindows(required: { lines: string[]; windows: readonly ThemeReadWindow[]; find: string }): {
  content: string;
  truncated: boolean;
} {
  const { lines, windows, find } = required;
  let content = "";
  let truncated = false;
  for (const { start, end } of windows) {
    const limit = Math.min(2_000, 4_000 - content.length);
    if (limit === 0) return { content, truncated: true };
    const text = lines.slice(start, end).join("");
    // Keep the match visible when a minified line or its surrounding context exceeds the cap.
    const offset = text.length > limit ? Math.max(0, text.indexOf(find) - Math.floor(limit / 2)) : 0;
    content += text.slice(offset, offset + limit);
    if (text.length > limit) truncated = true;
  }
  return { content, truncated };
}

/**
 * Selects file text without changing LF/CRLF bytes or inventing a line after a final newline.
 * @param required.content - Complete decoded file text, already checked against the 1 MB read limit.
 * @param required.selection - Validated window or find selection.
 * @returns Selected content, full-file line count and selection metadata. Empty files have 0 lines.
 * @complexity O(b) time and space in the bounded file size; substring length is capped at 200.
 */
export function selectThemeReadContent(
  { content, selection }: { content: string; selection: Exclude<ThemeReadSelection, { mode: "full" }> },
  _optional = {}
) {
  const lines = content.match(/\n|[^\n]+\n?/g) ?? [];
  if (selection.mode === "find") return { ...findThemeReadWindows({ lines, options: selection }), totalLines: lines.length };
  const start = selection.startLine - 1;
  const end = Math.min(lines.length, start + selection.lineCount);
  return { content: lines.slice(start, end).join(""), totalLines: lines.length,
    returned: { startLine: selection.startLine, endLine: end } };
}

/** Whether the byte at `index` sits inside a UTF-8 character rather than starting one. An index at
 * the very end of the text has no byte: that is a boundary, so the answer is no.
 * @complexity O(1). */
function isUtf8ContinuationByte({ bytes, index }: { bytes: Buffer; index: number }, _options = {}): boolean {
  const byte = bytes[index];
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

/** Bound theme read results even when one CSS line fills the whole file. Uses library_read's
 * offset/nextOffset UTF-8 byte convention, retaining whole characters and the small-read shape.
 * @param required.content Selected theme text; offset is validated by the tool boundary.
 * @throws ToolInputError for a cursor outside the selection or inside a UTF-8 character.
 * @complexity O(b) time/space in selected text, bounded by the existing 1 MB file ceiling.
 */
export function pageThemeReadContent({ content, offset }: { content: string; offset: number | undefined }, _options = {}) {
  const bytes = Buffer.from(content, "utf8");
  const start = offset ?? 0;
  if (start > bytes.length || isUtf8ContinuationByte({ bytes, index: start })) {
    throw new ToolInputError({ message: "theme_read_file: offset must be a UTF-8 boundary within the selected text. Use the preceding nextOffset and keep the line selection unchanged." });
  }
  if (offset === undefined && bytes.length <= 4000) return { content };
  let end = Math.min(bytes.length, start + 4000);
  while (end < bytes.length && isUtf8ContinuationByte({ bytes, index: end })) end--;
  const truncated = end < bytes.length;
  return { content: bytes.subarray(start, end).toString("utf8"), offset: start,
    nextOffset: truncated ? end : null, totalBytes: bytes.length, truncated };
}
