import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file The eye-icon "View Template" trigger that sits left of a template-choice `<select>` — opens
 * a {@link TemplateSourceModal `TemplateSourceModal`} showing the selected template's read-only HTML
 * source.
 *
 * Shared by `features/posts/PostEditor.tsx` and `features/pages/PageEditor.tsx`'s template pickers
 * (extracted out of `PostEditor.tsx`'s `PostEditorTemplatePicker`, 2026-09-24, once Pages grew the
 * identical affordance — the button's markup, styling (`.view-template-btn`, `styles.css`) and
 * accessibility contract were already feature-agnostic, so this is the one shared component both
 * editors render instead of two hand-copied `<button>` blocks that could drift apart). Icon-only
 * (2026-09-22 owner ask, moved left of the picker): the visible word is gone, but `aria-label`/
 * `title` still carry `t("View Template")` so the accessible name and translation key are
 * unchanged from the old text button.
 */
export interface ViewTemplateButtonProps {
  /** Disabled once nothing is selected to view (the picker's "No template chosen"/"Theme default"
   *  states) — same as the toolbar's other per-file action buttons, absence-vs-disabled decided by
   *  each caller. */
  disabled: boolean;
  onClick: () => void;
  t: Translate;
  /** Agent-handle id — distinguishes the Post and Page editors' otherwise-identical buttons in the
   *  agent-driving surface (`post-view-template` / `page-view-template`), so an agent can target
   *  the one that belongs to the screen it's actually on. */
  agentHandleId: string;
}

export function ViewTemplateButton({ disabled, onClick, t, agentHandleId }: ViewTemplateButtonProps) {
  return (
    <button
      type="button"
      className="view-template-btn"
      disabled={disabled}
      onClick={onClick}
      aria-label={t("View Template")}
      title={t("View Template")}
      {...agentHandle(agentHandleId, {
        role: "button",
        label: "Open a read-only view of the selected template's HTML source. Nothing here is editable.",
      })}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}
