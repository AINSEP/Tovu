import { useT } from "@jini-ai/chat/react";

import { usePushToTalk, type UsePushToTalkOverrides } from "./hooks/use-push-to-talk.hooks";
import "./push-to-talk-mic-button.css";

/**
 * @file The composer's push-to-talk mic button — a `leadingAccessory`/`ComposerPlusItem`-shaped
 * slot consumer for `@jini-ai/chat/react`'s `ChatPane` (see `ComposerSlots`'s own docstring: "it
 * renders the slots a host supplies; it does not itself know what a 'library picker' or 'session
 * mode' is"). This component is that host-supplied content.
 *
 * Renders NOTHING until the desktop shell confirms on-device transcription is actually available
 * (`usePushToTalk`'s `available` starts `null` during the probe, then settles `true`/`false`) —
 * never a disabled-looking button that implies voice input almost works. This is also why nothing
 * here needs a Jini edit: the slot already exists, this is only the content poured into it.
 *
 * **Not wired into `AssistantDock.tsx` yet** — see this feature's handoff notes for why
 * (`apps/admin/src/components/**` is off-limits to this change) and the exact one-line
 * `leadingAccessory` addition needed.
 */
export interface PushToTalkMicButtonProps {
  onTranscript: (text: string) => void;
  /** Injectable seam for testing (a fake voice port and/or capture backend), same "useX" DI
   *  convention `AssistantDockProps` already uses throughout this app. A real caller omits it. */
  overrides?: UsePushToTalkOverrides;
}

export function PushToTalkMicButton({ onTranscript, overrides }: PushToTalkMicButtonProps) {
  const t = useT();
  const { available, indicator, handlePointerDown, handlePointerUp } = usePushToTalk({ onTranscript }, overrides);

  if (available !== true) return null;

  return (
    <button
      type="button"
      className={`tovu-push-to-talk${indicator.isRecording ? " tovu-push-to-talk--recording" : ""}`}
      aria-pressed={indicator.isRecording}
      aria-label={t(indicator.label)}
      title={t(indicator.label)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <span className="tovu-push-to-talk__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </span>
      {indicator.isRecording ? <span className="tovu-push-to-talk__dot" aria-hidden="true" /> : null}
      <span className="tovu-push-to-talk__sr-status" role="status" aria-live={indicator.ariaLive}>
        {t(indicator.label)}
      </span>
    </button>
  );
}
