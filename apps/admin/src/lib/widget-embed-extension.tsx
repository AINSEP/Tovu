import { useEffect, useState } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { api, ApiError, describeApiError, type AdminWidget } from "./api";
import { WidgetAddControl, WidgetPickerDialog } from "../components/WidgetPickerDialog/WidgetPickerDialog";
import { WIDGET_TYPE_OPTIONS } from "../components/WidgetConfigFields/WidgetConfigFields";

/**
 * @file The shared TipTap `widgetEmbed` node extension (SPEC-043 REQ-18, `ui.spec.md` §3.10/§4.9) —
 * ONE definition imported into both `PostEditor.tsx` and `CollectionEntryEditor.tsx` (per the
 * implementation-outline addendum's finding: those two files independently call `useEditor`, no
 * shared extension list exists — adding this node type twice, independently, would be a real
 * maintenance hazard REQ-19/20's guardrail UX affordances could drift on, even though the real
 * enforcement is server-side, C-008).
 *
 * Block-level atom node (REQ-18) carrying `{ placementId, widgetEntryId }` — resolved server-side
 * (REQ-21) before the theme ever sees it; this extension is authoring-surface only. Client-side
 * insertion is a plain ProseMirror transaction, persisted on the next ordinary Save — REQ-19/20's
 * real enforcement is server-side at the entries chokepoint (`validateWidgetEmbedMutation`, C-008),
 * not here (`ui.spec.md` §5).
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    widgetEmbed: {
      insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string }) => ReturnType;
    };
  }
}

function newPlacementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `placement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The type-option label for a resolved widget's `widgetType`, falling back to the raw type string
 *  when it isn't in `WIDGET_TYPE_OPTIONS` (a widget type retired or renamed since this embed was
 *  created). Pulled out to a top-level pure function per the extraction rule in the complexity-pass
 *  brief: it lowers `WidgetEmbedNodeView`'s own branch count and is independently testable without
 *  mounting the node view. Exported for that direct testability, same reasoning as
 *  `WidgetEmbedNodeView`'s own export comment below. */
export function widgetTypeLabel(widget: AdminWidget | null | undefined): string {
  if (!widget) return "";
  return WIDGET_TYPE_OPTIONS.find((o) => o.value === widget.widgetType)?.label ?? widget.widgetType;
}

/** The node's three mutually exclusive display states (loading / broken / resolved), split out of
 *  `WidgetEmbedNodeView` for the same reason as `widgetTypeLabel` above — a top-level component
 *  rather than a nested closure, so the branch it owns leaves the parent's scope entirely instead
 *  of only lowering its ESLint per-closure score. Exported for direct testability. */
export function WidgetEmbedStatus({ widget, isBroken, typeLabel }: { widget: AdminWidget | null | undefined; isBroken: boolean; typeLabel: string }) {
  if (widget === undefined) return <span className="notice">Loading widget…</span>;
  if (isBroken) {
    return (
      <span className="widget-embed-node__broken-label" role="img" aria-label="Broken widget reference">
        ⚠ Widget unavailable{widget ? ` (${widget.title})` : ""}
      </span>
    );
  }
  return (
    <span className="widget-embed-node__label">
      <strong>{widget!.title}</strong> <span className="muted-cell">({typeLabel})</span>
    </span>
  );
}

/**
 * The in-canvas rendered representation of an existing embed (`ui.spec.md` §3.10's `WidgetEmbedNode`
 * authoring-surface contract: `widgetInstanceId`, resolved `widgetTitle`/`widgetType`, `isBroken`,
 * `onRemove`, `onChangeInstance`).
 */
/** Exported (a plain React component once given `NodeViewProps`) so this file's own test suite can
 *  drive its loading/broken/success/change/remove states directly, the same reasoning
 *  `assistant-transport.ts`'s `translateRunAgentPayload` export documents for itself. */
