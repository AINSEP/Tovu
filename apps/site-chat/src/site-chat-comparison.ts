import type { ChatPaneProps } from '@jini-ai/chat/react';

type ComparisonRequest = { text: string; done: (error?: string) => void };

/** Keep a pane's variant across real site navigation inside its same-origin comparison iframe. */
export function readSiteChatComparisonVariant({ document }: { document: Document }, _options = {}): 'react' | 'vanilla' | null {
  const own = document.getElementById('tovu-site-assistant-root')?.dataset.chatCompare;
  if (own === 'react' || own === 'vanilla') return own;
  try {
    const view = document.defaultView;
    if (view?.parent.location.pathname !== '/__compare/site-chat') return null;
    const variant = view.frameElement?.getAttribute('data-chat-compare');
    return variant === 'react' || variant === 'vanilla' ? variant : null;
  } catch { return null; } // Cross-origin embedding cannot opt into the admin comparison channel.
}

/**
 * Only the guarded comparison frames opt into this product diagnostic channel. Each request uses
 * the mounted widget's conversation owner; it never opens a parallel transport or edits its DOM.
 * One in-flight comparison request per pane prevents a double-click from starting duplicate runs.
 */
export function installSiteChatComparisonSend({ root, send }: {
  root: HTMLElement; send: (input: { text: string }, options?: Record<string, never>) => Promise<void>;
}, _options = {}): () => void {
  if (!readSiteChatComparisonVariant({ document: root.ownerDocument })) return () => {};
  let busy = false;
  const listener = (event: Event) => {
    const request = (event as CustomEvent<ComparisonRequest>).detail;
    if (!request || typeof request.text !== 'string' || typeof request.done !== 'function') return;
    if (busy) { request.done('This pane is already replying.'); return; }
    busy = true;
    root.dispatchEvent(new (root.ownerDocument.defaultView!.Event)('jini-chat-open'));
    void Promise.resolve().then(() => send({ text: request.text })).then(
      () => request.done(),
      (error: unknown) => request.done(error instanceof Error ? error.message : String(error)),
    ).finally(() => { busy = false; });
  };
  root.addEventListener('tovu-compare-send', listener);
  root.dataset.compareReady = 'true';
  const view = root.ownerDocument.defaultView;
  view?.parent.postMessage({ type: 'tovu-site-chat-ready' }, view.location.origin);
  return () => { root.removeEventListener('tovu-compare-send', listener); delete root.dataset.compareReady; };
}

/** Reuses ChatPane's opt-in bridge and chat.send_message capability; ordinary visitors omit it. */
export function createReactSiteComparisonControl({ root }: { root: HTMLElement | null }, _options = {}): ChatPaneProps['agentControl'] {
  if (!root || !readSiteChatComparisonVariant({ document: root.ownerDocument })) return undefined;
  let pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  return { enabled: true, bridgeAccess: {
    subscribe: onAction => {
      const dispose = installSiteChatComparisonSend({ root, send: ({ text }) => new Promise<void>((resolve, reject) => {
        pending = { resolve, reject };
        onAction({ invocationId: 'site-chat-comparison', capabilityId: 'chat.send_message', input: { prompt: text } });
      }) });
      return () => {
        dispose();
        pending?.reject(new Error('Comparison pane was unmounted.'));
        pending = null;
      };
    },
    respondSuccess: async () => { pending?.resolve(); pending = null; },
    respondError: async (_id, message) => { pending?.reject(new Error(message)); pending = null; },
  } };
}
