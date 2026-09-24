/**
 * @file Allowlists for the small number of author-supplied strings that render.ts (and, later, the
 * other render tiers per architecture-p2-plan-2026-09-24 §D) interpolates directly into a `style="…"`
 * attribute rather than into ordinary HTML text/attribute content. `escapeHtml`/`safeHref` stop
 * attribute BREAKOUT (a stray `"` ending the attribute early); neither stops a value that stays
 * inside the quotes from smuggling a second CSS declaration — `"center;position:fixed"` or
 * `"1;background:url(//evil.example)"` are both syntactically valid *inside* a `style` attribute and
 * pass through `escapeHtml` completely unchanged. The only sound fix for a value that is going to be
 * treated as CSS is an allowlist of the exact CSS values this renderer means to support, not a
 * character-level escape of a language `escapeHtml` was never designed to sanitize.
 *
 * Platform library, no I/O — pure functions over already-extracted strings.
 */

/** The `text-align` keywords render.ts's own align features (TipTap `textAlign` attrs, table-cell
 *  `align`) ever intentionally emit. `"left"` is deliberately excluded: it is the CSS/HTML default,
 *  so {@link safeTextAlign} treats it the same as any other value this renderer doesn't recognize —
 *  the caller emits nothing rather than a redundant `text-align:left`. */
const TEXT_ALIGN_VALUES = new Set(["center", "right", "justify"]);

/**
 * Validate a `textAlign`-shaped value against the fixed set of keywords render.ts ever means to emit
 * as an inline `text-align` declaration.
 *
 * @param value - The raw, author-controlled string (a doc node's `attrs.textAlign`/`attrs.align`).
 * @returns The value itself, narrowed, when it is exactly one of the three keywords; `null` for
 * `"left"`, any unrecognized keyword, and any value carrying extra CSS (`"center;position:fixed"`).
 * @complexity O(1).
 * @example safeTextAlign("center"); // => "center"
 * @example safeTextAlign("center;position:fixed"); // => null
 * @example safeTextAlign("left"); // => null (the default — the caller omits the attribute)
 */
export function safeTextAlign(value: string): "center" | "right" | "justify" | null {
  return TEXT_ALIGN_VALUES.has(value) ? (value as "center" | "right" | "justify") : null;
}

/**
 * An `aspect-ratio` value shaped like CSS's own `<number> / <number>` (1 to 4 digits either side of
 * the slash, an optional 1-4 digit decimal fraction, optional whitespace around the slash). Anchored
 * at both ends so a value that starts with a legitimate ratio and then smuggles a second declaration
 * (`"1/1;position:fixed"`) fails the match as a whole, rather than matching a leading substring.
 */
const ASPECT_RATIO_PATTERN = /^\d{1,4}(\.\d{1,4})?\s*\/\s*\d{1,4}(\.\d{1,4})?$/;

/**
 * Validate an `aspect-ratio`-shaped value (render.ts's `mediaPlaceholder` `props.ratio`).
 *
 * @param value - The raw, author-controlled string.
 * @returns The value unchanged when it matches {@link ASPECT_RATIO_PATTERN} in full; `null`
 * otherwise, including a value that merely starts with a valid ratio.
 * @complexity O(n) in the string length (regex match).
 * @example safeAspectRatio("4 / 3"); // => "4 / 3"
 * @example safeAspectRatio("1;background:url(//evil.example)"); // => null
 * @example safeAspectRatio("1/1;position:fixed"); // => null
 */
export function safeAspectRatio(value: string): string | null {
  return ASPECT_RATIO_PATTERN.test(value) ? value : null;
}
