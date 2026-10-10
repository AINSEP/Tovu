import { EmbedChatHeader } from '@jini-ai/chat/react/embed';
import { useSiteAssistantHeader } from './SiteAssistantHeader.hooks';

export interface SiteAssistantHeaderProps {
  readonly title: string;
  readonly hasMessages: boolean;
  readonly onReset: () => void;
  readonly onClose?: () => void;
}

/** The shared embed header owns safe reset confirmation; this adapter supplies public-site copy. */
export function SiteAssistantHeader({ title, hasMessages, onReset, onClose }: SiteAssistantHeaderProps) {
  const { t, keyboard, copy } = useSiteAssistantHeader({ hasMessages });
  return <EmbedChatHeader title={title} hasMessages={hasMessages} onReset={onReset} copy={copy} keyboard={keyboard}
    closeAction={onClose && <button type="button" className="jini-chat-pane__close" onClick={onClose} aria-label={t('Close chat')}>
      <span aria-hidden="true">×</span>
    </button>} />;
}
