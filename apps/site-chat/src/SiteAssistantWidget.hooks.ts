import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { ChatPaneComposerHandle } from "@jini-ai/chat/react";
import { createVisitorPageControl } from "./visitor-page-control";
import { createSiteAssistantTransport } from "./site-assistant-transport";
import { clearSiteAssistantState, loadSiteAssistantState, saveSiteAssistantState } from "./session-store";
import { readSiteChatOpen, useSiteAssistantActivation, useSiteAssistantComparison, useSiteAssistantSurface } from "./SiteAssistantActivation.hooks";
import { useSiteToolConfirmation } from "./SiteToolConfirmation.hooks";
import { confirmSiteAssistantTool } from "./tool-confirmation";

/** Manage the visitor assistant's session, transport and conversation actions. */
export function useSiteAssistantWidget(_required: Record<string, never>, _options = {}) {
  // Read once, before the first render — `useState`'s initializer form runs exactly once per
  // component instance, which is what keeps this a single session-store read (and thus a single
  // possible clear-on-corrupt-entry side effect — see `session-store.ts`) rather than one per field
  // below.
  const [initialState] = useState(() => loadSiteAssistantState());

  const root = document.getElementById("tovu-site-assistant-root");
  const comparisonControl = useSiteAssistantComparison({ root });
  const [open, setOpen] = useState(() => readSiteChatOpen({ persistedOpen: initialState.open, root }));
  const [paneKey, setPaneKey] = useState(0);
  const { panelRef, launcherRef, closePanel, i18n, suggestions } = useSiteAssistantSurface({ open, setOpen }, { resetKey: paneKey });
  const { t } = i18n;
  const { toggleOpen } = useSiteAssistantActivation({ root, open, setOpen });
  // Stable across renders for the same reason `AssistantDock`'s transport is memoized: rebuilding
  // it would drop any run this widget has in flight.
  const liveState = useRef(initialState);
  const frontend = useMemo(() => createVisitorPageControl({ document, beforeNavigate: ({ messages }) => saveSiteAssistantState({ ...liveState.current, messages: messages ?? liveState.current.messages }) }), []);
  const confirm = useCallback((input: Parameters<typeof confirmSiteAssistantTool>[0]) => confirmSiteAssistantTool(input, { headers: frontend.currentHeaders }), [frontend]);
  const toolConfirmation = useSiteToolConfirmation({}, { confirm });
  // Which model answered the latest turn, and the question of a send that failed for good; both are
  // set by the transport and cleared when the next run starts or the thread resets.
  const [model, setModel] = useState<string | null>(null);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const composerHandle = useRef<ChatPaneComposerHandle | null>(null);
  useEffect(() => () => frontend.close({}), [frontend]);
  const transport = useMemo(() => createSiteAssistantTransport({}, {
    onToolConfirmation: toolConfirmation.receive, frontend,
    onModel: ({ model: next }) => setModel(next), onFailure: ({ prompt }) => setFailedPrompt(prompt),
  }), [toolConfirmation.receive, frontend]);
  const retryFailedPrompt = useCallback(() => {
    if (failedPrompt) composerHandle.current?.insertText(failedPrompt);
    setFailedPrompt(null);
    panelRef.current?.querySelector("textarea")?.focus();
  }, [failedPrompt, panelRef]);

  // `ChatPane` owns its transcript internally and only takes `initialMessages` at mount — the same
  // constraint `AssistantDock.tsx`'s conversation switcher documents (`key={chats.paneKey}`). There
  // is no `pane.reset()` reachable from a custom `header`, since `header` is a plain `ReactNode`, not
  // a render-prop — so "New thread" here works the identical way a conversation switch does there: a
  // fresh `key` forces a full remount, which is a genuinely empty `ChatPane` instance, not a call
  // into the package's internals. This is composition, not a fork.
  const [hasMessages, setHasMessages] = useState(initialState.messages.length > 0);
  // The read side of `initialMessages`: whatever `ChatPane` currently holds, kept in this component
  // so the persistence effect below has something to serialize. Only consulted by `ChatPane` again at
  // the moment a NEW instance mounts (a `paneKey` bump), never reactively during a `ChatPane`
  // instance's own lifetime — see this file's header for why that ordering is what it is.
  const [persistedMessages, setPersistedMessages] = useState<ChatMessage[]>(initialState.messages);

  // SPEC-046 REQ-1: writes on every change to either half of the persisted state, not just messages —
  // the pane's open/closed state must survive a page load too, "so the widget does not slam shut on
  // arrival at the page it just sent the visitor to."
  useEffect(() => {
    liveState.current = { open, messages: persistedMessages };
    saveSiteAssistantState(liveState.current);
  }, [open, persistedMessages]);

  const resetConversation = useCallback(() => {
    setPaneKey((key) => key + 1);
    setHasMessages(false);
    // "New thread" must clear the PERSISTED copy, not just this render's in-memory state (REQ-1) —
    // otherwise a reload immediately after resetting would rehydrate the conversation right back.
    // Cleared directly here (not left to the effect above) so the guarantee holds even if a future
    // change ever batches or skips that effect.
    setPersistedMessages([]);
    setModel(null);
    setFailedPrompt(null);
    clearSiteAssistantState();
    toolConfirmation.receive({ directive: null });
    liveState.current = { open, messages: [] };
  }, [toolConfirmation.receive, open]);

  const handleMessagesChange = useCallback((messages: ChatMessage[]) => {
    liveState.current = { open, messages };
    setHasMessages(messages.length > 0);
    setPersistedMessages(messages);
  }, [open]);

  return { open, paneKey, panelRef, launcherRef, closePanel, i18n, t, suggestions, toggleOpen,
    comparisonControl, transport, hasMessages, persistedMessages, resetConversation, handleMessagesChange, toolConfirmation,
    model, failedPrompt, retryFailedPrompt, composerHandle };
}
