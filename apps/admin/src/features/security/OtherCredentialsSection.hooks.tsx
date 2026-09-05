import type { ForwardedRef, RefObject } from "react";

import type { OtherCredentialRowState, OtherCredentialsController } from "./hooks/use-other-credentials.hooks";

/**
 * @file `OtherCredentialsSection.tsx`'s `forwardRef` `<dialog>` sub-component's own handlers —
 * `OtherCredentialRemoveDialog`'s close/confirm — split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (admin TSX-logic-sweep: deferred 2026-09-03,
 * fixed 2026-09-05). Mirrors `AccessTokensTab.hooks.tsx`'s `useRemoveConfirmDialog` exactly, for
 * Tier 2's own row shape — see that file's header for why this takes the forwarded ref as a
 * parameter rather than restructuring the dialog into a controlled `open`-prop shape.
 */

export interface OtherCredentialRemoveDialogActions {
  close: () => void;
  confirm: () => void;
}

/**
 * `OtherCredentialRemoveDialog`'s close/confirm — extracted verbatim, same two calls, same order.
 *
 * @param ref - The forwarded ref `OtherCredentialRemoveDialog` receives from its caller.
 * @param row - The credential row this confirm dialog is for.
 * @param controller - `OtherCredentialsController.remove` is the one call this hook makes.
 * @returns `close`/`confirm`, wired directly to the dialog's Cancel/"Remove from Tovu" buttons.
 * @complexity O(1).
 */
export function useOtherCredentialRemoveDialog(
  ref: ForwardedRef<HTMLDialogElement>,
  row: OtherCredentialRowState,
  controller: OtherCredentialsController
): OtherCredentialRemoveDialogActions {
  function close(): void {
    (ref as RefObject<HTMLDialogElement>).current?.close();
  }
  function confirm(): void {
    close();
    void controller.remove(row);
  }
  return { close, confirm };
}