export function WidgetEmbedNodeView(props: NodeViewProps) {
  const widgetEntryId = String(props.node.attrs.widgetEntryId ?? "");
  const placementId = String(props.node.attrs.placementId ?? "");
  const [widget, setWidget] = useState<AdminWidget | null | undefined>(undefined);
  const [isBroken, setIsBroken] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!widgetEntryId) {
      setIsBroken(true);
      setWidget(null);
      return;
    }
    api
      .getWidget(widgetEntryId)
      .then((r) => {
        setWidget(r.widget);
        setIsBroken(r.widget.status !== "active");
      })
      .catch(() => {
        setWidget(null);
        setIsBroken(true);
      });
  }, [widgetEntryId]);

  function remove() {
    props.deleteNode();
  }

  function changeInstance(newWidgetEntryId: string) {
    props.updateAttributes({ widgetEntryId: newWidgetEntryId });
    setChanging(false);
  }

  const nodeClassName = `widget-embed-node${isBroken ? " widget-embed-node--broken" : ""}`;

  return (
    <NodeViewWrapper as="div" className={nodeClassName} data-drag-handle contentEditable={false}>
      <WidgetEmbedStatus widget={widget} isBroken={isBroken} typeLabel={widgetTypeLabel(widget)} />
      <span className="widget-embed-node__actions">
        <button type="button" onClick={() => setChanging(true)}>
          Change
        </button>
        <button type="button" onClick={remove}>
          Remove
        </button>
      </span>
      {changing && widget ? (
        <WidgetPickerDialog
          widgetType={widget.widgetType}
          onUseExisting={(id) => changeInstance(id)}
          onCreateNew={async (title, config) => {
            try {
              const { widget: created } = await api.createWidget({ widgetType: widget.widgetType, title, config });
              changeInstance(created.id);
            } catch (e) {
              // eslint-disable-next-line no-alert
              window.alert(describeApiError(e, "failed to create widget"));
            }
          }}
          onCancel={() => setChanging(false)}
        />
      ) : null}
      <input type="hidden" value={placementId} readOnly />
    </NodeViewWrapper>
  );
}

export const WidgetEmbed = Node.create({
  name: "widgetEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      placementId: { default: null },
      widgetEntryId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-widget-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-widget-embed": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WidgetEmbedNodeView);
  },

  addCommands() {
    return {
      insertWidgetEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

interface WidgetEmbedEditor {
  commands: { insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string }) => boolean };
}

/** Mints a fresh `placementId` and inserts the node at the current cursor position
 * (`ui.spec.md` §4.9's `onInsertRequest`). */
function insertWidgetEmbedAtCursor(editor: WidgetEmbedEditor, widgetEntryId: string): void {
  editor.commands.insertWidgetEmbed({ placementId: newPlacementId(), widgetEntryId });
}

/**
 * The toolbar's "Insert widget" trigger — the type-choice-then-`WidgetPickerDialog` flow
 * (`WidgetAddControl`) wired to insert the resolved widget as a `widgetEmbed` node at the current
 * cursor position. Used by both `PostEditor.tsx`'s `Toolbar` and `CollectionEntryEditor.tsx`'s
 * (currently toolbar-less) editor shell.
 */
export function WidgetEmbedInsertControl(props: {
  editor: WidgetEmbedEditor | null;
  /** Pass-through to `WidgetAddControl`'s own optional `agentHandle` — see that component's doc for
   *  the sub-handles it derives. Omit to leave this control untagged (`PostEditor.tsx`'s call site
   *  does not pass one, unaffected by this being optional). */
  agentHandle?: string;
}) {
  if (!props.editor) return null;
  const editor = props.editor;
  return (
    <WidgetAddControl
      triggerLabel="Insert widget"
      onResolved={(widgetInstanceId) => insertWidgetEmbedAtCursor(editor, widgetInstanceId)}
      agentHandle={props.agentHandle}
    />
  );
}
