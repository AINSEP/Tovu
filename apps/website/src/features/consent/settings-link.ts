/** @file Tovu owns the persistent withdrawal link; Jini owns the preferences UI and lifecycle. */
import { parse, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
/** Which consent engine delivered the page: the old one marks its runtime; cookie-consent emits its
 * config script and opens on `data-consent-open`. P4 follow-up: drop 'legacy'. */
type Engine = 'legacy' | 'cookie-consent';
const ANCHORS: Readonly<Record<Engine, string>> = {
  legacy: '<a href="#jini-consent" data-jini-consent-open>Cookie settings</a>',
  'cookie-consent': '<a href="#privacy-choices" data-consent-open>Cookie settings</a>',
};
// In a footer the link joins the theme's last row (the "© Site" line) and takes that row's text
// style; a centred row of its own read as stray. The margin only matters in a non-flex row.
const inlineLink = (anchor: string) => `<span data-tovu-consent-settings style="margin-inline-start:1em">${anchor}</span>`;
// A footerless page has no row to join; a centred row needs no theme container class to line up.
const rowLink = (anchor: string) => `<p data-tovu-consent-settings style="margin:0;padding:0 1rem 1.25rem;text-align:center;font-size:0.8125rem">${anchor}</p>`;
/** A theme's own live control for this engine: then the page never shows two links. */
const ownControl = ({ engine, tag, attrs }: { engine: Engine; tag: string; attrs: Map<string, string> }) => engine === 'legacy'
  ? attrs.has('data-jini-consent-open') : attrs.has('data-consent-open') || (tag === 'a' && attrs.get('href') === '#privacy-choices');

/** Legacy only: the engine's own section says whether it reopens through a link; undefined for any other
 * element. P4 follow-up: delete with the legacy engine. */
const legacyReopensByLink = ({ engine, tag, attrs }: { engine: Engine; tag: string; attrs: Map<string, string> }) =>
  engine === 'legacy' && tag === 'section' && attrs.get('id') === 'jini-consent' ? attrs.get('data-reopen') === 'link' : undefined;

/** Only live, non-hidden markup can host a withdrawal control. O(n) nodes, iterative for deep HTML. */
function* liveElements({ html }: { html: string }, _options = {}): Generator<Element> {
  const nodes: Node[] = [...parse(html, { sourceCodeLocationInfo: true }).childNodes];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (!('tagName' in node) || node.tagName === 'template' || node.attrs.some(attr => attr.name === 'hidden')) continue;
    yield node;
    for (const child of node.childNodes) nodes.push(child);
  }
}

/** HTML may omit a footer's closing tag; parse5 still identifies the end of its content. */
function contentEnd({ node }: { node: Element }, { fallback = -1 }: { fallback?: number } = {}): number {
  return node.sourceCodeLocation?.endTag?.startOffset ?? node.sourceCodeLocation?.endOffset ?? fallback;
}

/** The footer's bottom row: follow last-child `<div>`s down (`.wrap > .footer-bottom` in the
 * starter theme). A footer that ends in anything else is its own last row. O(footer nodes). */
function lastRow({ footer }: { footer: Element }, _options = {}): Element {
  let row = footer;
  for (;;) {
    const last = [...row.childNodes].reverse().find((child): child is Element => 'tagName' in child);
    if (last?.tagName !== 'div' || last.attrs.some(attr => attr.name === 'hidden')) return row;
    row = last;
  }
}

/** Keep the footer whose content ends last, including implicitly closed markup. */
function laterFooter({ node, footer }: { node: Element; footer: Element | null }, _options = {}): Element | null {
  if (node.tagName !== 'footer') return footer;
  const previousEnd = footer ? contentEnd({ node: footer }) : -1;
  return contentEnd({ node }) > previousEnd ? node : footer;
}

/** Locate the live engine UI and the theme's footer/body insertion point in one parse.
 * The last-ending footer is the page footer: article/card footers close before it. A theme that
 * already ships its own live control keeps it alone, so the page never shows two links. */
function linkPlacement({ html }: { html: string }, { engine = 'legacy' }: { engine?: Engine } = {}): { enabled: boolean; offset: number; inline: boolean } {
  // cookie-consent: Tovu rendered the banner in link mode (or the owner's own banner), so the page needs the link.
  let enabled = engine === 'cookie-consent';
  let footer: Element | null = null;
  let bodyEnd = html.length;
  for (const node of liveElements({ html })) {
    const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
    if (ownControl({ engine, tag: node.tagName, attrs })) return { enabled: false, offset: 0, inline: false };
    enabled = legacyReopensByLink({ engine, tag: node.tagName, attrs }) ?? enabled;
    footer = laterFooter({ node, footer });
    if (node.tagName === 'body') bodyEnd = contentEnd({ node }, { fallback: bodyEnd });
  }
  if (!footer) return { enabled, offset: bodyEnd, inline: false };
  return { enabled, offset: contentEnd({ node: lastRow({ footer }) }), inline: true };
}

/** Add the host control only to HTML actually gated by Jini in link mode (legacy) or carrying the
 * cookie-consent config (Tovu renders that banner in link mode), once per page.
 * Source offsets preserve SEO and theme bytes; implicit bodies append the control. Jini has
 * already bounded and buffered this response. No config read competes with its lastGood policy.
 * @complexity O(n) time/space for n HTML bytes; no I/O. */
export function withSiteConsentSettingsLink({ html }: { html: string }, { engine = 'legacy' }: { engine?: Engine } = {}): string {
  if (!html.includes(engine === 'legacy' ? 'data-jini-consent-runtime' : 'id="jini-consent-config"')) return html;
  const { enabled, offset, inline } = linkPlacement({ html }, { engine });
  if (!enabled) return html;
  const anchor = ANCHORS[engine];
  return html.slice(0, offset) + (inline ? inlineLink(anchor) : rowLink(anchor)) + html.slice(offset);
}
