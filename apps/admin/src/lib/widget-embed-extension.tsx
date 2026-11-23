import { createWidgetEmbedTranslator } from "./widget-embed-extension.hooks";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import type { AdminWidget } from "@jini-ai/admin/screens/widgets/api/widgets-api.types";
import { insertBlockAtom } from "./block-atom-insert";
import { useWidgetEmbedNodeView } from "./widget-embed-extension.hooks";
import { MediaEditDialog } from "../components/MediaEditDialog/MediaEditDialog";
import { WidgetAddControl, WidgetPickerDialog } from "../components/WidgetPickerDialog/WidgetPickerDialog";
import { WIDGET_TYPE_OPTIONS } from "../components/WidgetConfigFields/WidgetConfigFields";
import { PlacementContentFields } from "../components/WidgetConfigFields/PlacementContentFields";
import { HtmlAttributeRows } from "../components/WidgetConfigFields/HtmlAttributeRows";
import { t as sharedComponentsT } from "../components/shared-components-i18n";
import { useWiredAdminLocale } from "../hooks/use-admin-locale.hooks";
import { uniqueId } from "./unique-id";

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
      insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string; content?: Record<string, unknown> }, optional?: Record<string, never>) => ReturnType;
    };
  }
}

function newPlacementId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `placement-${uniqueId()}`;
}

/** The type-option label for a resolved widget's `widgetType`, falling back to the raw type string
 *  when it isn't in `WIDGET_TYPE_OPTIONS` (a widget type retired or renamed since this embed was
 *  created). Pulled out to a top-level pure function per the extraction rule in the complexity-pass
 *  brief: it lowers `WidgetEmbedNodeView`'s own branch count and is independently testable without
 *  mounting the node view. Exported for that direct testability, same reasoning as
 *  `WidgetEmbedNodeView`'s own export comment below. */
export function widgetTypeLabel({ widget }: { widget: AdminWidget | null | undefined }, _options = {}): string {
  if (!widget) return "";
  return WIDGET_TYPE_OPTIONS.find((o) => o.value === widget.widgetType)?.label ?? widget.widgetType;
}

/** The node's three mutually exclusive display states (loading / broken / resolved), split out of
 *  `WidgetEmbedNodeView` for the same reason as `widgetTypeLabel` above — a top-level component
 *  rather than a nested closure, so the branch it owns leaves the parent's scope entirely instead
 *  of only lowering its ESLint per-closure score. Exported for direct testability. */
