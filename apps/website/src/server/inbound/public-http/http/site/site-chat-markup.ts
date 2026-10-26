import { CHAT_BUBBLE_STYLE as BUBBLE_STYLE } from '@jini-ai/chat/browser/lazy-loader';

/** Boolean callers retain the legacy React default; a site may explicitly choose either widget. */
export type SiteChatSelection = boolean | 'react' | 'vanilla';

/** Site HTML adapter; fixed asset names and a narrowed variant cannot inject markup. */
export function renderLazySiteChatMarkup({ enabled, variant, assetsReady, mountId }: {
  enabled: boolean; variant: 'react' | 'vanilla'; assetsReady: boolean; mountId: 'tovu-site-assistant-root';
}, _options = {}): { head: string; body: string } | null {
  if (!enabled) return { head: '', body: '' };
  // A partial deployment must not fall back to fetching React before the visitor opens chat.
  if (!assetsReady) return null;
  return {
    // Match site-chat-theme.css before the widget stylesheet loads, without changing host tokens.
    // Consent suspends either mounted renderer as well as the shared lazy bubble.
    head: `<style data-jini-chat-bubble>#${mountId}{display:var(--jini-floating-ui-display,block)}${BUBBLE_STYLE}\n.jini-chat-bubble[data-jini-chat-loader]{--jini-chat-accent:oklch(55.29% 0.1129 43.4);--jini-chat-accent-text:oklch(99% 0 0);--jini-embed-z-index:2147483000;box-shadow:0 4px 14px rgba(20,28,45,.07),0 2px 5px rgba(20,28,45,.05)}\n@media(max-width:480px){.jini-chat-bubble[data-jini-chat-loader]{right:12px;bottom:12px}}</style>`,
    // The host’s own chat is necessary; its loader defers the widget until open intent.
    body: `<div id="${mountId}"></div><button type="button" class="jini-chat-bubble" data-jini-chat-loader data-widget="${variant}" aria-label="Chat with this site" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><script defer src="/site-chat/site-assistant-loader.js"></script>`,
  };
}

/** Site-chat deployment readiness; successful snapshots avoid filesystem reads on each page.
 * Missing assets are retried so the owner's running fallback recovers after a local build.
 * @complexity O(1) per cached read, O(3) file probes per miss; at most 16 deployment snapshots.
 */
export function createSiteChatAssetReadiness({ exists }: { exists: (args: { directory: string; name: string }) => boolean }, _options = {}) {
  const ready = new Set<string>();
  return ({ directory, variant }: { directory: string; variant: 'react' | 'vanilla' }, _opts = {}): boolean => {
    const key = JSON.stringify([directory, variant]);
    if (ready.has(key)) return true;
    const widget = variant === 'vanilla' ? 'site-assistant-vanilla' : 'site-assistant';
    if (!['site-assistant-loader.js', `${widget}.js`, `${widget}.css`].every(name => exists({ directory, name }))) return false;
    if (ready.size === 16) ready.delete(ready.values().next().value!);
    ready.add(key);
    return true;
  };
}
