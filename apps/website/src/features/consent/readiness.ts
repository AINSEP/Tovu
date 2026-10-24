/** @file Read-only projection of Jini's denied-visitor gate, never a second classifier. */
import { CONSENT_CATEGORIES, type ConsentConfig } from '@jini-ai/cms/consent';
import { gateConsentHtml, type ConsentGateOptions } from '@jini-ai/cms/consent/html';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { ConsentProblem } from './validation.js';

type Node = DefaultTreeAdapterMap['childNode'];
export interface ConsentInventoryItem { tag: string; category: string; source: string | null; attributes?: string[] }

/** Remove query/fragment values and URL credentials from diagnostic source labels. O(url length). */
function sourceLabel({ value }: { value: string | undefined }, _options = {}): string | null {
  if (!value) return null;
  try { const url = new URL(value, 'https://site.invalid'); return `${url.origin === 'https://site.invalid' ? '' : url.origin}${url.pathname}`.slice(0, 500); }
  catch { return '[invalid resource URL]'; }
}

/** Project one engine payload; templates contribute only their first element, not its subtree. */
function inventoryItem({ node }: { node: DefaultTreeAdapterMap['element'] }, _options = {}): ConsentInventoryItem | null {
  const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
  if (node.tagName === 'template') {
    if (!attrs.has('data-jini-consent-script') && !attrs.has('data-jini-consent-resource')) return null;
    const child = (node as DefaultTreeAdapterMap['template']).content.childNodes.find((item): item is DefaultTreeAdapterMap['element'] => 'tagName' in item);
    if (!child) return null;
    const source = child.attrs.find(attr => ['src', 'href', 'data', 'poster'].includes(attr.name))?.value;
    return { tag: child.tagName, category: attrs.get('data-category') ?? 'blocked', source: sourceLabel({ value: source }) };
  }
  const payload = attrs.get('data-jini-consent-attributes');
  return payload ? { tag: node.tagName, category: attrs.get('data-jini-consent-category') ?? 'blocked', source: null, attributes: Object.keys(JSON.parse(payload)) } : null;
}

/** Projects engine-created inert templates/attribute payloads, capped at 200 entries.
 * It neither interprets authored category labels nor executes scripts. O(n) gated HTML bytes. */
export function consentGateInventory({ html }: { html: string }, _options = {}): { items: ConsentInventoryItem[]; truncated: boolean } {
  const nodes: Node[] = [...parse(html).childNodes];
  const items: ConsentInventoryItem[] = [];
  let truncated = false;
  while (nodes.length) {
    const node = nodes.pop()!;
    if (!('tagName' in node)) continue;
    const item = inventoryItem({ node });
    if (item) items.push(item);
    if (node.tagName !== 'template') nodes.push(...node.childNodes);
    if (items.length === 200) { truncated = nodes.length > 0; break; }
  }
  return { items, truncated };
}

/** The engine gate a dry run renders through (a seam so the fail-closed path is testable). */
export type ConsentDryRunGate = typeof gateConsentHtml;

/** A bounded rendered sample; failures are blocking evidence, never a green readiness result.
 * @param options.gate the engine gate (default `gateConsentHtml`); injectable so the fail-closed path is testable.
 * @example consentDryRun({ html, config, necessaryScripts: [] })
 * @complexity O(n) time/space for at most 1 MB of rendered HTML. */
export function consentDryRun({ html, config, necessaryScripts }: { html: string; config: ConsentConfig; necessaryScripts: NonNullable<ConsentGateOptions['necessaryScripts']> }, options: { gate?: ConsentDryRunGate } = {}) {
  const problems: ConsentProblem[] = [];
  const gate = options.gate ?? gateConsentHtml;
  try {
    const gated = gate({ html, config: { ...config, enabled: true }, record: null, regionMode: 'opt-in', gpc: false, endpoint: '/api/site-consent' }, { necessaryScripts });
    const inventory = consentGateInventory({ html: gated });
    if (inventory.truncated) problems.push({ code: 'INVENTORY_TRUNCATED', message: 'More than 200 gated items. Inspect a smaller page sample.' });
    return { ...inventory, gatedHtml: gated, problems, categories: CONSENT_CATEGORIES.map(id => ({ id, required: id === 'necessary', editable: false })) };
  } catch {
    return { items: [], gatedHtml: null, truncated: false, categories: CONSENT_CATEGORIES.map(id => ({ id, required: id === 'necessary', editable: false })), problems: [{ code: 'GATE_FAILED', message: 'The consent engine could not safely process this page. Optional content stays blocked.' }] };
  }
}
