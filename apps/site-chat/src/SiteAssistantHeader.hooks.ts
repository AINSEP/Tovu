import { useMemo } from 'react';
import { createViewEscapeKeyPort } from '@jini-ai/chat/react/embed';
import { createSiteChatI18n } from './site-chat-i18n';

/** Bind host copy and the page's Escape port (it consumes a confirm Escape before the dialog closes). O(1). */
export function useSiteAssistantHeader({ hasMessages }: { hasMessages: boolean },
  { document: page = document, createEscapeKeyPort = createViewEscapeKeyPort }: {
    document?: Document; createEscapeKeyPort?: typeof createViewEscapeKeyPort;
  } = {}) {
  return useMemo(() => {
    const { t } = createSiteChatI18n({ document: page });
    const keyboard = createEscapeKeyPort({ view: page.defaultView });
    return { t, keyboard, copy: { eyebrow: '', newThread: t('New thread'), cancel: t('Cancel'), discard: t(hasMessages ? 'Discard chat' : 'Discard draft') } };
  }, [page, hasMessages, createEscapeKeyPort]);
}
