import { useRef } from "react";
import { useT } from "@jini-ai/chat/react";

import { useMicButtonView } from "./hooks/mic-button-view.hooks";
import { usePushToTalk, type UsePushToTalkOverrides } from "./hooks/use-push-to-talk.hooks";
import { useSpaceHoldToTalk } from "./hooks/use-space-hold-to-talk.hooks";
import "./push-to-talk-mic-button.css";

/**
 * @file The composer's push-to-talk mic button — a `leadingAccessory` slot consumer for
 * `@jini-ai/chat/react`'s `ChatPane` (see `ComposerSlots`'s own docstring: "it renders the slots a
 * host supplies; it does not itself know what a 'library picker' or 'session mode' is"). This
 * component is that host-supplied content, and no change to `@jini-ai/chat` was needed for any of
 * it — the slot and the draft-insertion handle both already existed.
 *
 * Two ways to talk, one controller behind both:
 * - Press and hold this button (`startHold`/`endHold`).
 * - Hold the spacebar in an EMPTY composer (`useSpaceHoldToTalk`) — see `space-hold-rules.ts` for
 *   why the gesture is gated on emptiness and what happens to the space itself.
 *
 * Rendering states are resolved in `mic-button-view.hooks.ts`, including why an unavailable runtime
 * now renders a disabled button with a reason rather than nothing at all.
 */
export interface PushToTalkMicButtonProps {
  /** Receives the transcript once a recording finishes with non-empty content. Wire this to
   *  `ChatPane`'s `composerHandle.insertText` — see `use-composer-voice-input.hooks.ts`. */
  onTranscript: (text: string) => void;
  /** Injectable seam for testing (a fake voice port and/or capture backend), same "useX" DI
   *  convention `AssistantDockProps` already uses throughout this app. A real caller omits it. */
  overrides?: UsePushToTalkOverrides;
}

export function PushToTalkMicButton({ onTranscript, overrides }: PushToTalkMicButtonProps) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const { available, unavailableReason, indicator, startHold, endHold } = usePushToTalk({ onTranscript }, overrides);
  const view = useMicButtonView({ available, indicator, unavailableReason });
  useSpaceHoldToTalk({
    anchorRef: buttonRef,
    enabled: available === true,
    onEngage: startHold,
    onRelease: endHold,
  });

  if (!view) return null;

  return (
    <button
      ref={buttonRef}
      type="button"
      className={view.className}
      disabled={view.disabled}
      aria-pressed={view.isRecording}
      aria-label={t(view.label)}
      title={t(view.label)}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
    >
      <span className="tovu-push-to-talk__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </span>
      {view.isRecording ? <span className="tovu-push-to-talk__dot" aria-hidden="true" /> : null}
      <span className="tovu-push-to-talk__sr-status" role="status" aria-live={view.ariaLive}>
        {t(view.label)}
      </span>
    </button>
  );
}
