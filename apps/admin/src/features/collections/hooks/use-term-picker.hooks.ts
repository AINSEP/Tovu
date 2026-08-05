import { useState } from "react";
import { api, describeApiError } from "../../../lib/api";

/**
 * @file `TermPicker`'s own state and async action, extracted so it is reachable from `renderHook`
 * without rendering `CollectionEntryEditor`'s surrounding editor shell. `TermPicker` is a nested
 * sub-component, but it owns a genuinely separate stateful unit (its own selection set, its own
 * save-in-flight/message/error, its own `assignTerms` call) — not a piece of the parent editor's
 * state — so it gets its own hook rather than folding into `use-collection-entry-editor.hooks.ts`.
 *
 * Naming follows `hooks/use-settings-slice.hooks.ts` and `hooks/use-dirty-guard.hooks.ts`:
 * `use-<thing>.hooks.ts`. Feature-local because nothing outside `features/collections` needs it;
 * promote to `src/hooks/` only when a second feature actually does.
 */

export interface TermPickerController {
  selected: Set<string>;
  toggle: (termId: string) => void;
  saving: boolean;
  message: string | null;
  error: string | null;
  assign: () => Promise<void>;
}

export function useTermPicker(props: { contentType: string; contentId: string }): TermPickerController {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(termId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  async function assign() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.assignTerms({ contentType: props.contentType, contentId: props.contentId, termIds: [...selected] });
      setMessage(`Assigned ${selected.size} term(s).`);
      setSelected(new Set());
    } catch (e) {
      setError(describeApiError(e, "Failed to assign terms"));
    } finally {
      setSaving(false);
    }
  }

  return { selected, toggle, saving, message, error, assign };
}
