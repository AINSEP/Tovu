import { ToolInputError } from '@jini-ai/core';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** Inspect rendered markup, leaving widget placement JSON to its existing resolver. */
function hasBareMediaToken({ html }: { html: string }, _options = {}): boolean {
  const nodes: DefaultTreeAdapterMap['childNode'][] = [...parseFragment(html).childNodes];
  const token = /\{\{\s*media:/;
  while (nodes.length) {
    const node = nodes.pop()!;
    if ('value' in node && token.test(node.value)) return true;
    if ('attrs' in node && node.attrs.some(attr => attr.name !== 'data-embed-config' && token.test(attr.value))) return true;
    if ('childNodes' in node) nodes.push(...node.childNodes);
    if ('content' in node) nodes.push(...node.content.childNodes);
  }
  return false;
}

/** Refuse widget-only tokens before a page write or doc-to-HTML conversion can persist them.
 * @returns The validated HTML unchanged.
 * @throws ToolInputError with a supported media-embed alternative.
 * @complexity O(n) time and space in HTML length; no I/O.
 */
export function requirePageAuthoringHtml({ html }: { html: string }, _options = {}): string {
  if (hasBareMediaToken({ html })) {
    throw new ToolInputError({ message: '{{media:slug}} tokens work in Media widget HTML mode only and would leave a broken photo in page HTML. Use a media embed such as <div data-embed-config=\'{"type":"media","slug":"pastry-counter-3"}\'></div> with the asset\'s actual slug, or use its public URL in src.' });
  }
  return html;
}
