/**
 * @file Owner rule (2026-09-24): "links should open a new tab" — any link that leaves the current
 * site should open in a new tab, `rel="noopener noreferrer"` set so the new tab can't reach back
 * into this page via `window.opener`. Implemented ONCE, generically, at server render time
 * ({@link markOffSiteLinksOpenInNewTab}'s one call site per render path — see `render.ts`'s
 * `pageShell` and `routes/site/pages.ts`/`routes/site/products.ts`'s response send sites) rather than
 * requiring every theme author (there are seven static themes alone, plus every declarative/
 * templated/handlebars theme) to remember `target="_blank"` on every individual outbound `<a>` they
 * author into a page/post body, a partial, or a theme file.
 *
 * Pure and synchronous: given the same assembled page `html` and the same `siteHost`, always
 * produces the same output. No I/O, no theme knowledge — this module only ever sees the final HTML
 * string a render path already produced.
 */

/** Matches one `<a …>` OPENING tag (never `</a>`, never a self-contained element) — the only part of
 *  an anchor that carries `href`/`rel`/`target`. Non-greedy `[^>]*` stops at the tag's own `>`, so a
 *  `>` inside a later sibling element can never be swallowed into this match. */
const ANCHOR_OPEN_TAG = /<a\b[^>]*>/gi;

/** An absolute `http:`/`https:` URL — the only scheme this rule ever treats as "off-site" candidate.
 *  A relative href (`pricing.html`, `/blog`, `#anchor`), a `mailto:`/`tel:` href, or any other scheme
 *  fails this and is left untouched — "open in a new tab" has no meaning for a mail/phone handoff,
 *  and a relative href can only ever resolve to this same site. */
const ABSOLUTE_HTTP_HREF = /^https?:\/\//i;

/** Reads one double- or single-quoted HTML attribute's value out of a tag string, or `undefined` if
 *  the attribute is absent. Case-insensitive on the attribute name (`HREF`/`href` both match), as
 *  HTML itself is. @complexity O(tag length). */
