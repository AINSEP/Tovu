/**
 * @file A small, dependency-free HTML pretty-printer for the Pages editor's "HTML" tab.
 *
 * The owner reported the HTML view had "regressed" from a formatted tree back to a wall of text.
 * Checked first (`git log`/repo-wide grep for `prettier`/`js-beautify`/`html-format`/`CodeMirror`,
 * across both Tovu and Jini): no HTML formatter has EVER existed anywhere in this codebase — the
 * only precedent is `packages/ui/src/features/html-editor/css.ts`'s `prettifyCss` in the Jini repo,
 * which formats the CSS half of GrapesJS's export and explicitly argues for a small hand-rolled
 * tokenizer over a real parser or a bundled `prettier` build for exactly this reason: the added
 * weight isn't warranted for a formatting-only pass, and no such dependency exists in either
 * `package.json` in this repo already. This function is that same argument applied to HTML instead
 * of CSS, built fresh in Tovu (not Jini) since the Pages screen is Tovu-only. So the report the
 * owner is remembering is not this codebase — build it anyway, since the request stands regardless.
 *
 * **Why the "wall of text" happens now specifically**: `development/scripts/
 * convert-legacy-doc-pages-to-html.ts` converted several Pages from Tiptap `doc` JSON to raw HTML
 * earlier the same session, and the renderer that produced that HTML emits zero inter-element
 * whitespace (`</h2><h2 id="...">`, `<p>...</p><p>...</p>`, directly concatenated). Hand-authored
 * page bodies with their own existing line breaks were never touched by this gap; only the
 * machine-generated ones show it.
 *
 * **The save-corruption risk, and how this function is constrained to avoid it**: `PageEditor.tsx`
 * wires this into a live, editable textarea, not a read-only viewer, so the formatted text an
 * operator sees IS what can end up saved once they start typing (see that file's own comment on the
 * `draftHtml`/`prevViewRef` wiring for the "view alone never dirties the page" half of that
 * decision). Whitespace injected purely for readability must therefore never change what a visitor
 * sees when the result is saved. This function is deliberately narrow to guarantee that:
 *
 * - It ONLY inserts a newline+indent at a boundary between two tags that were textually adjacent in
 *   the source (zero existing characters between them) AND are both members of {@link BLOCK_ELEMENTS}
 *   — ordinary block-level HTML tags (`div`, `p`, `h1`-`h6`, `li`, …). A whitespace-only text node
 *   between two such elements is not rendered by any browser (block/flex/grid layout all discard
 *   it), so this specific class of insertion is provably invisible once rendered, independent of
 *   which theme or CSS is applied — UNLESS a stylesheet overrides one of those tags to
 *   `display: inline` (rare for a structural tag; disclosed as a residual risk, not fixed here).
 * - It NEVER touches a text run, an inline element's boundary, or the inside of `<pre>`, `<script>`,
 *   `<style>`, or `<textarea>` (see {@link RAW_TEXT_ELEMENTS}) — those are copied through byte for
 *   byte. This is why `<p>Tovu is a content platform <strong>vibecoded</strong> alongside…</p>`
 *   comes out exactly as authored: nothing inside a paragraph's mixed text/inline content is ever a
 *   zero-gap tag-to-tag boundary, so the rule never fires there.
 * - Existing whitespace between two tags (hand-authored formatting) is left completely alone — the
 *   rule only fires on a literal zero-character gap, so already-readable markup is a no-op through
 *   this function.
 *
 * @complexity O(n) two passes over the input length (tokenize, then print) — no backtracking, no
 * recursive descent, no DOM construction.
 */

/** Tags whose content the browser (and this formatter) treats as opaque: reformatting inside one of
 *  these could change literal, meaningful whitespace (`<pre>`/`<textarea>`) or corrupt embedded
 *  code (`<script>`/`<style>`) that happens to contain characters this tokenizer would otherwise
 *  read as markup. Content between an opening and closing tag of these names is copied verbatim. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "pre", "textarea"]);

/** Void elements never have a closing tag or children — excluded from the open/close depth stack
 *  below (there is nothing to later pop). */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Ordinary block-level HTML tags. Whitespace-only text between two elements from this list is not
 * rendered by any layout mode (block, flex, grid) in a normal (non-overridden) stylesheet — see the
 * file header for why that specific property is what makes the insertion rule below safe.
 * Deliberately excludes inline-level and inline-with-fallback tags (`span`, `a`, `strong`, `em`,
 * `img`, `br`, `label`, `button`, …) — inserting whitespace next to one of those CAN become a
 * visible space once rendered, so this formatter never reformats around them at all.
 */
const BLOCK_ELEMENTS = new Set([
  "html", "head", "body", "header", "footer", "nav", "main", "section", "article", "aside",
  "div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup",
  "form", "fieldset", "legend", "blockquote", "figure", "figcaption", "hr",
  "details", "summary", "address", "pre",
]);

const INDENT = "  ";

