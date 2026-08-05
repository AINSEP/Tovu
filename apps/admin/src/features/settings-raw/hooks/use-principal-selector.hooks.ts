import { useEffect, useState } from "react";

/**
 * @file The `PrincipalSelector` form's own draft-input lifecycle, so `PrincipalSelector` in
 * `Settings.tsx` is only markup.
 *
 * Extracted verbatim — same state, same effect, same submit branch. `PrincipalSelector` does not
 * own the target principal itself: `value` (and the sibling `validationState`/`lastError` render
 * props) are `SettingsContainer`'s state (see `use-settings-container.hooks.ts`), passed down as
 * props. This hook owns only the uncommitted text the operator is typing before submit — resynced
 * from `value` whenever the container's committed target principal changes, including being
 * cleared.
 */

export interface PrincipalSelectorHookProps {
  value: string | null;
  onSubmitPrincipal: (principalIdRaw: string) => void;
  onClearPrincipal: () => void;
}

export interface PrincipalSelectorController {
  draft: string;
  setDraft: (draft: string) => void;
  /** Empty draft clears the target principal instead of submitting it — the "Clear" button and an
   *  empty-submit both funnel through the same clear path. */
  submit: (e: React.FormEvent) => void;
}

/** @complexity Time/space: O(1) per call. */
export function usePrincipalSelector(props: PrincipalSelectorHookProps): PrincipalSelectorController {
  const [draft, setDraft] = useState(props.value ?? "");

  useEffect(() => {
    setDraft(props.value ?? "");
  }, [props.value]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim() === "") {
      props.onClearPrincipal();
      return;
    }
    props.onSubmitPrincipal(draft.trim());
  }

  return { draft, setDraft, submit };
}
