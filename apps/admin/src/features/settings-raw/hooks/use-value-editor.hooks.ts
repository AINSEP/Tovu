import { useState } from "react";

import { parseJsonInput } from "../rules";

/**
 * @file The `ValueEditor` form's own draft-input and validation lifecycle, so `ValueEditor` in
 * `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same state, same submit branch. Unlike `PrincipalSelector`, there is
 * deliberately no effect resyncing `draft` when `currentValue` changes underneath it (e.g. a
 * reload after another scope's save): the operator's in-progress edit is not clobbered by a
 * background refresh. This was true of the original inline implementation and is preserved as-is.
 */

export interface ValueEditorHookProps {
  currentValue: unknown;
  onSubmitValue: (valueJson: unknown) => void;
}

export interface ValueEditorController {
  draft: string;
  setDraft: (draft: string) => void;
  validationError: string | null;
  setValidationError: (error: string | null) => void;
  submit: (e: React.FormEvent) => void;
}

/** @complexity Time/space: O(1) per call; `submit`'s cost is `parseJsonInput`'s, O(n) in draft length. */
export function useValueEditor(props: ValueEditorHookProps): ValueEditorController {
  const [draft, setDraft] = useState(() => (props.currentValue == null ? "" : JSON.stringify(props.currentValue)));
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseJsonInput(draft);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    setValidationError(null);
    props.onSubmitValue(parsed.value);
  }

  return { draft, setDraft, validationError, setValidationError, submit };
}
