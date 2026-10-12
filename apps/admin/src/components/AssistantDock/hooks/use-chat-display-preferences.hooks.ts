import { useCallback, useEffect, useRef, useState } from "react";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";

import {
  CHAT_DISPLAY_NAMESPACE,
  DEFAULT_CHAT_DISPLAY,
  sameChatDisplay,
  type ChatDisplayPreferences,
} from "../chat-display-preferences";

export interface ChatDisplayPreferencesPort {
  load(): Promise<ChatDisplayPreferences>;
  save(next: ChatDisplayPreferences, previous: ChatDisplayPreferences): Promise<void>;
  subscribeToSettingsRefresh(listener: () => void): () => void;
}

export interface ChatDisplayPreferencesController {
  preferences: ChatDisplayPreferences;
  /** Applies a change at once and saves it for this operator. */
  update: (patch: Partial<ChatDisplayPreferences>) => void;
  /** The last save failed; the choice still applies until the page reloads. */
  saveFailed: boolean;
}

const QUERY_KEY = ["settings", CHAT_DISPLAY_NAMESPACE, "chat-display"];

/**
 * The dock's Chat settings → Display choices, live. A change applies on the spot through an
 * optimistic copy (the pane re-renders with the new props, no reload), is saved per operator, and the
 * copy is dropped once the stored values say the same thing — so a later change made elsewhere
 * (another tab's save echoing over the settings feed) shows up again.
 *
 * {@link DEFAULT_CHAT_DISPLAY} until the stored values arrive; a failed read keeps the defaults.
 * @complexity O(1) per change.
 */
export function useChatDisplayPreferences(port: ChatDisplayPreferencesPort): ChatDisplayPreferencesController {
  const fetchPreferences = useCallback(() => port.load(), [port]);
  const query = useFetchQuery({ key: QUERY_KEY, fetch: fetchPreferences }, { staleTime: 0 });
  const invalidate = useInvalidate();
  const [optimistic, setOptimistic] = useState<ChatDisplayPreferences | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const lastRequested = useRef<ChatDisplayPreferences | null>(null);
  const pendingSaves = useRef(0);
  const stored = query.data ?? DEFAULT_CHAT_DISPLAY;
  const preferences = optimistic ?? stored;

  useEffect(() => port.subscribeToSettingsRefresh(() => invalidate({ key: QUERY_KEY })), [port, invalidate]);
  useEffect(() => {
    if (pendingSaves.current === 0 && optimistic && query.data && sameChatDisplay({ a: optimistic, b: query.data })) {
      lastRequested.current = null;
      setOptimistic(null);
    }
  }, [optimistic, query.data]);

  const update = useCallback((patch: Partial<ChatDisplayPreferences>) => {
    // A reversal must undo the last requested write, even before its re-read (or React render).
    const previous = lastRequested.current ?? preferences;
    const next = { ...previous, ...patch };
    lastRequested.current = next;
    pendingSaves.current += 1;
    setOptimistic(next);
    port.save(next, previous).then(
      () => {
        pendingSaves.current -= 1;
        setSaveFailed(false);
        invalidate({ key: QUERY_KEY });
      },
      () => {
        pendingSaves.current -= 1;
        setSaveFailed(true);
      },
    );
  }, [preferences, port, invalidate]);

  return { preferences, update, saveFailed };
}
