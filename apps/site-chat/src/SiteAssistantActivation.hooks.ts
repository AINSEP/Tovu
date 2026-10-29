import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEmbedChatDialog } from '@jini-ai/chat/react/embed';
import { createReactSiteComparisonControl } from './site-chat-comparison';
import { createSiteChatI18n } from './site-chat-i18n';

/** Public adapter over Jini's shared dialog lifecycle and the page's own language. O(1). */
export function useSiteAssistantSurface({ open, setOpen }: {
  open: boolean; setOpen: (open: boolean) => void;
}, { resetKey }: { resetKey?: number } = {}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setOpen(false), [setOpen]);
  useEmbedChatDialog({ open, onClose: closePanel, panelRef, launcherRef }, { resetKey });
  const i18n = useMemo(() => createSiteChatI18n({ document }), []);
  const suggestions = useMemo(() => [i18n.t('What can I find on this site?'), i18n.t('Show me the latest posts')], [i18n]);
  return { panelRef, launcherRef, closePanel, i18n, suggestions };
}

/** The bridge is stable across streaming renders; only the dev comparison frame enables it. */
export function useSiteAssistantComparison({ root }: { root: HTMLElement | null }, _options = {}) {
  return useMemo(() => createReactSiteComparisonControl({ root }), [root]);
}

/** Loader activation may precede React's first effect; the mount attribute carries that intent. */
export function readSiteChatOpen({ persistedOpen, root }: { persistedOpen: boolean; root: HTMLElement | null }, _options = {}): boolean {
  return persistedOpen || root?.dataset.chatOpen === 'true';
}

/** Retains explicit open intent across script load and React commit without toggling twice. */
export function useSiteAssistantActivation({ root, open, setOpen }: {
  root: HTMLElement | null; open: boolean; setOpen: (open: boolean) => void;
}, _options = {}): { toggleOpen: () => void } {
  const focusRequested = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const toggleOpen = useCallback(() => {
    focusRequested.current = !open;
    setOpen(!open);
  }, [open, setOpen]);
  useEffect(() => {
    if (!root) return undefined;
    const activate = () => {
      focusRequested.current ||= root.dataset.chatFocus === 'true';
      delete root.dataset.chatFocus;
      setOpen(true);
      if (focusRequested.current && openRef.current) {
        focusRequested.current = false;
        root.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)')?.focus();
      }
    };
    root.addEventListener('jini-chat-open', activate);
    if (root.dataset.chatOpen === 'true') activate();
    return () => root.removeEventListener('jini-chat-open', activate);
  }, [root, setOpen]);
  useEffect(() => {
    if (!open || !focusRequested.current) return;
    focusRequested.current = false;
    root?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)')?.focus();
  }, [root, open]);
  useEffect(() => {
    if (!root) return undefined;
    root.dataset.chatMounted = 'true';
    root.dispatchEvent(new Event('jini-chat-mounted'));
    return () => { delete root.dataset.chatMounted; };
  }, [root]);
  return { toggleOpen };
}
