/** Keep a pane's variant across real site navigation inside its same-origin comparison iframe. */
export function readSiteChatComparisonVariant({ document }: { document: Document }, _options = {}): 'react' | 'vanilla' | null {
  const own = parseComparisonVariant({ value: document.getElementById('tovu-site-assistant-root')?.dataset.chatCompare });
  if (own) return own;
  try {
    const view = document.defaultView;
    if (view?.parent.location.pathname !== '/__compare/site-chat') return null;
    const variant = view.frameElement?.getAttribute('data-chat-compare');
    return parseComparisonVariant({ value: variant });
  } catch { return null; } // Cross-origin embedding cannot opt into the admin comparison channel.
}

function parseComparisonVariant({ value }: { value: string | null | undefined }, _options = {}): 'react' | 'vanilla' | null {
  return value === 'react' || value === 'vanilla' ? value : null;
}

/**
 * Product names for Jini's embed send bridge (`@jini-ai/chat/browser/embed-send-bridge`). Only the
 * guarded comparison frames opt into this product diagnostic channel; the admin comparison page
 * dispatches `requestEventName` on the mount root and waits for `readyMessageType`.
 */
export const SITE_CHAT_COMPARISON_NAMES = {
  requestEventName: 'tovu-compare-send',
  readyMessageType: 'tovu-site-chat-ready',
  invocationId: 'site-chat-comparison',
} as const;

/** Copy for a comparison send that cannot complete (busy pane, unmounted React pane). */
export const SITE_CHAT_COMPARISON_COPY = {
  busyMessage: 'This pane is already replying.',
  unmountedMessage: 'Comparison pane was unmounted.',
} as const;

/** Host decision for the bridge's `enabled`: true only inside a guarded comparison frame. */
export function isSiteChatComparisonRoot({ root }: { root: HTMLElement | null }, _options = {}): boolean {
  return root !== null && readSiteChatComparisonVariant({ document: root.ownerDocument }) !== null;
}
