import { useRef } from "react";
import { agentHandle, type AgentElementRole } from "@jini-ai/agentic";
import { useFocusTrap } from "../../hooks/use-focus-trap.hooks";
import type { AdminWidget, AdminWidgetType } from "../../lib/api";
import { interpolate } from "../../lib/template-i18n";
import { widgetTypeLabel } from "../../features/widgets/rules";
import { WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/WidgetConfigFields";
import { Select, type SelectOption } from "../Select/Select";
import { useWidgetAddControl, useWiredWidgetAddControl, useWiredWidgetPickerDialog } from "./WidgetPickerDialog.hooks";

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
 *
 * ## Agent handles
 *
 * Given `agentHandle="place-widget"` this publishes:
 *
 * | element | handle | role |
 * |---|---|---|
 * | the "use existing" select (when shown) | `place-widget-existing-select` | via `Select`'s own scheme |
 * | the "Use this widget" submit | `place-widget-existing-submit` | `button` |
 * | the new-title field | `place-widget-new-title` | `field` |
 * | the config sub-form | `place-widget-new-config` | via `WidgetConfigFields`'s own scheme |
 * | the "Create and place" submit | `place-widget-new-submit` | `button` |
 * | the Cancel button | `place-widget-cancel` | `button` |
 *
 * Omit `agentHandle` and no `data-agent-*` markup is emitted at all, including inside the two
 * composed components above — they only tag their own sub-elements when handed a base.
 */

/** `{...(base ? agentHandle(\`${base}-<suffix>\`, opts) : {})}` as a named helper — same
 *  complexity-budget rationale as `Select.tsx`'s `resolveSelectTriggerHandleProps`: this dialog
 *  spreads a conditional agent-handle six times, and each was its own branch in
 *  `WidgetPickerDialog`'s own cyclomatic count. `{}` (no markup) when `base` is unset, same as
 *  every inline occurrence it replaces. */
function handleSpread(base: string | undefined, suffix: string, opts: { role: AgentElementRole; label: string }): Record<string, unknown> {
  return base ? agentHandle(`${base}-${suffix}`, opts) : {};
}

/** `base ? \`${base}-<suffix>\` : undefined` as a named helper — the sub-handle string handed to a
 *  composed component (`Select`/`WidgetConfigFields`) rather than spread as `data-agent-*`
 *  attributes directly. Same rationale as {@link handleSpread}. */
function subHandle(base: string | undefined, suffix: string): string | undefined {
  return base ? `${base}-${suffix}` : undefined;
}

/** `(instances ?? []).map(...)` as a named helper — moves that `??` branch, plus the map's own
 *  shape conversion, out of `WidgetPickerDialog`'s own scope. Same value as the inline expression
 *  it replaces: one `SelectOption` per loaded instance, empty while `instances` is still `null`. */
function toExistingOptions(instances: AdminWidget[] | null): SelectOption[] {
  return (instances ?? []).map((instance) => ({ value: instance.id, label: instance.title }));
}

export interface WidgetPickerDialogProps {
  widgetType: AdminWidgetType;
  onUseExisting: (widgetInstanceId: string) => void;
  onCreateNew: (title: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
  /** Injectable seam for the dialog's fetch/form/Escape-listener/autofocus state. Defaults to the
   *  real {@link useWiredWidgetPickerDialog}; a test can pass a fake here to exercise this
   *  component's rendering without the real `listWidgets` fetch or `document`-level Escape
   *  listener. */
  useDialog?: typeof useWiredWidgetPickerDialog;
  /** This dialog's own base handle — see this file's "Agent handles" doc for the full scheme. Omit
   *  to leave it untagged. */
  agentHandle?: string;
}

export function WidgetPickerDialog({ useDialog = useWiredWidgetPickerDialog, agentHandle: base, ...props }: WidgetPickerDialogProps) {
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
    t,
  } = useDialog(props);
  // aria-modal promises the background is unavailable; this is what keeps Tab from reaching it.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef);

  return (
    <div className="settings-dialog-backdrop" onClick={props.onCancel}>
      <div
        ref={dialogRef}
        className="settings-dialog widget-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{interpolate(t("Place a {typeLabel} widget"), { typeLabel })}</h2>

        <div className="widget-picker-body">
          {loadError ? <div className="notice error">{loadError}</div> : null}
          {error ? (
            <span className="save-error" role="alert">
              {error}
            </span>
          ) : null}

          {hasExisting ? (
            <form onSubmit={submitUseExisting} className="widget-picker-section">
              <h3>{t("Use existing")}</h3>
              <div className="field">
                <label className="field-label" htmlFor={existingSelectId}>
                  {interpolate(t("Existing {typeLabel} widgets"), { typeLabel })}
                </label>
                <Select
                  id={existingSelectId}
                  value={selectedExistingId}
                  onChange={setSelectedExistingId}
                  options={toExistingOptions(instances)}
                  placeholder={t("Choose a widget…")}
                  agentHandle={subHandle(base, "existing-select")}
                  t={t}
                />
              </div>
              <button type="submit" {...handleSpread(base, "existing-submit", { role: "button", label: "Use this widget" })}>
                {t("Use this widget")}
              </button>
            </form>
          ) : null}

          <form onSubmit={submitCreateNew} className="widget-picker-section">
            <h3>{t("Create new")}</h3>
            <div className="field">
              <label className="field-label" htmlFor={newTitleInputId}>
                {t("Title")}
              </label>
              <input
                id={newTitleInputId}
                ref={newTitleInputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                {...handleSpread(base, "new-title", { role: "field", label: "The new widget's title" })}
              />
            </div>
            <WidgetConfigFields
              widgetType={props.widgetType}
              config={newConfig}
              onChange={setNewConfig}
              agentHandle={subHandle(base, "new-config")}
            />
            <button type="submit" {...handleSpread(base, "new-submit", { role: "button", label: "Create and place this widget" })}>
              {t("Create and place")}
            </button>
          </form>
        </div>

        <div className="widget-picker-footer">
          <span className="editor-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={props.onCancel}
              {...handleSpread(base, "cancel", { role: "button", label: "Close without placing a widget" })}
            >
              {t("Cancel")}
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
 *
 * ## Agent handles
 *
 * Given `agentHandle="add-widget"` this publishes `<base>-type` (the type `Select`, via its own
 * scheme) and `<base>-open` (the trigger button); the nested `WidgetPickerDialog`, once opened,
 * gets `<base>-picker` as ITS OWN base — see that component's "Agent handles" doc for what that
 * expands to. Omit `agentHandle` and none of it is tagged.
 */
export interface WidgetAddControlProps {
  triggerLabel: string;
  onResolved: (widgetInstanceId: string) => void | Promise<void>;
  /** Injectable seam for the two-step type-choice/create-or-reuse state. Defaults to the real
   *  {@link useWiredWidgetAddControl}; a test can pass a fake here to exercise this component's
   *  rendering without the real `api.createWidget` call. */
  useAddControl?: typeof useWiredWidgetAddControl;
  /** This control's own base handle — see this file's "Agent handles" doc above. Omit to leave it
   *  (and the dialog it opens) untagged. */
  agentHandle?: string;
}

export function WidgetAddControl({ useAddControl = useWiredWidgetAddControl, agentHandle: base, ...props }: WidgetAddControlProps) {
  const { pickerType, setPickerType, selectedType, setSelectedType, error, handleCreateNew, handleUseExisting, t, locale } =
    useAddControl(props);
  // `WIDGET_TYPE_OPTIONS`'s own labels are the English source strings; translate them through the
  // same `widgetTypeLabel` lookup `WidgetPickerDialog.hooks.tsx`'s `typeLabel` uses, so this type
  // picker and the dialog it opens agree on one widget type's display name per locale.
  const typeOptions: SelectOption[] = WIDGET_TYPE_OPTIONS.map((o) => ({ value: o.value, label: widgetTypeLabel(o.value, locale) }));

  return (
    <span className="widget-add-control">
      <Select
        value={selectedType}
        onChange={(v) => setSelectedType(v as AdminWidgetType)}
        options={typeOptions}
        aria-label={t("Widget type")}
        agentHandle={base ? `${base}-type` : undefined}
        t={t}
      />
      <button
        type="button"
        onClick={() => setPickerType(selectedType)}
        {...(base ? agentHandle(`${base}-open`, { role: "button", label: props.triggerLabel }) : {})}
      >
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
          agentHandle={base ? `${base}-picker` : undefined}
        />
      ) : null}
    </span>
  );
}

export { useWidgetAddControl };
