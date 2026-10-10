import { hasQueuedPageAction, loadSiteAssistantState } from './session-store';
import { readSiteChatComparisonVariant } from './site-chat-comparison';

/** Product bindings only. The build entry supplies Jini after its additive entries are built. */
export function startSiteChatLoader({ install, loadAssets }: {
  install: (args: { button: HTMLButtonElement; load: () => Promise<void>; open: (args?: { focus?: boolean }) => void;
    resume: boolean; deepLink: boolean; preload: boolean; loadingLabel: string; retryLabel: string }) => { activate: (args: Record<string, never>) => Promise<void> };
  loadAssets: (args: { document: Document; scriptUrl: string; styleUrl: string; mount?: HTMLElement }) => Promise<void>;
}, options: {
  document?: Document; location?: Pick<Location, 'hash' | 'search'>; events?: Pick<Window, 'addEventListener'>;
  loadState?: typeof loadSiteAssistantState; hasQueued?: typeof hasQueuedPageAction;
} = {}): void {
  const document = options.document ?? window.document;
  const location = options.location ?? window.location;
  const events = options.events ?? window;
  const root = document.getElementById('tovu-site-assistant-root');
  const button = document.querySelector<HTMLButtonElement>('[data-jini-chat-loader]');
  if (!root || !button) return;
  const comparisonVariant = readSiteChatComparisonVariant({ document });
  const vanilla = (comparisonVariant ?? button.dataset.widget) === 'vanilla';
  const resume = (options.loadState ?? loadSiteAssistantState)().open;
  const deepLink = location.hash === '#open-chat' || new URLSearchParams(location.search).get('open-chat') === '1';
  if (resume || deepLink) root.dataset.chatOpen = 'true';
  const widget = vanilla ? 'site-assistant-vanilla' : 'site-assistant';
  const loader = install({ button, resume, deepLink, preload: (options.hasQueued ?? hasQueuedPageAction)(),
    loadingLabel: 'Loading chat…', retryLabel: 'Chat could not load. Activate to retry.',
    load: () => loadAssets({ document, scriptUrl: `/site-chat/${widget}.js`, styleUrl: `/site-chat/${widget}.css`, mount: root }),
    open: ({ focus = false } = {}) => {
      root.dataset.chatOpen = 'true';
      if (focus) {
        root.dataset.chatFocus = 'true';
        root.dispatchEvent(new (document.defaultView?.Event ?? Event)('jini-chat-open'));
      }
    },
  });

  // Explicit open-chat anchors also work after page load; the loader deduplicates pending loads.
  events.addEventListener('hashchange', () => {
    if (location.hash === '#open-chat') {
      void loader.activate({});
    }
  });
  events.addEventListener('click', event => {
    const target = event.target as Element | null;
    if (typeof target?.closest === 'function' && target.closest('a[href="#open-chat"]')) {
      event.preventDefault();
      void loader.activate({});
    }
  });
}
