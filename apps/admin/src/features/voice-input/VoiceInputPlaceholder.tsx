import { useT } from "@jini-ai/chat/react";
import { RemixIcon } from "@jini-ai/ui";

/**
 * @file The composer footer's grayed mic while voice input is switched off (`VOICE_INPUT_ENABLED`):
 * it holds the mic's slot so the footer keeps its final shape (owner, 2026-10-30), and says voice
 * is coming. `aria-disabled` rather than `disabled`, so it stays focusable and its label is read.
 */
export function VoiceInputPlaceholder() {
  const t = useT();
  const label = t("Voice input (coming soon)");
  return (
    <button type="button" className="jini-composer-attach tovu-voice-placeholder" aria-disabled="true" title={label} aria-label={label}>
      <RemixIcon name="mic-line" size={18} />
    </button>
  );
}
