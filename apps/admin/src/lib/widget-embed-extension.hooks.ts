import { useEffect, useState, type ComponentProps } from "react";
import type { NodeViewProps } from "@tiptap/react";

import { api, describeApiError, type AdminWidget } from "./api";
import type { MediaEditDialogValue } from "../components/MediaEditDialog/MediaEditDialog.hooks";
import type { WidgetPickerDialog } from "../components/WidgetPickerDialog/WidgetPickerDialog";
import { initialPlacementDraft, placementContentAttr, supportsPlacementContent, type PlacementContentDraft } from "./widget-embed-placement-content";

/**
 * @file State, the widget fetch and handlers for `WidgetEmbedNodeView` (`widget-embed-extension.tsx`),
 * so the node view itself stays markup only — same split `media-embed-extension.hooks.ts` makes for
 * `MediaEmbedNodeView`.
 *
 * **Stale responses are dropped.** A node's `widgetEntryId` changes in place (Change ->
 * `updateAttributes`), and `api.getWidget` takes no abort signal, so a slow response for the
 * PREVIOUS id can settle after the current one. The fetch effect marks its own run stale in its
 * cleanup and ignores a settle (success or failure) from a stale run; before this, whichever
 * response settled last won, and a node could show — or be marked broken by — a widget it no longer
 * pointed at. The request itself still completes; only its result is discarded.
 */

type WidgetPickerDialogProps = ComponentProps<typeof WidgetPickerDialog>;

/** The Change dialog's props, present only while it is open AND a widget has resolved to scope it
 *  to (the dialog is typed to the current widget's own `widgetType`). */
export interface WidgetEmbedChangeDialog {
  widgetType: WidgetPickerDialogProps["widgetType"];
  /** Points the node at an existing widget and closes the dialog. */
  onUseExisting: WidgetPickerDialogProps["onUseExisting"];
  /** Creates a widget of the current type, then points the node at it. A failed create alerts the
   *  describable error and leaves the node (and the open dialog) untouched. */
  onCreateNew: WidgetPickerDialogProps["onCreateNew"];
  onCancel: WidgetPickerDialogProps["onCancel"];
}

/** The Style dialog's "Content for this spot" draft — only for media/gallery widgets. */
export interface WidgetEmbedPlacementContent extends PlacementContentDraft {
  widgetType: string;
  setCustom: (custom: boolean) => void;
  setContent: (content: Record<string, unknown>) => void;
}

/** Everything `WidgetEmbedNodeView` renders from. */
export interface WidgetEmbedNodeViewController {
  /** The node's `placementId`, `""` when unset (never the literal `"undefined"`). */
  placementId: string;
  /** `undefined` while loading, `null` when unresolvable (no id, or the fetch failed). */
  widget: AdminWidget | null | undefined;
  /** No id, a failed fetch, or a resolved widget that is not `active`. */
  isBroken: boolean;
  /** The node wrapper's class, with the `--broken` modifier when {@link isBroken}. */
  nodeClassName: string;
  /** The Change button: opens the dialog (which renders only once a widget has resolved). */
  openChange: () => void;
  /** The Remove button: deletes this node from the document. */
  remove: () => void;
  /** Non-`null` exactly when the Change dialog should render — see {@link WidgetEmbedChangeDialog}. */
  changeDialog: WidgetEmbedChangeDialog | null;
  /** The node's current `cssClass`/`htmlAttributes`, seeding the Style dialog (D5) — `alt` is
   *  always `null` since {@link MediaEditDialog} renders with `showAlt={false}` here and never
   *  reads it back. */
  styleInitial: MediaEditDialogValue;
  /** Whether the Style dialog should render — unlike {@link changeDialog}, not gated on the widget
   *  having resolved: styling only touches node attrs, not the referenced widget. */
  styling: boolean;
  /** Opens the Style dialog. */
  openStyle: () => void;
  /** Closes the Style dialog without writing anything. */
  closeStyle: () => void;
  /** Writes the dialog's `cssClass`/`htmlAttributes` onto the node (never `alt`, which this dialog
   *  never exposes) and closes it — same shape as `media-embed-extension.hooks.ts`'s `saveEdit`.
   *  For a media/gallery widget it also writes `content` (the override, or `null` for "Use the
   *  widget's content"); for any other type `content` is left exactly as it was. */
  saveStyle: (value: MediaEditDialogValue) => void;
  /** Non-`null` while the Style dialog is open for a media/gallery widget — the per-placement
   *  content override (mediawidget contract) the dialog renders below the style fields. */
  placementContent: WidgetEmbedPlacementContent | null;
}

/**
 * Owns `WidgetEmbedNodeView`'s resolved widget, broken flag and Change-dialog state, and the handlers
 * that write back into the node through `props.updateAttributes`/`props.deleteNode`.
 *
 * @param props - The TipTap node-view props for one `widgetEmbed` node.
 * @returns See {@link WidgetEmbedNodeViewController}.
 * @complexity O(1) per render; one `api.getWidget` call per `widgetEntryId` change.
 */
