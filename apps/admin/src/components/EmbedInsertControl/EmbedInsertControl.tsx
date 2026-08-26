import { agentHandle } from "@jini-ai/agentic";
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
  /** This control's own base handle — see this file's "Agent handles" doc for the full scheme.
   *  Omit to leave every element below (including the dialogs this control opens) untagged. */
  agentHandle?: string;
}

/** The inline popover behind the "Embed" trigger: the four-choice menu (Media/Form/Menu/Widget…),
 * or the "Widget…" full flow once picked. Split out of `EmbedInsertControl` because this menu's
 * own two-state switch (`open`, then `widgetMode` once inside it) was one of the two independent
 * "wide branch set" halves of the original function — this half owns menu navigation, the other
 * (`WidgetShortcutPicker` below) owns the Form/Menu shortcut dialogs.
 *
 * `agentHandle` here is `EmbedInsertControl`'s own base, unmodified — the four menu-item actions
 * are literal choices this menu makes (never caller data), so they're appended directly as
 * `<base>-media`/`-form`/`-menu`/`-widget`, and `WidgetAddControl` gets `<base>-widget-control` as
 * ITS OWN base once "Widget…" is picked. */
function EmbedMenu(props: {
  open: boolean;
  widgetMode: boolean;
  onPickMedia: () => void;
  onPickForm: () => void;
  onPickMenu: () => void;
  onEnterWidgetMode: () => void;
  onWidgetResolved: (widgetInstanceId: string) => void;
  agentHandle?: string;
}) {
  const { open, widgetMode, onPickMedia, onPickForm, onPickMenu, onEnterWidgetMode, onWidgetResolved, agentHandle: base } = props;
  if (!open) return null;

  return (
    <span className="embed-insert-menu" role="menu" aria-label="Insert">
      {!widgetMode ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="tb-btn"
            onClick={onPickMedia}
            {...(base ? agentHandle(`${base}-media`, { role: "button", label: "Insert an existing media asset" }) : {})}
          >
            Media
          </button>
          <button
            type="button"
            role="menuitem"
            className="tb-btn"
            onClick={onPickForm}
            {...(base ? agentHandle(`${base}-form`, { role: "button", label: "Insert a contact form" }) : {})}
          >
            Form
          </button>
          <button
            type="button"
            role="menuitem"
            className="tb-btn"
            onClick={onPickMenu}
            {...(base ? agentHandle(`${base}-menu`, { role: "button", label: "Insert a menu" }) : {})}
          >
            Menu
          </button>
          <button
            type="button"
            role="menuitem"
            className="tb-btn"
            onClick={onEnterWidgetMode}
            {...(base ? agentHandle(`${base}-widget`, { role: "button", label: "Insert any other widget type" }) : {})}
          >
            Widget…
          </button>
        </>
      ) : (
        <WidgetAddControl
          triggerLabel="Insert widget"
          onResolved={onWidgetResolved}
          agentHandle={base ? `${base}-widget-control` : undefined}
        />
      )}
    </span>
  );
}

/** The Form/Menu "shortcut" flow: the pinned-type `WidgetPickerDialog` plus its own error slot.
 * Identical shape for both `formControl` and `menuControl` (each a separate `useWidgetAddControl`
 * instance pinned to a `widgetType`, per `EmbedInsertControl.hooks.tsx`'s own header) — one
 * component used twice, rather than the same four-ternary pair written out inline twice.
 * `agentHandle` here is passed straight through as the opened `WidgetPickerDialog`'s own base. */
function WidgetShortcutPicker(props: {
  pickerType: AdminWidgetType | null;
  error: string | null;
  onUseExisting: (widgetInstanceId: string) => void;
  onCreateNew: (title: string, config: Record<string, unknown>) => void;
  onCancel: () => void;
  agentHandle?: string;
}) {
  const { pickerType, error, onUseExisting, onCreateNew, onCancel, agentHandle: base } = props;
  return (
    <>
      {pickerType ? (
        <WidgetPickerDialog
          widgetType={pickerType}
          onUseExisting={onUseExisting}
          onCreateNew={onCreateNew}
          onCancel={onCancel}
          agentHandle={base}
        />
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
 *
 * ## Agent handles
 *
 * Given `agentHandle="post-embed"` this publishes the trigger button directly under `<base>`
 * (single root action, no suffix — the "action omitted, element IS base" case), then forwards the
 * SAME base down to {@link EmbedMenu} for its four menu-item handles, `<base>-media-dialog` to the
 * media picker, and `<base>-form-dialog`/`<base>-menu-dialog` to the two
 * {@link WidgetShortcutPicker} instances as THEIR dialogs' own base. Omit `agentHandle` and none of
 * this control's own elements, or any dialog it opens, are tagged.
 */
export function EmbedInsertControl({ useEmbed = useEmbedInsertControl, agentHandle: base, ...props }: EmbedInsertControlProps) {
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
        {...(base ? agentHandle(base, { role: "button", label: "Insert media, a form, a menu, or a widget" }) : {})}
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
        agentHandle={base}
      />

      {mediaPicking ? (
        <MediaPickerDialog
          onSelect={(item) => {
            editor.commands.insertMediaRef({ assetId: item.id, transformName: "public", alt: item.alt || item.title });
            setMediaPicking(false);
          }}
          onCancel={() => setMediaPicking(false)}
          agentHandle={base ? `${base}-media-dialog` : undefined}
        />
      ) : null}

      <WidgetShortcutPicker
        pickerType={formControl.pickerType}
        error={formControl.error}
        onUseExisting={formControl.handleUseExisting}
        onCreateNew={formControl.handleCreateNew}
        onCancel={() => formControl.setPickerType(null)}
        agentHandle={base ? `${base}-form-dialog` : undefined}
      />
      <WidgetShortcutPicker
        pickerType={menuControl.pickerType}
        error={menuControl.error}
        onUseExisting={menuControl.handleUseExisting}
        onCreateNew={menuControl.handleCreateNew}
        onCancel={() => menuControl.setPickerType(null)}
        agentHandle={base ? `${base}-menu-dialog` : undefined}
      />
    </span>
  );
}
