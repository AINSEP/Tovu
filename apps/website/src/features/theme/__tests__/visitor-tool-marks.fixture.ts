/**
 * Visitor page tools (dfea76018, SPEC-046) annotate every rendered menu/nav control with exactly
 * three attributes: `data-toolname`, `data-tooldescription`, `data-tool-action`. Byte-exact markup
 * assertions written before that strip them here so they keep pinning the theme's OWN markup
 * (href/rel/target/class/escaping) instead of a hash-derived handle.
 *
 * Stripping cannot hide an escaping bug: the value pattern `[^"<>]*` only matches an already-escaped
 * value, so a raw `"`, `<` or `>` leaves the attribute in place and the exact assertion fails. The
 * marks' own presence and escaping are pinned separately (menu-tree-render.test.ts, "every rendered
 * menu control carries its visitor tool mark").
 */
const VISITOR_TOOL_MARK = / data-tool(?:name|description|-action)="[^"<>]*"/g;

/** `html` with the visitor tool marks removed; `null` stays `null` so "did not render" still fails. */
export function withoutVisitorToolMarks(html: string | null): string | null {
  return html === null ? null : html.replace(VISITOR_TOOL_MARK, "");
}
