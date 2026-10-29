import { markersOfType, maskNonRenderableRegions, MENU_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";

/**
 * @file Finds a header, nav or footer partial that hard-codes a list of links instead of rendering a
 * menu through a menu marker.
 *
 * Why: links baked into a partial never show in Admin → Menus, so the owner cannot edit them (Luvira
 * import, 2026-10-08: the copied theme's `footer.html` hard-coded its "Explore" and "Legal" columns).
 * The theme write tools still write the file — a partial may carry plain links on purpose — and
 * return this as a warning so the model creates the menus and swaps in markers on its next turn,
 * the same warn-don't-refuse shape as `features/pages/hidden-until-script.ts`.
 *
 * PURE: string in, findings out. A tolerant scan, not an HTML parser; comments and raw-text elements
 * are masked first (the same mask the marker scanner uses), and a menu marker's whole element is
 * blanked because the links inside it are only its fallback.
 */

/** Fewer internal links than this (a brand link, one CTA) is not a list. */
export const MIN_HARDCODED_LINK_LIST = 3;
/** Links named in the warning before the rest are summarised. */
const MAX_NAMED_LINKS = 10;

/** `nav.html`, `site-header.html`, `footer-minimal.html`, `navbar.hbs` — the partials that carry link lists. */
const CHROME_PARTIAL = /(?:^|[-_.])(?:header|footer|nav|navbar|navigation|menu)(?:[-_.][^/]*)?\.(?:html?|hbs|handlebars|liquid)$/i;
const ANCHOR_START = /<a\b/gi;
const HREF_PREFIX = /\bhref\s*=\s*/iy;
const HREF_VALUE = /(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/y;
/** `https:`, `mailto:`, `tel:`, `javascript:` … — not a link to a page of this site. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function isInternalHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) return false;
  // A templated href (`{{ url }}`, `{% … %}`) is already data-driven, not a hard-coded link.
  if (trimmed.includes("{{") || trimmed.includes("{%")) return false;
  return !URL_SCHEME.test(trimmed);
}

/** `html` with every comment, raw-text body and menu-marker element blanked to spaces, same length. */
function maskMenusAndNonRenderable(html: string): string {
  let masked = maskNonRenderableRegions({ html });
  for (const marker of markersOfType({ html, type: MENU_MARKER_TYPE })) {
    masked = masked.slice(0, marker.index) + " ".repeat(marker.whole.length) + masked.slice(marker.index + marker.whole.length);
  }
  return masked;
}

/**
 * Every internal link href written outside a menu marker, in document order.
 * @param required.html - A partial's markup.
 * @returns The hrefs, as authored; empty when every internal link sits inside a menu marker.
 * @complexity O(n · m) for n characters and m menu markers (m is a handful in any partial).
 */
export function findHardcodedLinks({ html }: { html: string }, _optional: {} = {}): readonly string[] {
  const hrefs: string[] = [];
  const masked = maskMenusAndNonRenderable(html);
  const anchors = new RegExp(ANCHOR_START);
  for (let anchor = anchors.exec(masked); anchor; anchor = anchors.exec(masked)) {
    const found = anchorHref({ html: masked, start: anchors.lastIndex });
    if (found) {
      anchors.lastIndex = found.end;
      if (isInternalHref(found.href)) hrefs.push(found.href.trim());
    }
  }
  return hrefs;
}

/** Keep the tolerant scanner's first valid href, skipping complete quoted attributes.
 * An incomplete href can still be followed by a valid one on the same anchor. */
function anchorHref({ html, start }: { html: string; start: number }, _options = {}): { href: string; end: number } | undefined {
  const prefix = new RegExp(HREF_PREFIX);
  const value = new RegExp(HREF_VALUE);
  let offset = start;
  while (offset < html.length) {
    const char = html[offset]!;
    if (char === ">") return undefined;
    const captured = anchorHrefAt({ html, offset, prefix, value });
    if (captured) return captured;
    const quoted = char === '"' || char === "'";
    const end = quoted ? html.indexOf(char, offset + 1) : offset;
    if (end === -1) return undefined;
    offset = end + 1;
  }
  return undefined;
}

/** Mutates only this scan's sticky matchers; an invalid value leaves the scanner free to
 * look for a later href. Quoted attributes are skipped by the caller. */
function anchorHrefAt({ html, offset, prefix, value }: {
  html: string; offset: number; prefix: RegExp; value: RegExp;
}, _options = {}): { href: string; end: number } | undefined {
  prefix.lastIndex = offset;
  if (!prefix.exec(html)) return undefined;
  value.lastIndex = prefix.lastIndex;
  const captured = value.exec(html);
  // The value groups are alternatives; join renders the two undefined groups as empty text.
  return captured ? { href: captured.slice(1).join(""), end: value.lastIndex } : undefined;
}

/**
 * The model-facing warning for a header/nav/footer partial that hard-codes a link list, or
 * `undefined` when the path is not such a partial or its links are menu-rendered.
 * @param required.path - The theme-relative path just written.
 * @param required.content - The file's full content after the write.
 * @complexity O(n) in the content length.
 */
export function describeHardcodedLinkList({ path, content }: { path: string; content: string }, _optional: {} = {}): string | undefined {
  if (!CHROME_PARTIAL.test(path.slice(path.lastIndexOf("/") + 1))) return undefined;
  const links = findHardcodedLinks({ html: content });
  if (links.length < MIN_HARDCODED_LINK_LIST) return undefined;
  const named = links.length <= MAX_NAMED_LINKS ? links.join(", ") : `${links.slice(0, MAX_NAMED_LINKS).join(", ")}, ...`;
  return (
    `Written, but this partial hard-codes ${links.length} links (${named}) outside any menu marker, so the owner ` +
    "cannot edit them in Admin → Menus. Make each link list a menu (menus_create_menu, e.g. slug \"footer-explore\") " +
    `and render it here with <div data-embed-config='{"type":"menu","id":"<menu slug>"}'>…</div>, keeping the ` +
    "column heading and classes; links inside the marker are only a fallback."
  );
}
