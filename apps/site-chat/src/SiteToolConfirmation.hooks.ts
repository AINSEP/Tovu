import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmSiteAssistantTool, type ToolConfirmation } from './tool-confirmation';

/** Live prompt state has no persistence or message/history dependency. Native buttons provide
 * keyboard activation; focus returns to the prior control after a click, expiry or run teardown.
 * @complexity O(1), one 60-second UI deadline. The server owns the authoritative expiry.
 */
export function useSiteToolConfirmation(_required: Record<string, never>, { confirm = confirmSiteAssistantTool }: { confirm?: typeof confirmSiteAssistantTool } = {}) {
  const [pending, setPending] = useState<ToolConfirmation | null>(null);
  const current = useRef<ToolConfirmation | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const receive = useCallback(({ directive }: { directive: ToolConfirmation | null }, _options = {}) => { current.current = directive; setPending(directive); }, []);
  useEffect(() => {
    if (!pending) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const timer = setTimeout(() => receive({ directive: null }), 60_000);
    return () => {
      clearTimeout(timer);
      if (previous?.isConnected) previous.focus();
    };
  }, [pending, receive]);
  const decide = useCallback(({ allow }: { allow: boolean }, _options = {}) => {
    const prompt = current.current;
    if (!prompt) return;
    receive({ directive: null });
    void confirm({ challengeId: prompt.challengeId, allow });
  }, [receive, confirm]);
  return { pending, cancelRef, receive, decide };
}
