import { useState } from "react";
import TiptapImage from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { api } from "./api";
import { MediaPickerDialog } from "../components/MediaPickerDialog";

/**
 * @file `MediaImage` — the TipTap `image` node extended with ADR-027 §4's ref-based
 * `{assetId, transformName}` attrs, PLUS a custom node view that resolves the in-editor preview
 * live from `assetId` rather than persisting a preview URL into `bodyJson`.
 *
 * Stays named `"image"` (`Image.extend`, not a new node type): `server/http/site/render.ts`'s
 * `renderDocNode` switches on `node.type === "image"` specifically — introducing a differently
 * named node here would silently fall through to that switch's `default` case (render children,
 * i.e. nothing, for a leaf node — the exact D7 bug this task's own render-path fix just closed)
 * unless render.ts also grew a matching case, which is unnecessary extra surface when extending
 * the existing node keeps both schema and switch trivially in sync.
 *
 * **Why the NodeView resolves `src` live instead of storing it.** ADR-027 §4 states plainly:
 * "`bodyJson` stores refs `{assetId, transformName}`, never URLs, so internal content never
 * freezes on the URL shape." A plain `setImage({ src, assetId, transformName })` call would
 * satisfy TipTap's schema but violate that "never URLs" property the moment the doc round-trips
 * through `getJSON()`/`setContent()` — the stored `src` would sit in `bodyJson` right next to the
 * ref, persisted forever, exactly the shape the ADR calls out by name. Instead, `assetId`/
 * `transformName` are the ONLY attrs `insertMediaRef` ever writes; `MediaImageNodeView` computes
 * `api.mediaOriginalUrl(assetId)` (the authenticated admin preview route — safe here because the
 * editor is itself an authenticated admin surface, unlike the public render path this ref
 * ultimately resolves against via a *different* URL, `/m/{assetId}/{transformName}.v{version}/…`,
 * built server-side at render time) purely for display, on every render, never written back into
 * `node.attrs`.
 *
 * The legacy `setImage({ src, alt })` command (`@tiptap/extension-image`'s own, unchanged) still
 * works for the toolbar's original "Insert image by URL" button — a node with `src` but no
 * `assetId`/`transformName` renders via this same NodeView's legacy branch, and `render.ts`'s own
 * `image` case (unchanged for this shape) still degrades it to the public-safe placeholder exactly
 * as before this task, per the explicit backward-compat requirement.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaImage: {
      /** Inserts a ref-based image node — ONLY `assetId`/`transformName`/`alt` are written to
       *  `bodyJson`; no `src` is ever stored (see this file's header). */
      insertMediaRef: (attrs: { assetId: string; transformName: string; alt?: string }) => ReturnType;
    };
  }
}

/**
 * The in-canvas rendered representation of an `image` node. Two branches, matching the two shapes
 * this node's schema now accepts:
 *  - REF (`assetId` set): live preview resolved from `api.mediaOriginalUrl(assetId)`, never
 *    persisted — see this file's header for why. A "Replace" action reopens
 *    {@link MediaPickerDialog} to swap the referenced asset.
 *  - LEGACY (`src` set, no `assetId`): renders `attrs.src` directly, unchanged from the plain
 *    `@tiptap/extension-image` behavior this replaces — only the in-editor admin surface ever
 *    reads this `src`; the public render path never does (D7/ADR-027 §4).
 */
export function MediaImageNodeView(props: NodeViewProps) {
  const assetId = typeof props.node.attrs.assetId === "string" ? props.node.attrs.assetId : "";
  const transformName = typeof props.node.attrs.transformName === "string" ? props.node.attrs.transformName : "";
  const legacySrc = typeof props.node.attrs.src === "string" ? props.node.attrs.src : "";
  const alt = typeof props.node.attrs.alt === "string" ? props.node.attrs.alt : "";
  const [picking, setPicking] = useState(false);

  const isRef = assetId.length > 0 && transformName.length > 0;
  const previewSrc = isRef ? api.mediaOriginalUrl(assetId) : legacySrc;

  function replaceWith(item: { id: string; alt: string; title: string }) {
    props.updateAttributes({ assetId: item.id, transformName: "public", alt: item.alt || item.title, src: null, title: null });
    setPicking(false);
  }

  return (
    <NodeViewWrapper as="div" className="media-image-node" data-drag-handle contentEditable={false}>
      {previewSrc ? (
        <img className="media-image-node__preview" src={previewSrc} alt={alt} />
      ) : (
        <span className="media-image-node__broken-label" role="img" aria-label="Broken image reference">
          ⚠ Image unavailable
        </span>
      )}
      <span className="media-image-node__actions">
        <button type="button" onClick={() => setPicking(true)}>
          Replace
        </button>
        <button type="button" onClick={() => props.deleteNode()}>
          Remove
        </button>
      </span>
      {picking ? <MediaPickerDialog onSelect={replaceWith} onCancel={() => setPicking(false)} /> : null}
    </NodeViewWrapper>
  );
}

export const MediaImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: { default: null },
      transformName: { default: null },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaImageNodeView);
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertMediaRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { assetId: attrs.assetId, transformName: attrs.transformName, alt: attrs.alt ?? null } }),
    };
  },
});

interface MediaImageEditor {
  commands: { insertMediaRef: (attrs: { assetId: string; transformName: string; alt?: string }) => boolean };
}

/**
 * The toolbar's "Insert from Media Library" trigger: opens {@link MediaPickerDialog} and inserts
 * the chosen asset as a ref-based image node at the current cursor position, on the `"public"`
 * transform name (`src/media/bootstrap.ts`'s `CORE_PUBLIC_TRANSFORM_NAME`, registered server-side
 * at boot — the one transform name that can ever resolve on the public `/m/` route today; that
 * server module isn't importable from this admin app's own build, so the name is a matching
 * literal here rather than a shared import, same as every other admin/server string-contract in
 * this codebase). Mirrors `WidgetEmbedInsertControl`'s exact "small control wrapping a picker
 * dialog" shape.
 */
export function MediaImageInsertControl(props: { editor: MediaImageEditor | null }) {
  const [open, setOpen] = useState(false);
  if (!props.editor) return null;
  const editor = props.editor;

  return (
    <>
      <button type="button" className="tb-btn" title="Insert from Media Library" onClick={() => setOpen(true)}>
        Media
      </button>
      {open ? (
        <MediaPickerDialog
          onSelect={(item) => {
            editor.commands.insertMediaRef({ assetId: item.id, transformName: "public", alt: item.alt || item.title });
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
