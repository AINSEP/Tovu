import { useState } from "react";
import { useWidgetAddControl } from "../WidgetPickerDialog/WidgetPickerDialog";

/**
 * @file `EmbedInsertControl`'s own state — the menu open/closed flag, the Media-picker-open flag,
 * the Widget…-mode flag, and the two pinned `useWidgetAddControl` instances (Form/Menu) — split out
 * of the component so it can be swapped for a fake via the `useEmbed` prop on
 * `EmbedInsertControlProps`, see that prop's doc comment in `EmbedInsertControl.tsx`. Same split
 * `ConfirmDialog`/`ConfirmDialog.hooks.tsx` uses in `@jini-ai/admin`, and the same one
 * `WidgetPickerDialog.tsx`/`WidgetPickerDialog.hooks.tsx` already applies in this app.
 */

export interface EmbedEditor {
  commands: {
    // 2026-09-11: the "Media" menu item now inserts the generic `media` node (`insertMediaEmbed`,
    // `lib/media-embed-extension.tsx`) instead of the legacy `image`-only ref node. That node's own
    // `insertMediaRef` command is gone — deleted as dead code in 2f53240d once this control stopped
    // calling it; `MediaImage` still RENDERS backward-compat ref content, it just has no insert
    // command of its own any more, and the "Insert image by URL" button uses the unrelated legacy
    // `src`-only `setImage`. See `media-embed-extension.tsx`'s header for why one dispatching node
    // replaces a per-kind one.
    insertMediaEmbed: (attrs: { assetId: string; transformName: string; alt?: string }) => boolean;
    insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string }) => boolean;
  };
}

/** Same placement-id minting `widget-embed-extension.tsx`'s own (private) helper uses — duplicated
 *  here rather than exported from that file, to avoid touching a file with its own existing test
 *  coverage for an unrelated reason. */
function newPlacementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `placement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Owns `EmbedInsertControl`'s menu/dialog visibility state and the two pinned "shortcut"
 * `useWidgetAddControl` instances the Form/Menu menu items drive directly via `setPickerType`
 * (never through `useWidgetAddControl`'s own `selectedType`/`<Select>` step — that path is only
 * exercised by the "Widget…" full flow, via the untouched `WidgetAddControl`).
 *
 * @param editor - The live TipTap editor, or `null` before it's ready. Read only through
 *   `insertWidget`'s optional chaining here — the component's own `if (!editor) return null`
 *   early-return still guards the JSX, same as before this split.
 */
export function useEmbedInsertControl(editor: EmbedEditor | null) {
  const [open, setOpen] = useState(false);
  const [widgetMode, setWidgetMode] = useState(false);
  const [mediaPicking, setMediaPicking] = useState(false);

  const insertWidget = (widgetEntryId: string) => {
    editor?.commands.insertWidgetEmbed({ placementId: newPlacementId(), widgetEntryId });
  };

  const formControl = useWidgetAddControl({ triggerLabel: "Form", onResolved: insertWidget });
  const menuControl = useWidgetAddControl({ triggerLabel: "Menu", onResolved: insertWidget });

  // `insertWidget` is returned too, not just consumed by the two pinned controls above — the
  // "Widget…" full-flow path in the component's JSX (via the untouched `WidgetAddControl`) calls it
  // directly from its own `onResolved`, exactly as the pre-split component did inline.
  return { open, setOpen, widgetMode, setWidgetMode, mediaPicking, setMediaPicking, formControl, menuControl, insertWidget };
}
