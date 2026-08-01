import { useEffect, useId, useRef } from "react";

/**
 * @file Shared modal confirmation primitive — replaces `window.confirm` (still called from 7
 * screens: `Comments.tsx`, `Integrations.tsx`, `Media.tsx`, `Menus.tsx`, `MenuEditor.tsx`,
 * `WidgetsLibrary.tsx`, `PostEditor.tsx`). `window.confirm` blocks the whole tab, cannot carry
 * destructive-vs-neutral styling, and reads as a browser artifact rather than part of the
 * product. This dispatch builds the primitive and wires it into `Posts.tsx`/`Pages.tsx` only —
 * migrating the other 7 callers is a later pass, so their `window.confirm` calls are untouched.
 *
 * Built on the native `<dialog>` element (`showModal()`/`close()`) rather than the
 * `.settings-dialog`/`.settings-dialog-backdrop` plain-`<div>` idiom `WidgetPickerDialog.tsx` and
 * `Collections.tsx` already use — that idiom hand-rolls focus trapping, Escape handling, and a
 * backdrop `<div>`, all of which the browser's own top layer gives a real `<dialog>` for free,
 * including correct stacking above everything else on the page without a chosen `z-index`. Not a
 * blanket replacement for that older idiom in this dispatch (out of scope), just the better
 * foundation for this new primitive.
 *
 * `dialog.showModal()`/`dialog.close()` are guarded by a `typeof` check rather than called
 * unconditionally: jsdom 29 (this package's unit-test environment, verified directly rather than
 * assumed) does not implement either method at all — calling them throws `TypeError`. The
 * fallback branch below toggles the plain `open` attribute instead, which every real browser Tovu
 * ships to never takes (the `showModal`/`close` branch always wins there), so this only changes
 * behavior under RTL/jsdom, where it keeps the dialog mountable and its content queryable.
 */

/** The three action tiers this design system distinguishes (`styles.css`'s `--warning` token
 *  comment and the row-scoped `.btn-danger`/`.btn-warning` rules): `"default"` for a neutral
 *  confirm, `"warning"` for reversible-but-access-affecting actions (e.g. Disable), `"danger"` for
 *  genuinely destructive ones (e.g. Delete). */
export type ConfirmTone = "default" | "warning" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** @default "Cancel" */
  cancelLabel?: string;
  /** Applies `.btn-warning`/`.btn-danger` to the confirm action. Defaults to `"default"` (no
   *  class, the plain primary button). Wins over `destructive` below when both are passed. */
  tone?: ConfirmTone;
  /** @deprecated Use `tone: "danger"` instead — this only ever expressed the danger tier, and the
   *  design system has a second one (`"warning"`) this boolean cannot reach. Kept working (mapped
   *  to `tone: "danger"` when `tone` is not set) for existing callers (`Posts.tsx`, `Pages.tsx`,
   *  `PostEditor.tsx`) rather than a breaking rename. */
  destructive?: boolean;
  /** External in-flight flag. Disables both actions and blocks Escape/backdrop dismissal so a
   *  request already underway cannot be raced by a second dismiss. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DEFAULT_CANCEL_LABEL = "Cancel";

/** `tone` wins when both `tone` and the deprecated `destructive` are passed; `destructive: true`
 *  alone still maps to `"danger"` (its only prior meaning) for callers that haven't migrated. */
function resolveTone(props: Pick<ConfirmDialogProps, "tone" | "destructive">): ConfirmTone {
  return props.tone ?? (props.destructive ? "danger" : "default");
}

function toneClassName(tone: ConfirmTone): string | undefined {
  if (tone === "danger") return "btn-danger";
  if (tone === "warning") return "btn-warning";
  return undefined;
}

/**
 * Controlled modal confirm. The caller keeps this mounted and toggles `open` — it is never
 * conditionally rendered by its parent — so the effect below has a stable `<dialog>` element to
 * call `showModal()`/`close()` on and to restore focus through when it closes.
 *
 * Focus moves to the *cancel* action on open, not confirm — an operator whose first keystroke
 * after a slow read-through is Enter should land on the safe action, not the destructive one.
 * Both actions are plain `type="button"` (no `<form method="dialog">`, no `type="submit"`), so
 * there is no browser-assigned "default button" for Enter to reach for at all; confirm can only
 * ever fire from an explicit click or explicit Tab-then-Enter onto it.
 *
 * @complexity O(1) per open/close transition — one `showModal`/`close` call and one focus move.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // `useId()`, not a string literal — a hardcoded `"confirm-dialog-title"` broke the moment a
  // screen mounted two `ConfirmDialog`s at once (`Roles.tsx`'s role-delete and policy-delete, both
  // stay-mounted/toggle-`open` per this component's own doc comment above): two `<h2>`s shared one
  // id, and `aria-labelledby` resolves via `getElementById`, which always returns the FIRST match
  // in document order regardless of which dialog is actually open — a screen reader announced
  // "Delete role?" while the operator was about to confirm "Delete policy?", on a destructive
  // action. `useId()` gives every mounted instance its own id for free.
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Captured at the moment `open` flips true, before focus moves into the dialog — the element
  // that had focus then is, by construction, whatever triggered this dialog (a `RowMenu` item's
  // "Delete" in `Posts.tsx`/`Pages.tsx`, a plain trigger button in `PostEditor.tsx`/`Roles.tsx`,
  // and more callers since). Restored on close rather than left wherever the browser's own
  // modal-focus algorithm happened to land (its default without this is `<body>`, which drops a
  // keyboard user back to the top of the page).
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open) {
      triggerRef.current = document.activeElement;
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      cancelRef.current?.focus();
    } else {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    }
  }, [props.open]);

  function handleNativeCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    // Fires on Escape while a real `showModal()`-opened dialog has focus. Always prevented: the
    // effect above is the single source of truth for open/closed (driven by `props.open`), so
    // letting the browser close the element on its own would desync DOM state from React state.
    // Escape still closes the dialog — it just does so by routing through `onCancel`, same as a
    // Cancel-button click, so the caller's `open` state (and therefore this same effect) is what
    // actually calls `dialog.close()`.
    e.preventDefault();
    if (props.pending) return;
    props.onCancel();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // A `<dialog>` element's own box is sized to its content, not the viewport — a click that
    // lands on the `<dialog>` element itself (as opposed to one of its children) is therefore a
    // click on the backdrop area outside that content box.
    if (props.pending) return;
    if (e.target === dialogRef.current) props.onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      onCancel={handleNativeCancel}
      onClick={handleBackdropClick}
    >
      <h2 id={titleId}>{props.title}</h2>
      <div className="confirm-dialog-body">{props.body}</div>
      <div className="confirm-dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn-secondary"
          disabled={props.pending}
          onClick={props.onCancel}
        >
          {props.cancelLabel ?? DEFAULT_CANCEL_LABEL}
        </button>
        <button
          type="button"
          className={toneClassName(resolveTone(props))}
          disabled={props.pending}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