/** One tag boundary (open/close/self-close) or an opaque run of everything else (text, comments,
 *  doctype, and raw-text-element content) between tag boundaries. */
type Token =
  | { kind: "tag"; text: string; tagKind: "open" | "close" | "self-close"; name: string }
  | { kind: "other"; text: string };

/** Matches one complete HTML tag, attributes included, with attribute values allowed to contain
 *  `>` when quoted (`data-x="a > b"`) so such a value is never mistaken for the tag's own end. */
const TAG_PATTERN =
  /<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^\s"'=<>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>]+))?)*\s*\/?>/y;

/**
 * Splits raw HTML into a flat sequence of tag boundaries and opaque runs (text, comments, doctype,
 * and raw-text-element bodies). Not a real parser — no tree is built, no nesting is validated beyond
 * the simple open/close name stack {@link prettifyHtml} keeps for indentation — which is what keeps
 * this a single linear pass instead of a recursive-descent HTML parser.
 *
 * @param html Raw HTML, a full document or a fragment. Malformed input (an unmatched `<`, an
 * unclosed tag) degrades to treating the offending character as literal text rather than throwing —
 * this function must never fail on already-broken content.
 */
function tokenizeHtml(html: string): Token[] {
  const tokens: Token[] = [];
  const length = html.length;
  let i = 0;

  while (i < length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const stop = end === -1 ? length : end + 3;
      tokens.push({ kind: "other", text: html.slice(i, stop) });
      i = stop;
      continue;
    }

    if (html.slice(i, i + 9).toLowerCase() === "<!doctype") {
      const end = html.indexOf(">", i);
      const stop = end === -1 ? length : end + 1;
      tokens.push({ kind: "other", text: html.slice(i, stop) });
      i = stop;
      continue;
    }

    if (html[i] === "<") {
      TAG_PATTERN.lastIndex = i;
      const match = TAG_PATTERN.exec(html);
      if (match) {
        const raw = match[0];
        const isClose = raw.startsWith("</");
        const isSelfClose = !isClose && raw.endsWith("/>");
        const name = (/^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw)?.[1] ?? "").toLowerCase();
        const tagKind: "open" | "close" | "self-close" = isClose ? "close" : isSelfClose ? "self-close" : "open";
        tokens.push({ kind: "tag", text: raw, tagKind, name });
        i += raw.length;

        if (tagKind === "open" && RAW_TEXT_ELEMENTS.has(name)) {
          const closeMatch = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(i));
          const rawEnd = closeMatch ? i + closeMatch.index + closeMatch[0].length : length;
          tokens.push({ kind: "other", text: html.slice(i, rawEnd) });
          i = rawEnd;
        }
        continue;
      }
    }

    // Plain text (or an unmatched stray `<`, folded into the same run rather than looping forever
    // on it) up to the next `<`.
    const next = html.indexOf("<", i + 1);
    const stop = next === -1 ? length : next;
    tokens.push({ kind: "other", text: html.slice(i, stop) });
    i = stop;
  }

  return tokens;
}

/**
 * Pretty-prints HTML for display/editing in the Pages editor's HTML tab: indents nested block
 * elements onto their own lines, tree-style, without touching any text content, inline markup, or
 * `<pre>`/`<script>`/`<style>`/`<textarea>` bodies. See the file header for the exact safety rule
 * (zero-gap, both-sides-block boundaries only) and why it is safe to apply even though the result
 * can be saved as the page's real stored HTML.
 *
 * Idempotent: running it twice produces the same output as running it once (no zero-gap boundaries
 * remain after the first pass, since every insertion point it would touch is filled).
 *
 * @param html Raw HTML, a full document or a fragment. `""` returns `""`.
 * @returns The same markup with added structural whitespace only.
 */
export function prettifyHtml(html: string): string {
  if (html === "") return html;

  const tokens = tokenizeHtml(html);
  const stack: string[] = [];
  let depth = 0;
  let out = "";

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (token.kind === "tag" && token.tagKind === "close" && BLOCK_ELEMENTS.has(token.name)) {
      // Mirrors `prettifyCss`'s `}` handling: a closing tag renders at its PARENT's depth, so the
      // stack pops (and depth drops) before this token's own indent is computed below.
      if (stack[stack.length - 1] === token.name) {
        stack.pop();
        depth = Math.max(0, depth - 1);
      }
    }

    const prev = tokens[idx - 1];
    const isZeroGapBlockBoundary =
      idx > 0 &&
      prev.kind === "tag" &&
      BLOCK_ELEMENTS.has(prev.name) &&
      token.kind === "tag" &&
      BLOCK_ELEMENTS.has(token.name);
    if (isZeroGapBlockBoundary) {
      out += "\n" + INDENT.repeat(depth);
    }

    out += token.text;

    if (token.kind === "tag" && token.tagKind === "open" && BLOCK_ELEMENTS.has(token.name) && !VOID_ELEMENTS.has(token.name)) {
      stack.push(token.name);
      depth++;
    }
  }

  return out;
}
