import type { AdminWidgetType } from "../../lib/api";
import { MediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog";
import { WidgetAddControl, WidgetPickerDialog } from "../WidgetPickerDialog/WidgetPickerDialog";
import { useEmbedInsertControl, type EmbedEditor } from "./EmbedInsertControl.hooks";

/**
 * @file `EmbedInsertControl` — quick-and-dirty per the owner's explicit instruction (2026-08-05,
 * "skip formal spec/ADR process, just get it working"): one "Embed" trigger on `PostEditor.tsx`'s
 * `Toolbar`, replacing the previously-separate "Media" and "Insert widget" buttons.
 *
 * Key insight this control is built around: "Form" and "Menu" are not separate embedding
 * mechanisms — they are just the `contact-form` and `menu` widget TYPES
 * (`WidgetConfigFields.tsx`'s `WIDGET_TYPE_OPTIONS`). Before this control, reaching either one
 * meant opening "Insert widget" and then changing a type `<select>` — two clicks buried behind an
 * unrelated label. This control surfaces four top-level choices instead:
 *   - Media   — unchanged: `MediaPickerDialog` + `editor.commands.insertMediaRef`.
 *   - Form    — shortcut straight to `WidgetPickerDialog` pinned to `widgetType: "contact-form"`.
 *   - Menu    — same shortcut pattern, pinned to `widgetType: "menu"`.
 *   - Widget… — the original full flow (type `<select>` then the same dialog) for the other three
 *               types, via the existing `WidgetAddControl` unchanged — kept because narrowing its
 *               hardcoded `WIDGET_TYPE_OPTIONS` would mean forking it, which is more code and more
 *               risk than just keeping all five types reachable there too.
 *
 * Deliberately composes `MediaPickerDialog`, `WidgetPickerDialog`, `WidgetAddControl`, and the
 * `useWidgetAddControl` hook exactly as exported — none of their internals change. Those are
 * shared with `RegionPlacementList`, `CollectionEntryEditor.tsx`, and `WidgetRegionEditor.tsx` (see
 * `widget-embed-extension.tsx` and `WidgetPickerDialog.tsx`'s own file headers), so their existing
 * exported shape has to stay intact for those other call sites.
 *
 * No new design system: plain buttons, matches `PostEditor.tsx`'s `Toolbar` `.tb-btn` idiom.
 *
 * Moved here from `lib/` (was `lib/embed-insert-control.tsx`) per the owner's ruling on that
 * directory split: the file extension isn't the test, addressability is. A TipTap `Node` schema and
 * its node view stay in `lib/` because a node view is React only `ReactNodeViewRenderer` can mount,
 * 1:1 with its schema (see `media-image-extension.tsx`'s header) — this is an ordinary toolbar
 * component any screen can render, ordinary `components/` territory. State — the menu/dialog
 * visibility flags and the two pinned `useWidgetAddControl` instances — now lives in
 * `EmbedInsertControl.hooks.tsx`, split out the same way `ConfirmDialog`/`ConfirmDialog.hooks.tsx`
 * does in `@jini-ai/admin`; the `useEmbed` prop below lets a test render this JSX against a fake
 * without driving the real menu/dialog state machine or the real `useWidgetAddControl` fetches.
 */

export interface EmbedInsertControlProps {
  editor: EmbedEditor | null;
  /** Injectable seam for the menu/dialog visibility state and the two pinned Form/Menu
   *  `useWidgetAddControl` instances. Defaults to the real {@link useEmbedInsertControl}; a test
   *  can pass a fake here to exercise this component's rendering without the real state machine. */
  useEmbed?: typeof useEmbedInsertControl;
}

/** The inline popover behind the "Embed" trigger: the four-choice menu (Media/Form/Menu/Widget…),
 * or the "Widget…" full flow once picked. Split out of `EmbedInsertControl` because this menu's
 * own two-state switch (`open`, then `widgetMode` once inside it) was one of the two independent
 * "wide branch set" halves of the original function — this half owns menu navigation, the other
 * (`WidgetShortcutPicker` below) owns the Form/Menu shortcut dialogs. */
function EmbedMenu(props: {
  open: boolean;
  widgetMode: boolean;
  onPickMedia: () => void;
  onPickForm: () => void;
  onPickMenu: () => void;
  onEnterWidgetMode: () => void;
  onWidgetResolved: (widgetInstanceId: string) => void;
}) {
  const { open, widgetMode, onPickMedia, onPickForm, onPickMenu, onEnterWidgetMode, onWidgetResolved } = props;
  if (!open) return null;

  return (
    <span className="embed-insert-menu" role="menu" aria-label="Insert">
      {!widgetMode ? (
        <>
          <button type="button" role="menuitem" className="tb-btn" onClick={onPickMedia}>
            Media
          </button>
          <button type="button" role="menuitem" className="tb-btn" onClick={onPickForm}>
            Form
          </button>
          <button type="button" role="menuitem" className="tb-btn" onClick={onPickMenu}>
            Menu
          </button>
          <button type="button" role="menuitem" className="tb-btn" onClick={onEnterWidgetMode}>
            Widget…
          </button>
        </>
      ) : (
        <WidgetAddControl triggerLabel="Insert widget" onResolved={onWidgetResolved} />
      )}
    </span>
  );
}

/** The Form/Menu "shortcut" flow: the pinned-type `WidgetPickerDialog` plus its own error slot.
 * Identical shape for both `formControl` and `menuControl` (each a separate `useWidgetAddControl`
 * instance pinned to a `widgetType`, per `EmbedInsertControl.hooks.tsx`'s own header) — one
 * component used twice, rather than the same four-ternary pair written out inline twice. */
function WidgetShortcutPicker(props: {
  pickerType: AdminWidgetType | null;
  error: string | null;
  onUseExisting: (widgetInstanceId: string) => void;
  onCreateNew: (title: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const { pickerType, error, onUseExisting, onCreateNew, onCancel } = props;
  return (
    <>
      {pickerType ? (
        <WidgetPickerDialog widgetType={pickerType} onUseExisting={onUseExisting} onCreateNew={onCreateNew} onCancel={onCancel} />
      ) : null}
      {error ? (
        <span className="save-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * The toolbar's single "Embed" trigger — opens a small inline menu of four choices (Media, Form,
 * Menu, Widget…) in place of the old separate Media/Insert-widget buttons.
 */
export function EmbedInsertControl({ useEmbed = useEmbedInsertControl, ...props }: EmbedInsertControlProps) {
  const { open, setOpen, widgetMode, setWidgetMode, mediaPicking, setMediaPicking, formControl, menuControl, insertWidget } =
    useEmbed(props.editor);

  if (!props.editor) return null;
  const editor = props.editor;

  return (
    <span className="embed-insert-control">
      <button
        type="button"
        className="tb-btn"
        title="Insert media, a form, a menu, or a widget"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setWidgetMode(false);
        }}
      >
        Embed
      </button>
      <EmbedMenu
        open={open}
        widgetMode={widgetMode}
        onPickMedia={() => {
          setMediaPicking(true);
          setOpen(false);
        }}
        onPickForm={() => {
          formControl.setPickerType("contact-form");
          setOpen(false);
        }}
        onPickMenu={() => {
          menuControl.setPickerType("menu");
          setOpen(false);
        }}
        onEnterWidgetMode={() => setWidgetMode(true)}
        onWidgetResolved={(widgetInstanceId) => {
          insertWidget(widgetInstanceId);
          setOpen(false);
          setWidgetMode(false);
        }}
      />

      {mediaPicking ? (
        <MediaPickerDialog
          onSelect={(item) => {
            editor.commands.insertMediaRef({ assetId: item.id, transformName: "public", alt: item.alt || item.title });
            setMediaPicking(false);
          }}
          onCancel={() => setMediaPicking(false)}
        />
      ) : null}

      <WidgetShortcutPicker
        pickerType={formControl.pickerType}
        error={formControl.error}
        onUseExisting={formControl.handleUseExisting}
        onCreateNew={formControl.handleCreateNew}
        onCancel={() => formControl.setPickerType(null)}
      />
      <WidgetShortcutPicker
        pickerType={menuControl.pickerType}
        error={menuControl.error}
        onUseExisting={menuControl.handleUseExisting}
        onCreateNew={menuControl.handleCreateNew}
        onCancel={() => menuControl.setPickerType(null)}
      />
    </span>
  );
}
