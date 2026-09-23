import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { MediaPickerDialog } from "../components/MediaPickerDialog/MediaPickerDialog";
import { MediaEditDialog } from "../components/MediaEditDialog/MediaEditDialog";
import { insertBlockAtom } from "./block-atom-insert";
import { useWiredMediaEmbedNodeView, type MediaPreviewKind } from "./media-embed-extension.hooks";

/**
 * @file `Media` — the generic media doc node (2026-09-11, owner-directed: "don't add a `video` node
 * beside `image`, add ONE node and dispatch on the asset's real content type" — see
 * `server/inbound/public-http/http/site/render.ts`'s `renderDocMedia` for the server-side half of
 * this decision and its full reasoning, and `features/post/agent-tools.ts`'s `TIPTAP_DOC_SCHEMA` for
 * the schema published to the assistant).
 *
 * A NEW node type (unlike `media-image-extension.tsx`'s `MediaImage`, which deliberately stays named
 * `"image"` for backward compatibility with content authored before this task) — there is no
 * pre-existing content to keep rendering under a different name, so this is a plain `Node.create`,
 * the same shape `widget-embed-extension.tsx`'s `WidgetEmbed` already establishes for a block-level
 * atom node referencing something by id, rather than `TiptapImage.extend` (which only ever produces
 * an `<img>`-shaped preview and command surface — the wrong base for a node that may resolve to
 * video).
 *
 * Attrs are reference-only — `assetId`/`transformName`/`alt`, the SAME shape `insertMediaRef`
 * (`media-image-extension.tsx`) writes for `image` — never a `src`: `bodyJson` stores refs, never
 * URLs (ADR-027 §4), and unlike `image` this node has no legacy shape to carry forward, since it did
 * not exist before this task.
 *
 * **The NodeView's own content-type problem.** Once inserted, `assetId`/`transformName` are all this
 * node's attrs ever carry — no `contentType` hint is stored (storing one would be redundant,
 * author-invisible state that could only ever drift from the real asset: the SERVER already resolves
 * the real type at render time from the asset's actual bytes, which is the whole point of this being
 * one dispatching node rather than a per-kind node). So the in-editor preview asks the server the
 * same question at mount: `api.mediaContentType` sends a `HEAD` to the asset's `/original` route and
 * reads the `Content-Type` it sniffed from the stored bytes, and the preview shows `<video>` for
 * `video/*` and `<img>` for anything else — `renderDocMedia`'s own rule, so the editor and the
 * published post always agree. Nothing renders until that answer arrives.
 *
 * History (2026-09-22): this used to render `<video>` first and fall back to `<img>` on the video
 * element's `onError`. Chrome never fires that error for an image served to a `<video>` — the
 * element sits at `networkState` LOADING / `readyState` 0 indefinitely — so every image in a saved
 * post previewed as an empty black video player. Don't reintroduce a decode-probe here.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaEmbed: {
      /** Inserts a ref-based media node — ONLY `assetId`/`transformName`/`alt` are written to
       *  `bodyJson`; no `src`, no content-type hint. See this file's header. */
      insertMediaEmbed: (attrs: { assetId: string; transformName: string; alt?: string }) => ReturnType;
    };
  }
}

/**
 * The in-canvas rendered representation of a `media` node. An incomplete ref (`assetId` or
 * `transformName` unset) renders the same "broken reference" label shape {@link MediaImageNodeView}
 * (`media-image-extension.tsx`) uses for its own unresolved ref — no legacy branch exists here (see
 * this file's header: nothing pre-dates this node), so there is only the one broken/resolved split,
 * not `image`'s REF-vs-LEGACY three-way. State, attr reads, handlers and copy all come from
 * `useWiredMediaEmbedNodeView` (`media-embed-extension.hooks.ts`).
 */
