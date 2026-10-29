import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { createAnnotatedActionsScript } from './generated/annotated-actions-script.js';
import { PUBLISHED_WEBMCP_CONFIRMATION } from './webmcp-i18n.js';

type Node = DefaultTreeAdapterMap['childNode'];
const SCRIPT_MARKER = 'data-tovu-webmcp-script';
const FORM_ATTRIBUTES = new Set(['toolname', 'tooldescription', 'toolautosubmit', 'toolparamtitle', 'toolparamdescription']);

function formToolAttributeRanges(
  { node }: { node: DefaultTreeAdapterMap['element'] },
  _optional: Record<string, never> = {},
): { startOffset: number; endOffset: number }[] {
  const ranges: { startOffset: number; endOffset: number }[] = [];
  for (const attr of node.attrs) {
    const range = node.sourceCodeLocation?.attrs?.[attr.name];
    if (range && FORM_ATTRIBUTES.has(attr.name)) ranges.push(range);
  }
  return ranges;
}

/** Collect only actual HTML attribute/script ranges, including nested templates.
 * @complexity O(n + r log r) in document bytes and r removed ranges. */
function nativeFormToolRanges({ html }: { html: string }, _options = {}): { startOffset: number; endOffset: number }[] {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const stack: Node[] = [...document.childNodes];
  const ranges: { startOffset: number; endOffset: number }[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (!('tagName' in node)) continue;
    if (node.tagName === 'script' && node.attrs.some(attr => attr.name === SCRIPT_MARKER) && node.sourceCodeLocation) {
      ranges.push(node.sourceCodeLocation);
    } else {
      ranges.push(...formToolAttributeRanges({ node }));
      stack.push(...node.childNodes);
      if (node.tagName === 'template') stack.push(...(node as DefaultTreeAdapterMap['template']).content.childNodes);
    }
  }
  ranges.sort((a, b) => b.startOffset - a.startOffset);
  return ranges;
}

/** Remove only actual HTML attribute ranges. Re-serializing trusted HTML would
 * change scripts, embeds, formatting and template content on every opt-out.
 * Reparse after removal: parse5 hides duplicate attributes, which otherwise become live when
 * the browser parses the edited bytes. Each pass removes at least one attribute or script.
 * @complexity O(d × (n + r log r)) time, O(n) space, for d duplicate layers,
 * n HTML bytes and r removed ranges per pass; preserves unrelated source bytes. */
function withoutNativeFormTools({ html }: { html: string }, _options = {}): string {
  for (let ranges = nativeFormToolRanges({ html }); ranges.length > 0; ranges = nativeFormToolRanges({ html })) {
    const parts: string[] = [];
    let end = html.length;
    for (const range of ranges) {
      parts.push(html.slice(range.endOffset, end));
      end = range.startOffset;
    }
    parts.push(html.slice(0, end));
    html = parts.reverse().join('');
  }
  return html;
}

/** Server-side switch controls script delivery AND native declarative discovery. */
export function injectPublishedWebMcp(
  { html, enabled }: { html: string; enabled: boolean },
  _optional: Record<string, never> = {},
): string {
  if (!enabled) return withoutNativeFormTools({ html });
  if (html.includes(`<script ${SCRIPT_MARKER}`)) return html;
  // The host’s own browser tools are necessary: this script only reads a preference,
  // registers local actions, and writes no storage or cookies.
  const script = `<script ${SCRIPT_MARKER}>${createAnnotatedActionsScript({ preferenceKey: 'tovu.admin.webmcp.enabled', confirmationMessage: PUBLISHED_WEBMCP_CONFIRMATION.en, confirmationMessages: PUBLISHED_WEBMCP_CONFIRMATION })}</script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  return bodyEnd < 0 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}
