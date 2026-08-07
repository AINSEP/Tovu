import type { AdminWidgetType } from "../../lib/api";
import { WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/WidgetConfigFields";
import { Select } from "../Select/Select";
import { useWidgetAddControl, useWidgetPickerDialog } from "./WidgetPickerDialog.hooks";

/**
 * @file `WidgetPickerDialog` (`ui.spec.md` §2/§3.9/§4.8) — REQ-33's explicit reuse-vs-duplicate
 * modal. Two call sites: `RegionPlacementList.onAddWidgetRequest` and `WidgetEmbedNode`'s toolbar
 * insertion trigger (`widget-embed-extension.tsx`) — no third call site is authorized by the spec.
 *
 * Mirrors `Collections.tsx`'s `.settings-dialog`/`.settings-dialog-backdrop` modal idiom exactly
 * (`role="dialog"`, `aria-modal`, `aria-labelledby`, Escape-to-close, backdrop-click-to-cancel) —
 * no new modal system invented.
 *
 * `ui.spec.md` §5's rendering rule (followed literally per its own §8 disclosure against ADR-047
 * Amendment 5's "default to reuse" prose): when `existingInstances.length > 0`, BOTH "use existing"
 * and "create new" render as explicit, equally-weighted options with no pre-selected default —
 * implemented here as two always-visible sections, not tabs defaulting to one or the other.
 *
 * Split into this file (props + JSX for both `WidgetPickerDialog` and `WidgetAddControl`) and
 * `WidgetPickerDialog.hooks.tsx` (their state, effects, and the `useExistingInstances` fetch both
 * lean on), per the `@jini-ai/admin` `<Name>.tsx`/`<Name>.hooks.tsx` extraction pattern
 * (`ConfirmDialog.tsx`/`ConfirmDialog.hooks.tsx` in that package). Both components below carry the
 * same kind of injectable seam `ConfirmDialog`'s `useDialog` prop is (`useDialog` here, and
 * `useAddControl` on `WidgetAddControl`) — each does real IO (`useExistingInstances`'s fetch,
 * `useWidgetAddControl`'s `api.createWidget`) or DOM work (the Escape listener, the autofocus
 * effect), so a test can swap either for a fake without touching the network or `document`.
 */

export interface WidgetPickerDialogProps {
  widgetType: AdminWidgetType;
  onUseExisting: (widgetInstanceId: string) => void;
  onCreateNew: (title: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
  /** Injectable seam for the dialog's fetch/form/Escape-listener/autofocus state. Defaults to the
   *  real {@link useWidgetPickerDialog}; a test can pass a fake here to exercise this component's
   *  rendering without the real `listWidgets` fetch or `document`-level Escape listener. */
  useDialog?: typeof useWidgetPickerDialog;
}

export function WidgetPickerDialog({ useDialog = useWidgetPickerDialog, ...props }: WidgetPickerDialogProps) {
  const {
    instances,
    loadError,
    selectedExistingId,
    setSelectedExistingId,
    newTitle,
    setNewTitle,
    newConfig,
    setNewConfig,
    error,
    titleId,
    existingSelectId,
    newTitleInputId,
    newTitleInputRef,
    typeLabel,
    hasExisting,
    submitUseExisting,
    submitCreateNew,
  } = useDialog(props);

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <div
        className="settings-dialog widget-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Place a {typeLabel} widget</h2>

        <div className="widget-picker-body">
          {loadError ? <div className="notice error">{loadError}</div> : null}
          {error ? (
            <span className="save-error" role="alert">
              {error}
            </span>
          ) : null}

          {hasExisting ? (
            <form onSubmit={submitUseExisting} className="widget-picker-section">
              <h3>Use existing</h3>
              <div className="field">
                <label className="field-label" htmlFor={existingSelectId}>
                  Existing {typeLabel} widgets
                </label>
                <Select
                  id={existingSelectId}
                  value={selectedExistingId}
                  onChange={setSelectedExistingId}
                  options={(instances ?? []).map((instance) => ({ value: instance.id, label: instance.title }))}
                  placeholder="Choose a widget…"
                />
              </div>
              <button type="submit">Use this widget</button>
            </form>
          ) : null}

          <form onSubmit={submitCreateNew} className="widget-picker-section">
            <h3>Create new</h3>
            <div className="field">
              <label className="field-label" htmlFor={newTitleInputId}>
                Title
              </label>
              <input id={newTitleInputId} ref={newTitleInputRef} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <WidgetConfigFields widgetType={props.widgetType} config={newConfig} onChange={setNewConfig} />
            <button type="submit">Create and place</button>
          </form>
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button type="button" className="btn-secondary" onClick={props.onCancel}>
              Cancel
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The shared "choose a type, then open `WidgetPickerDialog`" two-step trigger (`ui.spec.md` §4.7's
 * `RegionPlacementList.onAddWidgetRequest` and §4.9's `WidgetEmbedNode.onInsertRequest` both name
 * this exact flow). One small control, reused by `WidgetRegionEditor.tsx`'s "+ Add widget" and the
 * TipTap toolbar's "Insert widget" button — avoids two independent implementations of the same
 * type-choice step.
 */
export interface WidgetAddControlProps {
  triggerLabel: string;
  onResolved: (widgetInstanceId: string) => void | Promise<void>;
  /** Injectable seam for the two-step type-choice/create-or-reuse state. Defaults to the real
   *  {@link useWidgetAddControl}; a test can pass a fake here to exercise this component's
   *  rendering without the real `api.createWidget` call. */
  useAddControl?: typeof useWidgetAddControl;
}

export function WidgetAddControl({ useAddControl = useWidgetAddControl, ...props }: WidgetAddControlProps) {
  const { pickerType, setPickerType, selectedType, setSelectedType, error, handleCreateNew, handleUseExisting } =
    useAddControl(props);

  return (
    <span className="widget-add-control">
      <Select
        value={selectedType}
        onChange={(v) => setSelectedType(v as AdminWidgetType)}
        options={WIDGET_TYPE_OPTIONS}
        aria-label="Widget type"
      />
      <button type="button" onClick={() => setPickerType(selectedType)}>
        {props.triggerLabel}
      </button>
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
      {pickerType ? (
        <WidgetPickerDialog
          widgetType={pickerType}
          onUseExisting={handleUseExisting}
          onCreateNew={handleCreateNew}
          onCancel={() => setPickerType(null)}
        />
      ) : null}
    </span>
  );
}

export { useWidgetAddControl };