export function WidgetEmbedStatus({ widget, isBroken, typeLabel,
  useWiredAdminLocaleHook = useWiredAdminLocale }: { widget: AdminWidget | null | undefined; isBroken: boolean; typeLabel: string;
  useWiredAdminLocaleHook?: typeof useWiredAdminLocale; }) {
  const locale = useWiredAdminLocaleHook();
  const t = createWidgetEmbedTranslator({ locale });
  if (widget === undefined) return <span className="notice">{t({ key: "Loading widget…" })}</span>;
  if (isBroken) {
    return (
      <span className="widget-embed-node__broken-label" role="img" aria-label={t({ key: "Broken widget reference" })}>
        {t({ key: "⚠ Widget unavailable" })}{widget ? ` (${widget.title})` : ""}
      </span>
    );
  }
  if (!widget) throw new Error("widget embed is marked resolved but has no widget");
  return (
    <span className="widget-embed-node__label">
      <strong>{widget.title}</strong> <span className="muted-cell">({typeLabel})</span>
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
export function WidgetEmbedNodeView({
  useWidgetEmbedNodeViewHook = useWidgetEmbedNodeView,
  useWiredAdminLocaleHook = useWiredAdminLocale, ...props }: (NodeViewProps) & {
  useWidgetEmbedNodeViewHook?: typeof useWidgetEmbedNodeView;
  useWiredAdminLocaleHook?: typeof useWiredAdminLocale; }) {
  // State, the (stale-guarded) widget fetch and every handler live in the hook — see
  // `widget-embed-extension.hooks.ts`.
  const view = useWidgetEmbedNodeViewHook(props);
  const locale = useWiredAdminLocaleHook();
  const t = createWidgetEmbedTranslator({ locale });
  const placementContent = view.placementContent;
  const changeDialog = view.changeDialog;

  return (
    <NodeViewWrapper as="div" className={view.nodeClassName} data-drag-handle contentEditable={false}>
      <WidgetEmbedStatus widget={view.widget} isBroken={view.isBroken} typeLabel={widgetTypeLabel({ widget: view.widget })} />
      <span className="widget-embed-node__actions">
        <button type="button" onClick={view.openStyle}>
          {t({ key: "Style" })}
        </button>
        <button type="button" onClick={view.openChange}>
          {t({ key: "Change" })}
        </button>
        <button type="button" onClick={view.remove}>
          {t({ key: "Remove" })}
        </button>
      </span>
      {view.styling ? (
        <MediaEditDialog initial={view.styleInitial} onSave={view.saveStyle} onCancel={view.closeStyle} showAlt={false}
          renderHtmlAttributes={(field) => <HtmlAttributeRows {...field} t={(key) => sharedComponentsT({ locale, key })} />}>
          {placementContent ? (
            <PlacementContentFields {...placementContent}
              setCustom={(custom) => placementContent.setCustom({ custom })}
              setContent={(content) => placementContent.setContent({ content })}
              t={(key) => sharedComponentsT({ locale, key })} />
          ) : null}
        </MediaEditDialog>
      ) : null}
      {changeDialog ? (
        <WidgetPickerDialog
          widgetType={changeDialog.widgetType}
          onUseExisting={(id) => changeDialog.onUseExisting({ id })}
          onCreateNew={(title, config) => changeDialog.onCreateNew({ title, config })}
          onCancel={changeDialog.onCancel}
        />
      ) : null}
      <input type="hidden" value={view.placementId} readOnly />
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
      // Per-placement JSON persists in the document; server resolution merges it over saved config.
      content: { default: null, rendered: false },
      // Per-instance style override (2026-09-23, W2 — owner ask: "widget embed attributes pass
      // through like the other types"), same two field names/shape as the `media` node's own
      // `cssClass`/`htmlAttributes` (`media-embed-extension.tsx`). The editor UI (the Style action,
      // `WidgetEmbedNodeView`) mirrors the media node's Edit dialog exactly — no extra client-side
      // filtering or warning on attribute names. What the render-time allowlist actually keeps is a
      // server-side decision (`render.ts`), out of this admin-only slice's scope, and is expected to
      // change (2026-09-23 owner correction: `data-*`/`aria-*`-only was too narrow — `class`/`id`/
      // `style`/animation attributes are meant to stay, same as media; only `on*`/`javascript:` stay
      // blocked).
      cssClass: { default: null },
      htmlAttributes: { default: null },
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
      // Through `insertBlockAtom`, not a bare `insertContent`: that left this node selected, so the
      // next widget insert replaced it. See `block-atom-insert.ts`.
      insertWidgetEmbed:
        (attrs, _options = {}) =>
        ({ chain, state }) =>
          insertBlockAtom({ chain, state, content: { type: this.name, attrs } }),
    };
  },
});

interface WidgetEmbedEditor {
  commands: { insertWidgetEmbed: (attrs: { placementId: string; widgetEntryId: string; content?: Record<string, unknown> }, optional?: Record<string, never>) => boolean };
}

/** Mints a fresh `placementId` and inserts the node at the current cursor position
 * (`ui.spec.md` §4.9's `onInsertRequest`). */
function insertWidgetEmbedAtCursor({ editor, widgetEntryId }: { editor: WidgetEmbedEditor; widgetEntryId: string }, _options = {}): void {
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
  return <WidgetEmbedInsertControlEnabled editor={props.editor} agentHandle={props.agentHandle} />;
}

function WidgetEmbedInsertControlEnabled({
  useWiredAdminLocaleHook = useWiredAdminLocale, ...props }: {
  editor: WidgetEmbedEditor;
  agentHandle?: string;
  useWiredAdminLocaleHook?: typeof useWiredAdminLocale;
}) {
  const editor = props.editor;
  const locale = useWiredAdminLocaleHook();
  const t = createWidgetEmbedTranslator({ locale });
  return (
    <WidgetAddControl
      triggerLabel={t({ key: "Insert widget" })}
      onResolved={(widgetInstanceId) => insertWidgetEmbedAtCursor({ editor, widgetEntryId: widgetInstanceId })}
      agentHandle={props.agentHandle}
    />
  );
}
