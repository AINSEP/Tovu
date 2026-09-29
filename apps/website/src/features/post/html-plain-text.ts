/**
 * @file Plain text out of an `"html"`-format Page's `bodyHtml` (SPEC-047/ADR-056 Decision 3) — the
 * `bodyFormat === "html"` twin of `extractPostPlainText` (`search.ts`) for consumers that must not read
 * the empty `bodyJson` placeholder (`repo.rows.ts`'s `toRecord`). Lives in `post` so both SEO
 * (`features/seo/seo.ts`) and the post tools can use it without an import cycle.
 */

/** Named entities actually observed in stored `bodyHtml` (numeric entities are handled separately
 *  below); extend only as real content demands it rather than pulling in a full HTML5 entity table.
 *  The typographic row came from live `/media` + `/forms` bodies, whose `&mdash;` otherwise survived
 *  decoding and was re-escaped by the head renderer into a literal "&amp;mdash;" snippet. */
const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  middot: "·", bull: "•", copy: "©", reg: "®", trade: "™", times: "×", deg: "°", rarr: "→", larr: "←",
};

/** Decodes `&amp;`/`&#39;`/`&#x27;`-style entities left over after tag-stripping. Unknown or
 *  malformed entities pass through unchanged rather than being dropped. */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] !== "#") return HTML_NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
  });
}

/** Opening tag of any element carrying the `post-detail-header` class (any attribute order/quoting,
 *  extra class names alongside it); group 1 is the tag name used to find its matching close. */
const POST_DETAIL_HEADER_OPEN = /<([a-z][a-z0-9]*)\b[^>]*\bclass\s*=\s*(["'])(?:(?!\2)[\s\S])*\bpost-detail-header\b(?:(?!\2)[\s\S])*\2[^>]*>/i;

/** Index just past the close tag that balances an already-open `tag` starting at `from`, counting
 *  same-name opens/closes so a nested `<div class="post-meta">` inside a `<div>` header does not end
 *  the block early; -1 when the element is never closed.
 *  @complexity O(n) over the remaining html. */
function findBalancedCloseEnd(html: string, tag: string, from: number): number {
  const tagPattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = from;
  let depth = 1;
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return tagPattern.lastIndex;
  }
  return -1;
}

/** Strips every element carrying the `post-detail-header` class — the injected title/date wrapper
 *  (`renderPostDetailHeader` in `render.ts`: `<div class="post-detail-header"><h1>…</h1><div
 *  class="post-meta">…</div></div>`) that the theme prepends ahead of an html-format body's own
 *  prose. Without this, the derived excerpt doubled the title (`/media`'s description started "Media
 *  Media is…"). The close is found by depth-counting same-name tags, not a lazy `</\1>` match, since
 *  the real header nests a `<div>`. An unclosed header is left in place (same as before).
 *  @complexity O(n·h) for h headers; h is 0-1 in practice. */
function stripPostDetailHeader(html: string): string {
  let kept = "";
  let rest = html;
  for (let open = POST_DETAIL_HEADER_OPEN.exec(rest); open; open = POST_DETAIL_HEADER_OPEN.exec(rest)) {
    const contentStart = open.index + open[0].length;
    const end = findBalancedCloseEnd(rest, open[1], contentStart);
    kept += end === -1 ? rest.slice(0, contentStart) : `${rest.slice(0, open.index)} `;
    rest = rest.slice(end === -1 ? contentStart : end);
  }
  return kept + rest;
}

/** Plain-text extraction over a bespoke-HTML Page body (SEO's derived excerpt and `content_post_list`
 *  excerpts, SPEC-047 gap): drops the `.post-detail-header` title/date block and `<style>`/`<script>` blocks wholesale
 *  (never prose) before stripping the remaining tags, so a leading stylesheet — real `bodyHtml` rows
 *  start with one, see `/quickstart` — or the injected header can never surface as the description. */
export function extractPlainTextFromHtml(html: string): string {
  const withoutHeader = stripPostDetailHeader(html);
  const withoutNonProse = withoutHeader.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withoutTags = withoutNonProse.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags);
}