export function useWidgetEmbedNodeView(props: NodeViewProps): WidgetEmbedNodeViewController {
  const { widgetEntryId, placementId, cssClass, htmlAttributes } = widgetEmbedAttrs(props.node.attrs);
  const { widget, isBroken } = useResolvedWidget(widgetEntryId);
  const [changing, setChanging] = useState(false);
  const [styling, setStyling] = useState(false);
  const [placementDraft, setPlacementDraft] = useState<PlacementContentDraft>({ custom: false, content: {} });

  function changeInstance(newWidgetEntryId: string) {
    props.updateAttributes({ widgetEntryId: newWidgetEntryId });
    setChanging(false);
  }

  const contentEditable = supportsPlacementContent(widget?.widgetType);

  return {
    placementId,
    widget,
    isBroken,
    nodeClassName: `widget-embed-node${isBroken ? " widget-embed-node--broken" : ""}`,
    openChange: () => setChanging(true),
    remove: () => props.deleteNode(),
    styleInitial: { alt: null, cssClass, htmlAttributes },
    styling,
    openStyle: () => {
      // Re-seeded on every open so Cancel discards an edited override, like the style fields.
      setPlacementDraft(initialPlacementDraft({ attrsContent: props.node.attrs.content, widgetConfig: widget?.config }));
      setStyling(true);
    },
    closeStyle: () => setStyling(false),
    saveStyle: (value) => {
      props.updateAttributes({
        cssClass: value.cssClass,
        htmlAttributes: value.htmlAttributes,
        ...(contentEditable ? { content: placementContentAttr({ draft: placementDraft }) } : {}),
      });
      setStyling(false);
    },
    placementContent: styling && contentEditable && widget
      ? placementContentController({ widgetType: widget.widgetType, draft: placementDraft, setDraft: setPlacementDraft })
      : null,
    changeDialog: changing && widget
      ? changeDialogController({ widgetType: widget.widgetType, changeInstance, close: () => setChanging(false) })
      : null,
  };
}

/**
 * Reads one `widgetEmbed` node's attributes, normalising absent ones.
 * @param attrs The node's raw TipTap attributes.
 * @returns Ids as strings (`""` when unset, never `"undefined"`); style attrs as string or `null`.
 */
function widgetEmbedAttrs(attrs: NodeViewProps["node"]["attrs"]) {
  return {
    widgetEntryId: String(attrs.widgetEntryId ?? ""),
    placementId: String(attrs.placementId ?? ""),
    cssClass: (attrs.cssClass as string | null | undefined) ?? null,
    htmlAttributes: (attrs.htmlAttributes as string | null | undefined) ?? null,
  };
}

/**
 * Resolves the widget a node points at, dropping stale settles (see this file's header).
 * @param widgetEntryId The node's widget id; `""` marks the node broken without fetching.
 * @returns `widget` (`undefined` while loading, `null` when unresolvable) and the broken flag.
 * @complexity One `api.getWidget` call per `widgetEntryId` change.
 */
function useResolvedWidget(widgetEntryId: string): { widget: AdminWidget | null | undefined; isBroken: boolean } {
  const [widget, setWidget] = useState<AdminWidget | null | undefined>(undefined);
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    if (!widgetEntryId) {
      setIsBroken(true);
      setWidget(null);
      return;
    }
    // Cleared by this run's own cleanup, i.e. as soon as `widgetEntryId` changes or the node view
    // unmounts — see this file's header on why a stale settle must not apply.
    let current = true;
    api
      .getWidget(widgetEntryId)
      .then((r) => {
        if (!current) return;
        setWidget(r.widget);
        setIsBroken(r.widget.status !== "active");
      })
      .catch(() => {
        if (!current) return;
        setWidget(null);
        setIsBroken(true);
      });
    return () => {
      current = false;
    };
  }, [widgetEntryId]);

  return { widget, isBroken };
}

/** The Style dialog's per-placement content override for a media/gallery widget. */
function placementContentController(
  { widgetType, draft, setDraft }: {
    widgetType: string;
    draft: PlacementContentDraft;
    setDraft: (update: (draft: PlacementContentDraft) => PlacementContentDraft) => void;
  },
): WidgetEmbedPlacementContent {
  return {
    ...draft,
    widgetType,
    setCustom: (custom) => setDraft((current) => ({ ...current, custom })),
    setContent: (content) => setDraft((current) => ({ ...current, content })),
  };
}

/** The Change dialog's handlers, scoped to the current widget's own `widgetType`. */
function changeDialogController(
  { widgetType, changeInstance, close }: {
    widgetType: AdminWidget["widgetType"];
    changeInstance: (widgetEntryId: string) => void;
    close: () => void;
  },
): WidgetEmbedChangeDialog {
  return {
    widgetType,
    onUseExisting: (id) => changeInstance(id),
    onCreateNew: async (title, config) => {
      try {
        const { widget: created } = await api.createWidget({ widgetType, title, config });
        changeInstance(created.id);
      } catch (e) {
        // eslint-disable-next-line no-alert
        window.alert(describeApiError(e, "failed to create widget"));
      }
    },
    onCancel: close,
  };
}