export function MediaEmbedNodeView(props: NodeViewProps) {
  const view = useWiredMediaEmbedNodeView(props);

  return (
    <NodeViewWrapper as="div" className="media-embed-node" data-drag-handle contentEditable={false}>
      {view.previewSrc ? (
        renderPreview({
          previewSrc: view.previewSrc,
          alt: view.alt,
          assetId: view.assetId,
          previewKind: view.previewKind,
        })
      ) : (
        <span className="media-embed-node__broken-label" role="img" aria-label={view.t("Broken media reference")}>
          ⚠ {view.t("Media unavailable")}
        </span>
      )}
      {/* Edit FIRST, before Replace (owner-directed action order) — a MODAL, not a right-click
          context menu (ruled out: fights the native browser menu, undiscoverable, no touch
          support), following the SAME modal pattern Replace's own MediaPickerDialog already
          establishes rather than inventing a new one. */}
      <span className="media-embed-node__actions">
        <button type="button" onClick={view.openEdit}>
          {view.t("Edit")}
        </button>
        <button type="button" onClick={view.openPicker}>
          {view.t("Replace")}
        </button>
        <button type="button" onClick={view.remove}>
          {view.t("Remove")}
        </button>
      </span>
      {view.editing ? <MediaEditDialog initial={view.editInitial} onSave={view.saveEdit} onCancel={view.closeEdit} /> : null}
      {view.picking ? <MediaPickerDialog onSelect={view.replaceWith} onCancel={view.closePicker} /> : null}
    </NodeViewWrapper>
  );
}

/** The resolved-ref preview itself — `<video>` or `<img>` by the asset's real content type, nothing
 *  while that is still being looked up (see this file's header). Split to a top-level function so
 *  {@link MediaEmbedNodeView}'s own branch count stays at "resolved vs. broken" (one `if`), matching
 *  this codebase's complexity-ceiling precedent ({@link MediaImageNodeView},
 *  `widget-embed-extension.tsx`'s `WidgetEmbedStatus`). `key={assetId}` gives each asset a fresh
 *  element, so a Replace never reuses the previous asset's media element. */
function renderPreview(props: { previewSrc: string; alt: string; assetId: string; previewKind: MediaPreviewKind }) {
  if (props.previewKind === "pending") return null;
  if (props.previewKind === "image") {
    return <img key={props.assetId} className="media-embed-node__preview" src={props.previewSrc} alt={props.alt} />;
  }
  return (
    <video key={props.assetId} className="media-embed-node__preview" src={props.previewSrc} controls>
      {props.alt || "Your browser does not support the video tag."}
    </video>
  );
}

export const Media = Node.create({
  name: "media",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      transformName: { default: null },
      alt: { default: null },
      // Per-post style overrides (2026-09-11, owner-directed: "you may have one image being used
      // across multiple things, and you wanna control the CSS in a post … just in that post").
      // Same two field names and raw-text shape as `MediaRecord`'s asset-level `cssClass`/
      // `htmlAttributes` (`features/media/rules.ts`) — see this file's own `Edit` action
      // (`MediaEmbedNodeView`) for the editor UI, and `render.ts`'s `renderDocMedia`/
      // `mediaNodeStyleOverride` for the render-time precedence rule (node wins per field when set,
      // asset value otherwise). `htmlAttributes` gets NO client-side gate here — same "the hint is a
      // UX convenience, the server re-validates and fails closed" contract the asset-level field
      // documents (`use-edit-media-panel.hooks.ts`'s header, incident `a7cce060`).
      cssClass: { default: null },
      htmlAttributes: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-media-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-media-embed": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaEmbedNodeView);
  },

  addCommands() {
    return {
      // Through `insertBlockAtom`, not a bare `insertContent`: that left this node selected, so the
      // next Embed > Media replaced it. See `block-atom-insert.ts`.
      insertMediaEmbed:
        (attrs) =>
        ({ chain, state }) =>
          insertBlockAtom({
            chain,
            state,
            content: { type: this.name, attrs: { assetId: attrs.assetId, transformName: attrs.transformName, alt: attrs.alt ?? null } },
          }),
    };
  },
});
