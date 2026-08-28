/**
 * @file A comments-scoped body sanitizer (SPEC-033 Non-Goals — no shared core `text` library
 * exists anywhere in this codebase for this to extract into; ADR-031 §2/§4's "core `text`
 * library" reference is design-forward, not something this spec can reuse). Strips HTML tags
 * entirely (comments render as plain text, never `dangerouslySetInnerHTML`-equivalent raw HTML on
 * any read path this spec builds) and collapses excess whitespace. Bounded, non-Turing-complete —
 * a fixed regex pass, not a parser.
 */
const TAG_PATTERN = /<[^>]*>/g;
const EXCESS_WHITESPACE = /[ \t]{2,}/g;
const EXCESS_BLANK_LINES = /\n{3,}/g;

export function sanitizeCommentBody(raw: string): string {
  return raw
    .replace(TAG_PATTERN, "")
    .replace(EXCESS_WHITESPACE, " ")
    .replace(EXCESS_BLANK_LINES, "\n\n")
    .trim();
}

const LINK_PATTERN = /https?:\/\/\S+/gi;

export function countLinks(text: string): number {
  return (text.match(LINK_PATTERN) ?? []).length;
}
