/** @file Tovu owns the persistent withdrawal link; Jini owns the preferences UI and lifecycle. */
import { parse, type DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['childNode'];
type Element = DefaultTreeAdapterMap['element'];
// A centred row needs no theme container class to line up; the theme's own footer/link colours apply.
const LINK = '<p data-tovu-consent-settings style="margin:0;padding:0 1rem 1.25rem;text-align:center;font-size:0.8125rem"><a href="#jini-consent" data-jini-consent-open>Cookie settings</a></p>';

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

/** Locate the live engine UI and the theme's footer/body insertion point in one parse.
 * The last-ending footer is the page footer: article/card footers close before it. A theme that
 * already ships its own live control keeps it alone, so the page never shows two links. */
function linkPlacement({ html }: { html: string }, _options = {}): { enabled: boolean; offset: number } {
  let enabled = false;
  let footerEnd = -1;
  let bodyEnd = html.length;
  for (const node of liveElements({ html })) {
    const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
    if (attrs.has('data-jini-consent-open')) return { enabled: false, offset: 0 };
    if (node.tagName === 'section' && attrs.get('id') === 'jini-consent') enabled = attrs.get('data-reopen') === 'link';
    if (node.tagName === 'footer') footerEnd = Math.max(footerEnd, contentEnd({ node }));
    if (node.tagName === 'body') bodyEnd = contentEnd({ node }, { fallback: bodyEnd });
  }
  return { enabled, offset: footerEnd >= 0 ? footerEnd : bodyEnd };
}

/** Add the host control only to HTML actually gated by Jini in link mode, once per page.
 * Source offsets preserve SEO and theme bytes; implicit bodies append the control. Jini has
 * already bounded and buffered this response. No config read competes with its lastGood policy.
 * @complexity O(n) time/space for n HTML bytes; no I/O. */
export function withSiteConsentSettingsLink({ html }: { html: string }, _options = {}): string {
  if (!html.includes('data-jini-consent-runtime')) return html;
  const { enabled, offset } = linkPlacement({ html });
  if (!enabled) return html;
  return html.slice(0, offset) + LINK + html.slice(offset);
}
