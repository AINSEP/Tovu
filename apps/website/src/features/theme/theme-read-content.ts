/**
 * @file The `theme_read_file` tool's input normalisation, window/find selection and UTF-8-safe paging.
 * A verbatim move out of `tool-registrations.ts` (its size ratchet), no behavior change.
 */

import { ToolInputError } from "@jini-ai/core";

import type { ThemeReadSelection } from "@jini-ai/cms/themes/files/read-content";

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
