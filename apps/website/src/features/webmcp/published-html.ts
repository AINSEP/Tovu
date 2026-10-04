import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { createAnnotatedActionsScript } from './generated/annotated-actions-script.js';
import { PUBLISHED_WEBMCP_CONFIRMATION } from './webmcp-i18n.js';

type Node = DefaultTreeAdapterMap['childNode'];
const SCRIPT_MARKER = 'data-tovu-webmcp-script';
const FORM_ATTRIBUTES = new Set(['toolname', 'tooldescription', 'toolautosubmit', 'toolparamtitle', 'toolparamdescription']);

/** Remove only actual HTML attribute ranges. Re-serializing trusted HTML would
 * change scripts, embeds, formatting and template content on every opt-out. */
function withoutNativeFormTools(html: string): string {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const stack: Node[] = [...document.childNodes];
  const ranges: { startOffset: number; endOffset: number }[] = [];
  while (stack.length) {
    const node = stack.pop()!;
    if (!('tagName' in node)) continue;
    if (node.tagName === 'script' && node.attrs.some(attr => attr.name === SCRIPT_MARKER) && node.sourceCodeLocation) {
      ranges.push(node.sourceCodeLocation);
      continue;
    }
    for (const attr of node.attrs) {
      const range = node.sourceCodeLocation?.attrs?.[attr.name];
      if (range && FORM_ATTRIBUTES.has(attr.name)) ranges.push(range);
    }
    stack.push(...node.childNodes);
    if (node.tagName === 'template') stack.push(...(node as DefaultTreeAdapterMap['template']).content.childNodes);
  }
  ranges.sort((a, b) => b.startOffset - a.startOffset);
  for (const range of ranges) html = html.slice(0, range.startOffset) + html.slice(range.endOffset);
  return html;
}

/** Server-side switch controls script delivery AND native declarative discovery. */
export function injectPublishedWebMcp(
  { html, enabled }: { html: string; enabled: boolean },
  _optional: Record<string, never> = {},
): string {
  if (!enabled) return withoutNativeFormTools(html);
  if (html.includes(`<script ${SCRIPT_MARKER}`)) return html;
  const script = `<script ${SCRIPT_MARKER}>${createAnnotatedActionsScript({ preferenceKey: 'tovu.admin.webmcp.enabled', confirmationMessage: PUBLISHED_WEBMCP_CONFIRMATION.en, confirmationMessages: PUBLISHED_WEBMCP_CONFIRMATION })}</script>`;
  const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
  return bodyEnd < 0 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
}
