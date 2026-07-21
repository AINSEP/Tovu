import { useEffect, useState } from "react";
import { api, ApiError, type AdminWidget, type AdminWidgetType } from "../lib/api";
import { defaultWidgetConfig, WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "./WidgetConfigFields";

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

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
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
        aria-labelledby="widget-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="widget-picker-title">Place a {typeLabel} widget</h2>

        {loadError ? <div className="notice error">{loadError}</div> : null}
        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        {hasExisting ? (
          <form onSubmit={submitUseExisting} className="widget-picker-section">
            <h3>Use existing</h3>
            <label htmlFor="widget-picker-existing">Existing {typeLabel} widgets</label>
            <select id="widget-picker-existing" value={selectedExistingId} onChange={(e) => setSelectedExistingId(e.target.value)}>
              <option value="">Choose a widget…</option>
              {(instances ?? []).map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.title}
                </option>
              ))}
            </select>
            <button type="submit">Use this widget</button>
          </form>
        ) : null}

        <form onSubmit={submitCreateNew} className="widget-picker-section">
          <h3>Create new</h3>
          <label htmlFor="widget-picker-new-title">Title</label>
          <input id="widget-picker-new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus={!hasExisting} />
          <WidgetConfigFields widgetType={props.widgetType} config={newConfig} onChange={setNewConfig} />
          <button type="submit">Create and place</button>
        </form>

        <span className="editor-actions">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </span>
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
      <select value={selectedType} onChange={(e) => setSelectedType(e.target.value as AdminWidgetType)} aria-label="Widget type">
        {WIDGET_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
