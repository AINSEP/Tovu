import { useId, useRef } from "react";
import { useFocusTrap } from "../../hooks/use-focus-trap.hooks";

import { useWiredMediaEditDialog, type MediaEditDialogValue } from "./MediaEditDialog.hooks";

/**
 * @file `MediaEditDialog` — the `media` doc node's `Edit` action (2026-09-11, owner-directed
 * per-post styling, then a same-day UI revision: renamed from `Style…`/`MediaStyleDialog`, moved
 * BEFORE `Replace` in the node view's action row, and widened to edit `alt` too, alongside
 * `cssClass`/`htmlAttributes` — layered over the referenced asset's own same-named defaults for the
 * latter two at render time (`render.ts`'s `mediaNodeStyleOverride`); `alt` has no such asset-level
 * counterpart, it is purely per-node).
 *
 * A MODAL, not a popover or a right-click context menu (the owner asked about a context menu and
 * it was ruled out: fights the native browser menu, undiscoverable, no touch support). Mirrors
 * `MediaPickerDialog.tsx`'s exact modal chrome (`.settings-dialog`/`.settings-dialog-backdrop`,
 * `role="dialog"`/`aria-modal`/`aria-labelledby`, Escape-to-close, backdrop-click-to-cancel,
 * `useDialog` injection seam) — the SAME modal pattern `MediaEmbedNodeView` already uses for its
 * own `Replace` action, per the owner's explicit direction to follow that established pattern
 * rather than invent a new one.
 *
 * The three fields and the `htmlAttributes` live validation hint are the SAME shape
 * `EditMediaPanel`'s asset-level fields use (`Media.tsx`, same `"Alt text (optional)"`/`"CSS class
 * (optional)"`/`"HTML attributes (optional)"` i18n keys from `MEDIA_DICT`) — an operator who has
 * already used the asset-level fields sees an identical control here, not a second UI to learn.
 * Every string goes through the controller's `t`, so the locale is read once, in the hook.
 */

export interface MediaEditDialogProps {
  /** The `media` node's CURRENT `alt`/`cssClass`/`htmlAttributes` attrs — seeds the draft. */
  initial: MediaEditDialogValue;
  /** Called with the new value on Save — the caller (`MediaEmbedNodeView`) forwards this straight
   *  into `props.updateAttributes`. */
  onSave: (value: MediaEditDialogValue) => void;
  onCancel: () => void;
  /** `false` hides the Alt field and titles the dialog "Style" instead of "Edit this instance" —
   *  the `widgetEmbed` node's own Style action (`widget-embed-extension.tsx`), which has no `alt`
   *  concept of its own. Defaults to `true` (the `media` node's original "Edit" dialog, unchanged).
   *  `save()` still returns whatever `initial.alt` was — hiding the field never touches it. */
  showAlt?: boolean;
  /** Injectable seam for the dialog's draft/validation/Escape hook. Defaults to the real
   *  {@link useWiredMediaEditDialog}; a test can pass a fake here to exercise this component's
   *  rendering without a real `useAdminLocale()` fetch or a real `document` keydown listener. */
  useDialog?: typeof useWiredMediaEditDialog;
}

export function MediaEditDialog({ initial, onSave, onCancel, showAlt = true, useDialog = useWiredMediaEditDialog }: MediaEditDialogProps) {
  const { alt, cssClass, htmlAttributes, setAlt, setCssClass, setHtmlAttributes, htmlAttributesError, save, t, altRef } = useDialog(
    initial,
    onSave,
    onCancel
  );
  // aria-modal promises the background is unavailable; this is what keeps Tab from reaching it.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);
  const titleId = useId();
  const altId = useId();
  const cssClassId = useId();
  const htmlAttributesId = useId();

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      {/* `media-node-edit-dialog`, NOT `media-edit-dialog` — that exact class name is already
          taken by `Media.tsx`'s unrelated native `<dialog>` asset-metadata editor
          (`styles/media.css`'s EDIT MODAL block), which sets its own `border`/`padding`/
          `max-width`/`width` on the bare class. Reusing that name here would leak those rules
          onto this plain `<div>` modal (an extra border, a wider max-width, altered padding),
          producing chrome that silently drifts from `MediaPickerDialog`'s clean `.settings-dialog`
          + unique-marker-class pattern this file's header says it mirrors. */}
      <div ref={dialogRef} className="settings-dialog media-node-edit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{showAlt ? t("Edit this instance") : t("Style")}</h2>

        {showAlt ? (
          <div className="field">
            <label className="field-label" htmlFor={altId}>
              {t("Alt text (optional)")}
            </label>
            <input ref={altRef} id={altId} value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
        ) : null}

        <div className="field">
          <label className="field-label" htmlFor={cssClassId}>
            {t("CSS class (optional)")}
          </label>
          {/* When Alt is hidden (`showAlt={false}`), this is the first field in the dialog, so it
              takes the always-present focus target the hook otherwise points at Alt — see
              `MediaEditDialog.hooks.tsx`'s own header on why a focus target must always exist. */}
          <input ref={showAlt ? undefined : altRef} id={cssClassId} value={cssClass} onChange={(e) => setCssClass(e.target.value)} />
        </div>

        {/* Same live, as-you-type hint `EditMediaPanel`'s asset-level field shows — never gates
            Save, see `MediaEditDialog.hooks.tsx`'s own header for why. */}
        <div className="field">
          <label className="field-label" htmlFor={htmlAttributesId}>
            {t("HTML attributes (optional)")}
          </label>
          <input
            id={htmlAttributesId}
            value={htmlAttributes}
            onChange={(e) => setHtmlAttributes(e.target.value)}
            aria-invalid={htmlAttributesError ? true : undefined}
          />
          {htmlAttributesError ? <p className="field-error">{htmlAttributesError}</p> : null}
          {/* Widget's own extra restriction (D5): the render-time allowlist here is narrower than
              what `parseMediaHtmlAttributes`/`htmlAttributesError` itself validates against, so this
              static note (not gated on any draft state) is the only place that boundary is visible. */}
          {!showAlt ? <p className="field-hint">{t("Only data-* and aria-* attributes are kept.")}</p> : null}
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              {t("Cancel")}
            </button>
            <button type="button" className="btn-primary" onClick={save}>
              {t("Save")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
