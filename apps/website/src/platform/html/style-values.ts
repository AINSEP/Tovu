import type { JsonValue } from "@jini-ai/core/primitives";

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
 * Platform library, no I/O — pure functions over already-extracted strings. The `text-align` and
 * `aspect-ratio` allowlists (`safeTextAlign`, `safeAspectRatio`) live in `@jini-ai/cms/html/style-values`.
 */

/**
 * Allowlisted CSS color forms an author-supplied `color` (highlight/text-color/background-color
 * marks, 2026-08-11) may take before it reaches public HTML inside a `style=""` attribute — the
 * same "collapse anything unrecognized rather than splice an arbitrary string into markup"
 * discipline {@link safeHref} applies to link hrefs (C7), adapted for CSS instead of a URL scheme.
 *
 * Accepts: 3/4/6/8-digit hex (`#abc`, `#aabbcc`, `#aabbccdd`); a bare alphabetic keyword up to 20
 * chars (`red`, `transparent`, `currentcolor` — an unrecognized keyword is simply invalid CSS the
 * browser ignores, not an injection vector, so this doesn't need a fixed keyword allowlist); or one
 * of the five functional notations Tiptap's own Color/Highlight pickers can produce (`rgb`/`rgba`/
 * `hsl`/`hsla`/`oklch`), with the characters INSIDE the parens restricted to digits/`%`/`.`/`,`/
 * whitespace/`/` (the last for `oklch(l c h / a)`'s alpha slot) — no nested `(`, no `url(`, no `;`,
 * no backslash, so nothing here can break out of the `style` attribute's value or smuggle a second
 * CSS declaration. Returns `null` (not `"#"` — there is no safe placeholder color to fall back to)
 * so every caller omits the attribute entirely on a rejected value, same as {@link renderImageTag}'s
 * own "omit rather than emit a malformed/placeholder attribute" rule.
 */
const CSS_COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20}|(?:rgb|rgba|hsl|hsla|oklch)\([0-9.%,\s/]{1,80}\))$/;

export function safeCssColor({ value }: { value: JsonValue | undefined }, _optional = {}): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();
  return CSS_COLOR_PATTERN.test(color) ? color : null;
}

/**
 * Allowlisted CSS `font-family` values (2026-08-11) — same "collapse anything unrecognized" rule
 * {@link safeCssColor} states for itself, adapted for a font stack instead of a color: the admin
 * toolbar's own control is a closed `<select>` of preset stacks, so this exists purely as
 * defense-in-depth against `bodyJson` written some other way. Restricted to letters/digits/
 * whitespace/comma/hyphen/single-or-double-quote — enough to express a real comma-separated font
 * stack with quoted multi-word names (`"Courier New", monospace`) but no `(`, `;`, `<`, `>`, or
 * backslash, so nothing here can break out of the `style=""` attribute value or smuggle a second
 * declaration. The value is ALSO run through {@link escapeHtml} at the call site (same double-layer
 * discipline the `link` case's `href` already gets) since a quoted font name legitimately contains
 * `"`, which must become `&quot;` to stay valid inside the double-quoted HTML attribute.
 */
const CSS_FONT_FAMILY_PATTERN = /^[a-zA-Z0-9\s,'".-]{1,200}$/;

export function safeCssFontFamily({ value }: { value: JsonValue | undefined }, _optional = {}): string | null {
  if (typeof value !== "string") return null;
  const fontFamily = value.trim();
  return fontFamily.length > 0 && CSS_FONT_FAMILY_PATTERN.test(fontFamily) ? fontFamily : null;
}

/**
 * Allowlisted CSS length values (2026-08-11) — `font-size`/`line-height`'s shared shape: a bare
 * unitless number (`line-height`'s own idiomatic form, e.g. `"1.5"`) or a number with one of a
 * small set of length units. Same defense-in-depth reasoning as {@link safeCssFontFamily} — the
 * toolbar's own controls are closed `<select>` presets.
 */
const CSS_LENGTH_PATTERN = /^\d{1,4}(\.\d{1,3})?(px|em|rem|%|pt|vh|vw)?$/;

export function safeCssLength({ value }: { value: JsonValue | undefined }, _optional = {}): string | null {
  if (typeof value !== "string") return null;
  const length = value.trim();
  return CSS_LENGTH_PATTERN.test(length) ? length : null;
}

/**
 * Allowlisted `language-*` class token for a `codeBlock` node's `attrs.language`
 * (`@tiptap/extension-code-block-lowlight`, 2026-08-11 — coordinator-approved addition, option (c)
 * of three: store only the language name, emit it as a class, no server-side highlighter
 * dependency; a theme MAY load a client-side highlighter that reads this class, or may not — either
 * way the code still renders as readable monospace). Not validated against lowlight's own
 * registered-language list (unlike the editor's language `<select>`, which only offers names
 * lowlight's `common` grammar set actually registers) — an unrecognized-but-safe token is harmless
 * here, it just never matches a highlighter's own CSS/JS on the public side. Restricted to
 * alphanumeric + hyphen only (matches every real `highlight.js` language/alias name, e.g.
 * `objective-c`, `python-repl`) purely to keep this an inert class token: nothing in this pattern
 * can carry a quote, space, or `<`/`>` that would break out of the `class=""` attribute.
 */
const LANGUAGE_CLASS_PATTERN = /^[a-zA-Z0-9-]{1,32}$/;

export function safeLanguageClass({ value }: { value: JsonValue | undefined }, _optional = {}): string | null {
  if (typeof value !== "string") return null;
  const language = value.trim();
  return LANGUAGE_CLASS_PATTERN.test(language) ? language : null;
}
