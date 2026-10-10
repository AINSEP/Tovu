import { useMemo } from 'react';
import { createSiteChatI18n } from './site-chat-i18n';

/** Bind host copy and consume confirmation Escape before the containing dialog closes. O(1). */
export function useSiteAssistantHeader({ hasMessages }: { hasMessages: boolean }, { document: page = document } = {}) {
  return useMemo(() => {
    const { t } = createSiteChatI18n({ document: page });
    const keyboard = { subscribe: ({ onEscape }: { onEscape: () => void }) => {
      const view = page.defaultView;
      const handler = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onEscape();
      };
      view?.addEventListener('keydown', handler, true);
      return () => view?.removeEventListener('keydown', handler, true);
    } };
    return { t, keyboard, copy: { eyebrow: '', newThread: t('New thread'), cancel: t('Cancel'), discard: t(hasMessages ? 'Discard chat' : 'Discard draft') } };
  }, [page, hasMessages]);
}
