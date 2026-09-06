/**
 * @file The seam between this feature and `@jini-ai/chat`'s composer.
 *
 * **No Jini API was added for this.** `ChatPane` already publishes a `ChatPaneComposerHandle` on a
 * host-supplied ref (`composerHandle`, shipped 2026-08-31 in `de436905` for a desktop drag-drop
 * path), whose `insertText` APPENDS onto whatever the operator has already typed rather than
 * replacing the draft — exactly the "must not clobber a half-written message" requirement voice
 * input has. A transcript is therefore delivered through the same, already-tested seam a dropped
 * folder path is.
 *
 * The joining rule is `@jini-ai/chat`'s own `appendComposerDiscovery`: a whitespace-only draft is
 * REPLACED by the inserted text, anything else gets `" "` + the text appended to its trimmed end.
 * That is what quietly disposes of the single space the hold-space gesture's first keydown types —
 * see `space-hold-rules.ts`.
 */

import { useCallback, useRef } from "react";
import type { ChatPaneComposerHandle } from "@jini-ai/chat/react";

export interface ComposerVoiceInput {
  /** Pass straight to `<ChatPane composerHandle={…}>`; the pane populates it on mount. */
  composerHandle: React.RefObject<ChatPaneComposerHandle | null>;
  /** Pass to `<PushToTalkMicButton onTranscript={…}>`. */
  insertTranscript: (text: string) => void;
}

/**
 * Owns the composer handle a voice transcript is delivered through.
 *
 * Insertion is a no-op before the pane mounts and after it unmounts (`composerHandle.current` is
 * `null` in both windows, per `ChatPaneComposerHandle`'s own contract) — a transcript that resolves
 * after the dock closed has nowhere to go, and dropping it is correct.
 *
 * @complexity Time/space: O(1).
 */
export function useComposerVoiceInput(): ComposerVoiceInput {
  const composerHandle = useRef<ChatPaneComposerHandle | null>(null);
  const insertTranscript = useCallback((text: string) => {
    composerHandle.current?.insertText(text);
  }, []);
  return { composerHandle, insertTranscript };
}
