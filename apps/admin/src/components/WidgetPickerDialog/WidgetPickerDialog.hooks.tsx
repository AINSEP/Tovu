import { useEffect, useId, useRef, useState } from "react";
import { describeApiError, type AdminWidget, type AdminWidgetType } from "../../lib/api";
import { defaultWidgetConfig, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/WidgetConfigFields";
import { defaultWidgetPickerPort } from "./widget-picker-dependencies.hooks";
import type { WidgetPickerPort } from "./widget-picker-port.hooks";
import type { WidgetAddControlProps, WidgetPickerDialogProps } from "./WidgetPickerDialog";

/**
 * @file `WidgetPickerDialog`'s and `WidgetAddControl`'s state — the existing-instances fetch, the
 * dialog's own form/selection/Escape-listener/autofocus state, and the two-step type-choice flow —
 * split out of the component file so each can be swapped for a fake via the `useDialog`/
 * `useAddControl` props on their respective prop types (see those props' doc comments in
 * `WidgetPickerDialog.tsx`), per the `@jini-ai/admin` `<Name>.tsx`/`<Name>.hooks.tsx` extraction
 * pattern (`ConfirmDialog.tsx`/`ConfirmDialog.hooks.tsx` in that package).
 *
 * `WidgetPickerDialogProps`/`WidgetAddControlProps` are imported here as types only (no runtime
 * import) from `./WidgetPickerDialog` — the hooks need the full props shape, but the component file
 * is still the one importing this file's runtime exports, not the other way around, so there is no
 * runtime circular dependency between the two.
 *
 * `port` is injected (see `widget-picker-port.hooks.ts`) rather than reaching `lib/api`'s `api`
 * directly — same shape `MediaPickerDialog.hooks.tsx` uses. Unlike that file, the three functions
 * below take `port` as an OPTIONAL, defaulted parameter rather than splitting into a separate
 * `useWiredX()` pair: `useWidgetAddControl` has a real out-of-slice consumer —
 * `EmbedInsertControl.hooks.tsx` calls `useWidgetAddControl(props)` with one argument, twice, for
 * its pinned Form/Menu controls — and `WidgetPickerDialog.tsx`/`WidgetAddControl` both default
 * their own `useDialog`/`useAddControl` props straight to these same exported names. An optional,
 * defaulted second parameter keeps every existing call site (in-slice and out-of-slice alike)
 * compiling and behaving identically, while still giving tests a real seam:
 * `useWidgetAddControl(props, { port: createFakeWidgetPickerPort(...) })`. Per
 * `development/docs/architecture/wired-hooks-convention.md`'s "narrow to the actual pain point"
 * guidance — renaming to a strict `useWiredX` pair would ripple into a file this pass is explicitly
 * scoped to leave untouched (flagged, not edited, per this dispatch's own task note).
 */

/**
 * Fetches the widget type's existing instances for the "use existing" section, once per
 * `widgetType`.
 *
 * @param widgetType - The widget type to list instances for.
 * @param port - Injected {@link WidgetPickerPort} — see this file's own header for why it's an
 *   optional, defaulted parameter rather than a separate `useWiredX()` export.
 * @returns `instances` (`null` while the fetch is in flight, otherwise the loaded list) and
 *   `error` (a describable failure message, or `null`).
 * @example
 * const { instances, error } = useExistingInstances("text");
 */
export function useExistingInstances(widgetType: AdminWidgetType, port: WidgetPickerPort = defaultWidgetPickerPort) {
  const [instances, setInstances] = useState<AdminWidget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    port
      .listWidgets({ widgetType })
      .then((r) => setInstances(r.widgets))
      .catch((e) => setError(describeApiError(e, "failed to load existing widgets")));
    // `port` is added to the array below — a function-scoped value ESLint's exhaustive-deps rule
    // can see, referentially stable in production (the default parameter always resolves to the
    // same module-level singleton), so this changes nothing about when the effect re-runs. Same
    // note as `use-pages.hooks.ts`'s identical `port` addition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetType, port]);
  return { instances, error };
}

/**
 * Owns `WidgetPickerDialog`'s own state on top of `useExistingInstances`: the existing-instance
 * selection, the new-widget draft fields, the shared submit error, the Escape-to-cancel listener,
 * and the defer-until-resolved new-title autofocus.
 *
 * @param props - The dialog's own props (`widgetType`, `onUseExisting`, `onCreateNew`, `onCancel`)
 *   — the hook reads and forwards these exactly as the component previously did inline.
 * @returns Everything the dialog's JSX renders from: loaded instances/`loadError`, the "use
 *   existing" and "create new" form state plus their submit handlers, the three `useId()` values,
 *   the new-title input ref, the resolved type label, and `hasExisting`.
 * @param deps - Injected `{ port }` — see this file's own header for why it's optional/defaulted.
 * @example
 * const { instances, hasExisting, submitCreateNew } = useWidgetPickerDialog(props);
 */
export function useWidgetPickerDialog(
  props: WidgetPickerDialogProps,
  deps: { port: WidgetPickerPort } = { port: defaultWidgetPickerPort }
) {
  const { instances, error: loadError } = useExistingInstances(props.widgetType, deps.port);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: defers focus decision until `instances` resolves — see comment above; hasExisting intentionally excluded.
  useEffect(() => {
    if (instances === null) return;
    if (!hasExisting) newTitleInputRef.current?.focus();
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

  return {
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
  };
}

/**
 * Owns `WidgetAddControl`'s two-step flow: the pending type choice (`selectedType`), whether the
 * picker dialog is open (`pickerType`, `null` when closed), and the two resolution handlers that
 * create-or-reuse a widget and then call back into `props.onResolved`.
 *
 * @param props - `triggerLabel` (unused by the hook itself, kept for parity with the component's
 *   props) and `onResolved`, invoked once a widget instance id is settled.
 * @returns `pickerType`/`setPickerType`, `selectedType`/`setSelectedType`, the create/use-existing
 *   `error` message (or `null`), and the `handleCreateNew`/`handleUseExisting` submit handlers.
 * @param deps - Injected `{ port }` — see this file's own header for why it's optional/defaulted.
 *   `EmbedInsertControl.hooks.tsx`'s two pinned instances call this with one argument, so this
 *   parameter must stay optional — see this file's own header.
 * @example
 * const { pickerType, handleCreateNew } = useWidgetAddControl({ triggerLabel: "+ Add widget", onResolved });
 */
export function useWidgetAddControl(
  props: WidgetAddControlProps,
  deps: { port: WidgetPickerPort } = { port: defaultWidgetPickerPort }
) {
  const { port } = deps;
  const [pickerType, setPickerType] = useState<AdminWidgetType | null>(null);
  const [selectedType, setSelectedType] = useState<AdminWidgetType>("text");
  const [error, setError] = useState<string | null>(null);

  async function handleCreateNew(title: string, config: Record<string, unknown>) {
    if (!pickerType) return;
    try {
      const { widget } = await port.createWidget({ widgetType: pickerType, title, config });
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

  return { pickerType, setPickerType, selectedType, setSelectedType, error, handleCreateNew, handleUseExisting };
}
