import { useState, type ForwardedRef, type RefObject } from "react";

import { customCredentialReadyToSave, isValidHttpUrl, type AccessTokenRow } from "./rules";
import type { AccessTokensController } from "./hooks/use-access-tokens.hooks";

/**
 * @file `AccessTokensTab.tsx`'s two `forwardRef` `<dialog>` sub-components' own state and
 * handlers — `RemoveConfirmDialog`'s close/confirm, and `AddCustomCredentialDialog`'s show/hide
 * toggle, ready-to-save/base-URL validity, and close/save — split out per the
 * `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern (admin TSX-logic-sweep: deferred 2026-09-03,
 * fixed 2026-09-05).
 *
 * Each dialog receives its `ref` FROM `forwardRef` (the parent calls `ref.current?.showModal()`
 * imperatively) rather than owning one via its own `useRef` — these hooks take that same forwarded
 * ref as a parameter and cast it the same way the original inline code did
 * (`(ref as RefObject<HTMLDialogElement>).current`), rather than restructuring either dialog into
 * the controlled `open`-prop shape `ConfirmDialog`/`ImagePreviewModal` use elsewhere. That would
 * change this file's public dialog API — a rewrite, not the pure relocation this pass does.
 */

export interface RemoveConfirmDialogActions {
  close: () => void;
  confirm: () => void;
}

/**
 * `RemoveConfirmDialog`'s close/confirm — extracted verbatim, same two calls, same order.
 *
 * @param ref - The forwarded ref `RemoveConfirmDialog` receives from its caller.
 * @param row - The token row this confirm dialog is for.
 * @param controller - `AccessTokensController.removeToken` is the one call this hook makes.
 * @returns `close`/`confirm`, wired directly to the dialog's Cancel/"Remove from Tovu" buttons.
 * @complexity O(1).
 */
export function useRemoveConfirmDialog(
  ref: ForwardedRef<HTMLDialogElement>,
  row: AccessTokenRow,
  controller: AccessTokensController
): RemoveConfirmDialogActions {
  function close(): void {
    (ref as RefObject<HTMLDialogElement>).current?.close();
  }
  function confirm(): void {
    close();
    void controller.removeToken(row);
  }
  return { close, confirm };
}

export interface AddCustomCredentialDialogState {
  showToken: boolean;
  toggleShowToken: () => void;
  readyToSave: boolean;
  baseUrlInvalid: boolean;
  close: () => void;
  save: () => Promise<void>;
}

/**
 * `AddCustomCredentialDialog`'s local show/hide toggle, its two save-readiness checks, and its
 * close/save handlers — extracted verbatim, same computation, same inputs/outputs.
 *
 * @param ref - The forwarded ref `AddCustomCredentialDialog` receives from its caller.
 * @param controller - Reads `controller.customAddForm`; calls `resetCustomAddForm`/
 *   `createCustomCredential`.
 * @returns `showToken`/`toggleShowToken` for the token field's Show/Hide button,
 *   `readyToSave`/`baseUrlInvalid` for the form's own validity checks, and `close`/`save`.
 * @complexity O(1).
 */
export function useAddCustomCredentialDialog(
  ref: ForwardedRef<HTMLDialogElement>,
  controller: AccessTokensController
): AddCustomCredentialDialogState {
  const [showToken, setShowToken] = useState(false);
  const form = controller.customAddForm;
  const readyToSave = customCredentialReadyToSave(form);
  const baseUrlInvalid = form.baseUrl.trim() !== "" && !isValidHttpUrl(form.baseUrl.trim());

  function toggleShowToken(): void {
    setShowToken((prev) => !prev);
  }
  function close(): void {
    (ref as RefObject<HTMLDialogElement>).current?.close();
    controller.resetCustomAddForm();
    setShowToken(false);
  }
  async function save(): Promise<void> {
    const ok = await controller.createCustomCredential();
    if (ok) {
      (ref as RefObject<HTMLDialogElement>).current?.close();
      setShowToken(false);
    }
  }

  return { showToken, toggleShowToken, readyToSave, baseUrlInvalid, close, save };
}
