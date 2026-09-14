import { useState } from "react";
import type { NodeViewProps } from "@tiptap/react";

import { api } from "./api";
import { t as mediaT } from "../features/media/media-i18n";
import { useAdminLocale } from "../hooks/use-admin-locale.hooks";
import type { MediaEditDialogValue } from "../components/MediaEditDialog/MediaEditDialog.hooks";

/**
 * @file State, attr reads and handlers for `MediaEmbedNodeView` (`media-embed-extension.tsx`), so
 * the component itself stays markup only. Same `useX(input, deps)` / `useWiredX(input)` split
 * `components/MediaEditDialog/MediaEditDialog.hooks.tsx` uses: tests drive
 * {@link useMediaEmbedNodeView} with a fixed locale, the node view composes
 * {@link useWiredMediaEmbedNodeView}.
 */

/** A `media` node's attrs as the node view reads them. The ref fields and `alt` read as `""` when
 *  unset; `cssClass`/`htmlAttributes` read as `null`, the "inherit the asset's own value" state
 *  `MediaEditDialog` edits. */
export interface MediaEmbedAttrs {
  assetId: string;
  transformName: string;
  alt: string;
  cssClass: string | null;
  htmlAttributes: string | null;
}

function stringOr<T>(value: unknown, fallback: T): string | T {
  return typeof value === "string" ? value : fallback;
}

/**
 * Reads a `media` node's attrs defensively — `bodyJson` is stored JSON that an agent tool or an
 * import may have written, so a non-string value degrades to "unset" instead of reaching the DOM.
 *
 * @param attrs - `props.node.attrs` as ProseMirror hands it over.
 * @returns The five attrs, normalized — see {@link MediaEmbedAttrs}.
 * @complexity O(1).
 */
export function readMediaEmbedAttrs(attrs: Record<string, unknown>): MediaEmbedAttrs {
  return {
    assetId: stringOr(attrs.assetId, ""),
    transformName: stringOr(attrs.transformName, ""),
    alt: stringOr(attrs.alt, ""),
    cssClass: stringOr(attrs.cssClass, null),
    htmlAttributes: stringOr(attrs.htmlAttributes, null),
  };
}

/** Everything `MediaEmbedNodeView` renders from. */
export interface MediaEmbedNodeViewController {
  assetId: string;
  alt: string;
  /** `api.mediaOriginalUrl(assetId)` for a complete ref (`assetId` AND `transformName`), else `""` —
   *  the node view shows its broken-reference label for `""`. */
  previewSrc: string;
  /** Seeds `MediaEditDialog` from the node's current per-instance attrs. */
  editInitial: MediaEditDialogValue;
  /** `true` once the `<video>` probe failed to decode the asset — the preview falls back to `<img>`.
   *  See `media-embed-extension.tsx`'s header for why the kind is probed client-side. */
  videoFailed: boolean;
  onVideoError: () => void;
  /** Replace's `MediaPickerDialog` is open. Separate from {@link editing}: each button only flips
   *  its own flag, so the two dialogs can never be open together. */
  picking: boolean;
  openPicker: () => void;
  closePicker: () => void;
  /** Points the node at the picked asset, re-arms the video probe for it, and closes the picker. */
  replaceWith: (item: { id: string; alt: string; title: string }) => void;
  editing: boolean;
  openEdit: () => void;
  closeEdit: () => void;
  /** Writes the dialog's `alt`/`cssClass`/`htmlAttributes` onto the node and closes the dialog. */
  saveEdit: (value: MediaEditDialogValue) => void;
  remove: () => void;
  /** Translates the node view's copy (`media-i18n.ts`, keyed by the English string). */
  t: (key: string) => string;
}

/**
 * Owns `MediaEmbedNodeView`'s two dialog toggles, the video-probe flag, and the handlers that write
 * back into the node through `props.updateAttributes`/`props.deleteNode`.
 *
 * @param props - The TipTap node-view props for one `media` node.
 * @param deps - `deps.locale` drives the returned `t`.
 * @returns See {@link MediaEmbedNodeViewController}.
 * @complexity O(1) per render.
 */
export function useMediaEmbedNodeView(props: NodeViewProps, deps: { locale: string }): MediaEmbedNodeViewController {
  const { assetId, transformName, alt, cssClass, htmlAttributes } = readMediaEmbedAttrs(props.node.attrs);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const isRef = assetId.length > 0 && transformName.length > 0;

  return {
    assetId,
    alt,
    previewSrc: isRef ? api.mediaOriginalUrl(assetId) : "",
    editInitial: { alt, cssClass, htmlAttributes },
    videoFailed,
    onVideoError: () => setVideoFailed(true),
    picking,
    openPicker: () => setPicking(true),
    closePicker: () => setPicking(false),
    replaceWith: (item) => {
      props.updateAttributes({ assetId: item.id, transformName: "public", alt: item.alt || item.title });
      // A new asset must be probed afresh, not inherit the previous asset's image/video verdict.
      setVideoFailed(false);
      setPicking(false);
    },
    editing,
    openEdit: () => setEditing(true),
    closeEdit: () => setEditing(false),
    saveEdit: (value) => {
      props.updateAttributes({ alt: value.alt, cssClass: value.cssClass, htmlAttributes: value.htmlAttributes });
      setEditing(false);
    },
    remove: () => props.deleteNode(),
    t: (key) => mediaT(deps.locale, key),
  };
}

/** Binds the real `useAdminLocale()` — what `MediaEmbedNodeView` composes. */
export function useWiredMediaEmbedNodeView(props: NodeViewProps): MediaEmbedNodeViewController {
  const locale = useAdminLocale();
  return useMediaEmbedNodeView(props, { locale });
}
