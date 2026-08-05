import { useState } from "react";
import { MediaPickerDialog } from "../components/MediaPickerDialog";
import { WidgetAddControl, WidgetPickerDialog, useWidgetAddControl } from "../components/WidgetPickerDialog";

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
 */

/** Same placement-id minting `widget-embed-extension.tsx`'s own (private) helper uses — duplicated
 *  here rather than exported from that file, to avoid touching a file with its own existing test
 *  coverage for an unrelated reason. */
function newPlacementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `placement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface EmbedEditor {
  commands: {
    insertMediaRef: (attrs: { assetId: string; transformName: string; alt?: string }) => boolean;
    insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string }) => boolean;
  };
}

/**
 * The toolbar's single "Embed" trigger — opens a small inline menu of four choices (Media, Form,
 * Menu, Widget…) in place of the old separate Media/Insert-widget buttons.
 */
export function EmbedInsertControl(props: { editor: EmbedEditor | null }) {
  const [open, setOpen] = useState(false);
  const [widgetMode, setWidgetMode] = useState(false);
  const [mediaPicking, setMediaPicking] = useState(false);

  const insertWidget = (widgetEntryId: string) => {
    props.editor?.commands.insertWidgetEmbed({ placementId: newPlacementId(), widgetEntryId });
  };

  // Two independent `useWidgetAddControl` instances — one per shortcut — each driven straight to
  // its pinned type via `setPickerType`, never through the hook's own `selectedType`/`<Select>`
  // (that path is only exercised by the "Widget…" full flow below, via the untouched
  // `WidgetAddControl`).
  const formControl = useWidgetAddControl({ triggerLabel: "Form", onResolved: insertWidget });
  const menuControl = useWidgetAddControl({ triggerLabel: "Menu", onResolved: insertWidget });

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
      {open ? (
        <span className="embed-insert-menu" role="menu" aria-label="Insert">
          {!widgetMode ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="tb-btn"
                onClick={() => {
                  setMediaPicking(true);
                  setOpen(false);
                }}
              >
                Media
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-btn"
                onClick={() => {
                  formControl.setPickerType("contact-form");
                  setOpen(false);
                }}
              >
                Form
              </button>
              <button
                type="button"
                role="menuitem"
                className="tb-btn"
                onClick={() => {
                  menuControl.setPickerType("menu");
                  setOpen(false);
                }}
              >
                Menu
              </button>
              <button type="button" role="menuitem" className="tb-btn" onClick={() => setWidgetMode(true)}>
                Widget…
              </button>
            </>
          ) : (
            <WidgetAddControl
              triggerLabel="Insert widget"
              onResolved={(widgetInstanceId) => {
                insertWidget(widgetInstanceId);
                setOpen(false);
                setWidgetMode(false);
              }}
            />
          )}
        </span>
      ) : null}

      {mediaPicking ? (
        <MediaPickerDialog
          onSelect={(item) => {
            editor.commands.insertMediaRef({ assetId: item.id, transformName: "public", alt: item.alt || item.title });
            setMediaPicking(false);
          }}
          onCancel={() => setMediaPicking(false)}
        />
      ) : null}

      {formControl.pickerType ? (
        <WidgetPickerDialog
          widgetType={formControl.pickerType}
          onUseExisting={formControl.handleUseExisting}
          onCreateNew={formControl.handleCreateNew}
          onCancel={() => formControl.setPickerType(null)}
        />
      ) : null}
      {formControl.error ? (
        <span className="save-error" role="alert">
          {formControl.error}
        </span>
      ) : null}

      {menuControl.pickerType ? (
        <WidgetPickerDialog
          widgetType={menuControl.pickerType}
          onUseExisting={menuControl.handleUseExisting}
          onCreateNew={menuControl.handleCreateNew}
          onCancel={() => menuControl.setPickerType(null)}
        />
      ) : null}
      {menuControl.error ? (
        <span className="save-error" role="alert">
          {menuControl.error}
        </span>
      ) : null}
    </span>
  );
}
