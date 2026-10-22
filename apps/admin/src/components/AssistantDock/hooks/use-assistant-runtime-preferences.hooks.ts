import { useCallback, useEffect, useRef, useState } from "react";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";

import { CHAT_DISPLAY_NAMESPACE } from "../chat-display-preferences";
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, type AssistantRuntimePreferences } from "../assistant-runtime-preferences";

/** The shape of `assistantRuntimePreferencesPort`; a test passes a fake. */
export interface AssistantRuntimePreferencesPort {
  load(input?: Record<string, never>, options?: Record<string, never>): Promise<AssistantRuntimePreferences>;
  save(input: { next: AssistantRuntimePreferences; previous: AssistantRuntimePreferences }, options?: Record<string, never>): Promise<void>;
  subscribe(input: { listener: () => void }, options?: Record<string, never>): () => void;
}

export interface AssistantRuntimePreferencesController {
  preferences: AssistantRuntimePreferences;
  /** Applies a change at once and saves it for this person; the server reads it at the next run. */
  update: (patch: Partial<AssistantRuntimePreferences>) => void;
  /** The last save failed; the choice still shows until the page reloads. */
  saveFailed: boolean;
}

const QUERY_KEY = ["settings", CHAT_DISPLAY_NAMESPACE, "assistant-runtime"];

/**
 * The gear's "Use Claude in Chrome" and "Prefer subagents" switches, live — the same
 * optimistic-then-stored flow as `useChatAgentPlugins`: a flip shows at once, is saved per person,
 * and the optimistic copy is dropped once the stored values agree, so a change made elsewhere shows up.
 * {@link DEFAULT_ASSISTANT_RUNTIME_PREFERENCES} until the stored values arrive; a failed read keeps them.
 * @complexity O(1) per change.
 */
export function useAssistantRuntimePreferences(
  { port }: { port: AssistantRuntimePreferencesPort }, _options: Record<string, never> = {},
): AssistantRuntimePreferencesController {
  const fetchPreferences = useCallback(() => port.load({}, {}), [port]);
  const query = useFetchQuery({ key: QUERY_KEY, fetch: fetchPreferences }, { staleTime: 0 });
  const invalidate = useInvalidate();
  const [optimistic, setOptimistic] = useState<AssistantRuntimePreferences | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const lastRequested = useRef<AssistantRuntimePreferences | null>(null);
  const pendingSaves = useRef(0);
  const preferences = optimistic ?? query.data ?? DEFAULT_ASSISTANT_RUNTIME_PREFERENCES;

  useEffect(() => port.subscribe({ listener: () => invalidate({ key: QUERY_KEY }) }, {}), [port, invalidate]);
  useEffect(() => {
    if (pendingSaves.current === 0 && optimistic && query.data
      && optimistic.preferSubagents === query.data.preferSubagents && optimistic.useClaudeInChrome === query.data.useClaudeInChrome) {
      lastRequested.current = null;
      setOptimistic(null);
    }
  }, [optimistic, query.data]);

  const update = useCallback((patch: Partial<AssistantRuntimePreferences>) => {
    // A quick second flip must diff against the last requested values, not a not-yet-re-read copy.
    const previous = lastRequested.current ?? preferences;
    const next = { ...previous, ...patch };
    lastRequested.current = next;
    pendingSaves.current += 1;
    setOptimistic(next);
    port.save({ next, previous }, {}).then(
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
