import { useEffect, useId, useRef, useState } from "react";
import { api, ApiError, describeApiError, type AdminWidget, type AdminWidgetType } from "../lib/api";
import { defaultWidgetConfig, WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "./WidgetConfigFields";
import { Select } from "./Select";

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
 */

export interface WidgetPickerDialogProps {
  widgetType: AdminWidgetType;
  onUseExisting: (widgetInstanceId: string) => void;
  onCreateNew: (title: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
}

function useExistingInstances(widgetType: AdminWidgetType) {
  const [instances, setInstances] = useState<AdminWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .listWidgets({ widgetType })
      .then((r) => setInstances(r.widgets))
      .catch((e) => setError(describeApiError(e, "failed to load existing widgets")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetType]);
  return { instances, error };
}

export function WidgetPickerDialog(props: WidgetPickerDialogProps) {
  const { instances, error: loadError } = useExistingInstances(props.widgetType);
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newConfig, setNewConfig] = useState<Record<string, unknown>>(() => defaultWidgetConfig(props.widgetType));
  const [error, setError] = useState<string | null>(null);
  // `useId()`, not string literals — this component is conditionally mounted per caller
  // (`WidgetAddControl`'s `{pickerType ? <WidgetPickerDialog .../> : null}`), and only one
  // `WidgetAddControl` exists per screen today, so two instances can't currently coexist in the
  // DOM to collide. Fixed anyway (same `ConfirmDialog.tsx` id-collision class of bug, found live
  // there via `Roles.tsx`'s two always-mounted dialogs) because the cost is a three-line diff and
  // the alternative is a landmine for whoever adds a second widget control to one screen later —
  // `aria-labelledby`/`htmlFor` both resolve via `getElementById`, which silently returns the
  // first DOM match rather than erroring on a duplicate id.
  const titleId = useId();
  const existingSelectId = useId();
  const newTitleInputId = useId();
  const newTitleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeLabel = WIDGET_TYPE_OPTIONS.find((o) => o.value === props.widgetType)?.label ?? props.widgetType;
  const hasExisting = (instances?.length ?? 0) > 0;

  // Found live in a real browser, not in this file's own jsdom suite: `instances` starts `null`
  // (the `listWidgets` fetch is still in flight) on the Title input's very first paint, so
  // `hasExisting` always reads `false` at that instant regardless of the real answer — a plain
  // `autoFocus={!hasExisting}` on the `<input>` below therefore focused Title unconditionally on
  // EVERY open, including widget types that already have existing instances (verified: "Live test
  // footer note" already existed for `text`, yet Title still carried the visible focus ring).
  // `autoFocus` only ever fires once, at that initial DOM insertion — by the time the fetch
  // resolves and `hasExisting` flips to its real value a moment later, the element is not
  // remounted, so nothing re-evaluates the decision. This effect defers the decision until
  // `instances` has actually resolved, matching what `ui.spec.md` §5 (quoted in this file's own
  // header) asks for: no pre-selected default when existing instances are real options.
  useEffect(() => {
    if (instances === null) return;
    if (!hasExisting) newTitleInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);

  function submitUseExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedExistingId) {
      setError("Choose an existing widget to use.");
      return;
    }
    props.onUseExisting(selectedExistingId);
  }

  function submitCreateNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      setError("Title is required.");
      return;
    }
    props.onCreateNew(newTitle.trim(), newConfig);
  }

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
export function WidgetAddControl(props: {
  triggerLabel: string;
  onResolved: (widgetInstanceId: string) => void | Promise<void>;
}) {
  const [pickerType, setPickerType] = useState<AdminWidgetType | null>(null);
  const [selectedType, setSelectedType] = useState<AdminWidgetType>("text");
  const [error, setError] = useState<string | null>(null);

  async function handleCreateNew(title: string, config: Record<string, unknown>) {
    if (!pickerType) return;
    try {
      const { widget } = await api.createWidget({ widgetType: pickerType, title, config });
      setPickerType(null);
      await props.onResolved(widget.id);
    } catch (e) {
      setError(describeApiError(e, "failed to create widget"));
    }
  }

  async function handleUseExisting(widgetInstanceId: string) {
    setPickerType(null);
    await props.onResolved(widgetInstanceId);
  }

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