function readAttrValue(tag: string, attrName: string): string | undefined {
  const match = new RegExp(`[\\s"']${attrName}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(` ${tag}`);
  if (!match) return undefined;
  return match[2] ?? match[3] ?? "";
}

/** `true` when the tag already carries a `target` attribute at all — the author's own explicit
 *  choice, which this rule must never override (owner instruction: "don't override an explicit
 *  target the author set"), regardless of what value it carries. */
function hasTargetAttr(tag: string): boolean {
  return /[\s"']target\s*=/i.test(` ${tag}`);
}

/** Lowercases and strips one leading `www.` label, so `www.example.com` and `example.com` compare
 *  equal — an author linking `https://www.<own-domain>/…` (or the reverse: the site itself served
 *  under `www.`, linking to its own bare-domain form) must not be treated as off-site over a `www.`
 *  mismatch alone. Every other subdomain is a genuinely different host and stays distinct. */
function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

/**
 * `true` when `href` is an absolute `http(s)` URL whose host differs from `siteHost` — the one
 * predicate {@link markOffSiteLinksOpenInNewTab} rewrites on. A malformed absolute-looking href
 * (fails `new URL()`) is treated as NOT off-site: this rule only ever ADDS `target`/`rel`, so the
 * safe default on an unparseable href is to leave it exactly as the author wrote it rather than guess.
 *
 * @complexity O(1) — one regex test plus, only on a match, one `URL` parse.
 */
function isOffSiteHref(href: string, siteHost: string): boolean {
  if (!ABSOLUTE_HTTP_HREF.test(href)) return false;
  let hostname: string;
  try {
    hostname = new URL(href).hostname;
  } catch {
    return false;
  }
  return normalizeHost(hostname) !== normalizeHost(siteHost);
}

/** Merges `add` into whatever tokens `existingRel` (a raw, possibly-`undefined` `rel` attribute
 *  value) already carries, de-duplicated and order-preserving-for-existing-tokens — an off-site link
 *  already authored with `rel="nofollow"` becomes `rel="nofollow noopener noreferrer"`, never a
 *  second `rel` attribute and never a duplicated token if the author already wrote `noopener`
 *  themselves. @complexity O(tokens). */
function mergeRelTokens(existingRel: string | undefined, add: readonly string[]): string {
  const tokens = (existingRel ?? "").split(/\s+/).filter((t) => t.length > 0);
  for (const token of add) {
    if (!tokens.includes(token)) tokens.push(token);
  }
  return tokens.join(" ");
}

/** Minimal escape for a value this module itself writes back into an HTML attribute — every value
 *  passed here is either a fixed literal (`"_blank"`) or `rel` tokens re-derived from
 *  whitespace-split, already-parsed text, so only the two characters that could ever break out of a
 *  double-quoted attribute are handled. @complexity O(value length). */
function escapeAttrValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Replaces an existing attribute's value in `tag`, or appends `name="value"` before the tag's own
 *  closing `>` (or `/>` for a self-closed anchor, though real markup never writes one) when the
 *  attribute is absent. @complexity O(tag length). */
function withAttr(tag: string, name: string, value: string, options: { replaceIfPresent: boolean }): string {
  const escaped = escapeAttrValue(value);
  if (options.replaceIfPresent && readAttrValue(tag, name) !== undefined) {
    return tag.replace(new RegExp(`([\\s"'])(${name})\\s*=\\s*("[^"]*"|'[^']*')`, "i"), `$1$2="${escaped}"`);
  }
  const insertion = ` ${name}="${escaped}"`;
  return /\/>\s*$/.test(tag) ? tag.replace(/\/>\s*$/, `${insertion} />`) : tag.replace(/>\s*$/, `${insertion}>`);
}

/**
 * Rewrites one already-matched `<a …>` open tag so it opens off-site in a new tab: always merges
 * `noopener`/`noreferrer` into `rel` (adding the attribute if the tag had none), and adds
 * `target="_blank"` only when the tag carries no `target` at all — an author's own explicit target
 * (even `target="_self"`) is left exactly as authored, per the owner's instruction.
 *
 * @complexity O(tag length).
 */
function withOffSiteLinkAttrs(tag: string): string {
  const mergedRel = mergeRelTokens(readAttrValue(tag, "rel"), ["noopener", "noreferrer"]);
  const withRel = withAttr(tag, "rel", mergedRel, { replaceIfPresent: true });
  return hasTargetAttr(withRel) ? withRel : withAttr(withRel, "target", "_blank", { replaceIfPresent: false });
}

/**
 * Scans an assembled page's HTML for every `<a href>` that points off-site and rewrites it to open
 * in a new tab — see this file's header for the full rule and why it lives here rather than in each
 * theme. Same-site links (relative, or absolute to `siteHost` itself), `mailto:`/`tel:`/other
 * non-http(s) schemes, and bare `#anchor` hrefs are returned byte-identical.
 *
 * @param html The fully assembled page HTML (a complete document or a fragment — this function only
 *   ever touches `<a>` open tags, so it is safe to call on either).
 * @param siteHost The current request's own host (e.g. `req.hostname` — already port-free), used to
 *   tell "absolute link to this same site" apart from a genuinely off-site link.
 * @complexity O(n) over `html`'s length — one regex pass locating every `<a>` open tag, plus O(1)
 *   attribute work per tag found (bounded by the page's own authored link count, never
 *   user-collection-sized).
 */
export function markOffSiteLinksOpenInNewTab(html: string, siteHost: string): string {
  return html.replace(ANCHOR_OPEN_TAG, (tag) => {
    const href = readAttrValue(tag, "href");
    if (href === undefined || !isOffSiteHref(href, siteHost)) return tag;
    return withOffSiteLinkAttrs(tag);
  });
}
