import { type AdminContentType } from "@jini-ai/admin/screens/collections/api/collections-api.types";
import { DataTable, RowMenu } from "@jini-ai/admin/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle, buildAgentListHandles } from "@jini-ai/core/agent-handles";
import { contentTypeMenuItems, type LifecycleConfirmOp } from "./rules";
import { useWiredCollections } from "./hooks/use-collections.hooks";
import { ServerLabel } from "@/components/status-labels";
import { useWiredNewContentTypeDialog } from "./hooks/use-new-content-type-dialog.hooks";
import { useWiredEditFieldsDialog } from "./hooks/use-edit-fields-dialog.hooks";
import { useLifecycleConfirmDialog } from "./hooks/use-lifecycle-confirm-dialog.hooks";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import { NewContentTypeDialog } from "./NewContentTypeDialog";
import { LifecycleConfirmDialog } from "./LifecycleConfirmDialog";
import { EditFieldsDialog } from "./EditFieldsDialog";

/**
 * @file Collections screen (design-spec.md §1, ADR-022/ADR-043) — the `/admin/collections`
 * landing view: the content-type registry list plus the "New content type" modal.
 *
 * Structural reference: `FormsList.tsx` (list/fetch/loading/error/empty shape) crossed with
 * `the former raw settings screen`'s `.settings-dialog` modal idiom, per design-spec.md §0.3/§1.3. The entry list
 * (`/admin/collections/{typeKey}`) and entry editor (`/admin/collections/{typeKey}/{entryId|new}`) are
 * separate routed screens — see `CollectionEntries.tsx`/`CollectionEntryEditor.tsx`.
 *
 * Reserved key + grammar validation (§1.3) is duplicated client-side as a fast-reject only; the
 * server's `VALIDATION_ERROR` (`InvalidKeyGrammarError`/`ReservedContentTypeKeyError`) is the
 * authoritative check, same disclosed pattern `the former raw settings screen`'s header comment documents for its
 * own client-side checks.
 *
 * SPEC-037 REQ-05: `EditFieldsDialog` wires the previously-unused `api.updateContentTypeFields` —
 * post-creation field-schema editing, full-replace semantics (the whole `fields` array is sent),
 * optimistic-concurrency via `expectedVersion`. A `409` (stale version — another edit landed since
 * this dialog loaded) surfaces a dedicated "refresh and try again" message rather than silently
 * applying the stale write or falling through to the generic error banner.
 *
 * ## Markup only
 *
 * Every dialog's state lives in its own `hooks/use-<thing>.hooks.ts`; Jini now owns native
 * cancellation and focus. The former feature-local Escape helper consolidated identical
 * effects to avoid dropped/double Escape delivery when callbacks rebound on each render;
 * native cancellation removes the need for that subscription and its cleanup entirely.
 * Validation, draft-field-list transforms, error-message
 * formatting, and the row-menu builder all moved to `rules.ts`.
 */

// ---------------------------------------------------------------------------
// Collections — content-type list
// ---------------------------------------------------------------------------

export interface CollectionsProps {
  /** Domain controllers stay injectable while Jini owns every dialog's native lifecycle. */
  dialogHooks?: {
    useNewContentTypeDialogHook?: typeof useWiredNewContentTypeDialog;
    useEditFieldsDialogHook?: typeof useWiredEditFieldsDialog;
    useLifecycleConfirmDialogHook?: typeof useLifecycleConfirmDialog;
  };
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before. See `PostsProps.usePostsHook` for the full rationale.
   */
  useCollectionsHook?: typeof useWiredCollections;
}

/** The three modals `Collections` can have open at once (mutually exclusive in practice, but not
 * enforced as a union since the controller tracks them as three independent pieces of state).
 * Split out because each one is its own conditional-render branch on the parent — bundling all
 * three into one component keeps `Collections` itself down to the table + header. */
function CollectionsDialogs(props: {
  dialogHooks?: CollectionsProps["dialogHooks"];
  showNewDialog: boolean;
  onNewDialogCreated: () => void;
  onNewDialogCancel: () => void;
  pendingLifecycle: { op: LifecycleConfirmOp; contentType: AdminContentType } | null;
  onLifecycleConfirm: (op: LifecycleConfirmOp, contentType: AdminContentType) => void;
  onLifecycleCancel: () => void;
  editingFieldsFor: AdminContentType | null;
  onFieldsSaved: () => void;
  onFieldsCancel: () => void;
  t: (required: { key: string }, optional?: Record<string, never>) => string;
}) {
  const {
    showNewDialog,
    onNewDialogCreated,
    onNewDialogCancel,
    pendingLifecycle,
    onLifecycleConfirm,
    onLifecycleCancel,
    editingFieldsFor,
    onFieldsSaved,
    onFieldsCancel,
    t,
  } = props;

  return (
    <>
      {showNewDialog ? <NewContentTypeDialog onCreated={onNewDialogCreated} onCancel={onNewDialogCancel} t={t}
        useNewContentTypeDialogHook={props.dialogHooks?.useNewContentTypeDialogHook} /> : null}
      {pendingLifecycle ? (
        <LifecycleConfirmDialog
          op={pendingLifecycle.op}
          contentType={pendingLifecycle.contentType}
          onConfirm={() => onLifecycleConfirm(pendingLifecycle.op, pendingLifecycle.contentType)}
          onCancel={onLifecycleCancel}
          useLifecycleConfirmDialogHook={props.dialogHooks?.useLifecycleConfirmDialogHook}
          t={t}
        />
      ) : null}
      {editingFieldsFor ? (
        <EditFieldsDialog contentType={editingFieldsFor} onSaved={onFieldsSaved} onCancel={onFieldsCancel} t={t}
          useEditFieldsDialogHook={props.dialogHooks?.useEditFieldsDialogHook} />
      ) : null}
    </>
  );
}

export function Collections({ useCollectionsHook = useWiredCollections, dialogHooks }: CollectionsProps = {}) {
  const {
    types, error, showNewDialog, setShowNewDialog, pendingLifecycle, setPendingLifecycle, editingFieldsFor, setEditingFieldsFor, actionError, load, runLifecycle,
    copiedKey, copyFallback, copyEmbedCode, t, locale,
  } = useCollectionsHook();

  if (error && !types) return <div className="notice error">{error}</div>;
  if (!types) return <div className="notice">{t({ key: "Loading content types…" })}</div>;

  // Content type keys are stable and unique (the server's own primary key for this resource), so
  // they disambiguate one row's entries link from another's — same reasoning as every other list
  // on this workstream. Each row's "Actions" menu (Edit fields/Deprecate/Reactivate/Tombstone via
  // `RowMenu`) shares this same per-row base (`${rowHandles[index]}-menu`) now that `RowMenu`
  // (`@jini-ai/admin/react`) accepts an `agentHandle` prop — before this session it published none,
  // so its trigger and dropdown items were invisible to `page.find_elements` regardless of what this
  // file did (see `FormsList.tsx`'s identical fix).
  const rowHandles = buildAgentListHandles({ prefix: "collections-row", ids: types.map((ct) => ct.key) }
  );

  return (
    <div className="page">
      {renderCollectionsHeader({ t, setShowNewDialog })}

      {error ? <div className="notice error">{error}</div> : null}
      {actionError ? <div className="notice error">{actionError}</div> : null}

      {renderCollectionsTable({ types, t, rowHandles, copyEmbedCode, copiedKey, copyFallback, setEditingFieldsFor, setPendingLifecycle, runLifecycle, locale })}

      <CollectionsDialogs
        dialogHooks={dialogHooks}
        showNewDialog={showNewDialog}
        onNewDialogCreated={() => {
          setShowNewDialog(false);
          load();
        }}
        onNewDialogCancel={() => setShowNewDialog(false)}
        pendingLifecycle={pendingLifecycle}
        onLifecycleConfirm={(op, contentType) => {
          void runLifecycle(contentType, op);
          setPendingLifecycle(null);
        }}
        onLifecycleCancel={() => setPendingLifecycle(null)}
        editingFieldsFor={editingFieldsFor}
        onFieldsSaved={() => {
          setEditingFieldsFor(null);
          load();
        }}
        onFieldsCancel={() => setEditingFieldsFor(null)}
        t={t}
      />
    </div>
  );
}

function renderCollectionsTable(
  { types, t, rowHandles, copyEmbedCode, copiedKey, copyFallback, setEditingFieldsFor, setPendingLifecycle, runLifecycle, locale }:
    Pick<ReturnType<NonNullable<CollectionsProps["useCollectionsHook"]>>, "t" | "copyEmbedCode" | "copiedKey" | "copyFallback" | "setEditingFieldsFor"
    | "setPendingLifecycle" | "runLifecycle" | "locale"> &
    { types: NonNullable<ReturnType<NonNullable<CollectionsProps["useCollectionsHook"]>>["types"]>; rowHandles: ReturnType<typeof buildAgentListHandles> }
) {
  return (
    <DataTable
      rows={types}
      rowKey={(ct) => ct.key}
      empty={renderCollectionsEmpty({ t })}
      columns={[
        // The label opens the entries too (mobile catalog CO-1, 2026-10-06): "Manage entries" sits
        // in the seventh column, off-screen in a phone's sideways scroller, so the row's own name
        // is the obvious way in.
        { key: "label", header: t({ key: "Label" }), cell: (ct) => <a href={`/admin/collections/${ct.key}`}>{ct.label}</a> },
        { key: "key", header: t({ key: "Key" }), cell: (ct) => <code>{ct.key}</code> },
        { key: "fields", header: t({ key: "Fields" }), cell: (ct) => ct.fields.length },
        {
          key: "queryable-fields",
          header: t({ key: "Queryable fields" }),
          cell: (ct) => ct.fields.filter((f) => f.queryable).length,
        },
        {
          key: "status",
          header: t({ key: "Status" }),
          cell: (ct) => <span className={`status status-${ct.status}`}><ServerLabel value={ct.status} /></span>,
        },
        {
          key: "entries",
          header: t({ key: "Entries" }),
          cell: (ct, index) => renderCollectionEntriesLink({ ct, rowHandles, index, t }),
        },
        {
          key: "embed",
          header: t({ key: "Embed" }),
          cell: (ct, index) => renderCollectionEmbed({ copyEmbedCode, ct, rowHandles, index, copiedKey, t, copyFallback }),
        },
        {
          key: "actions",
          header: t({ key: "More" }),
          cell: (ct, index) => renderCollectionMenu({ t, ct, rowHandles, index, setEditingFieldsFor, setPendingLifecycle, runLifecycle, locale }),
        },
      ]}
    />
  );
}

function renderCollectionsEmpty(
  { t }:
    Pick<Parameters<typeof renderCollectionsTable>[0], "t">
) {
  return (
    <div className="card">
      <div className="empty-state">
        <p>{t({ key: "No Collections yet." })}</p>
        <p className="page-description">{t({ key: "Create your first content type to start adding entries." })}</p>
      </div>
    </div>
  );
}

function renderCollectionEntriesLink(
  { ct, rowHandles, index, t }:
    Pick<Parameters<typeof renderCollectionsTable>[0], "rowHandles" | "t"> &
    { ct: AdminContentType; index: number }
) {
  return (
    <a
      href={`/admin/collections/${ct.key}`}
      {...agentHandle({ handle: `${rowHandles[index]}-entries` }, {
        role: "link",
        label: "Open this content type's list of entries",
      })}
    >
      {t({ key: "Manage entries" })}
    </a>
  );
}

function renderCollectionEmbed(
  { copyEmbedCode, ct, rowHandles, index, copiedKey, t, copyFallback }:
    Pick<ReturnType<NonNullable<CollectionsProps["useCollectionsHook"]>>, "copyEmbedCode" | "copiedKey" | "t" | "copyFallback"> &
    { ct: AdminContentType; rowHandles: ReturnType<typeof buildAgentListHandles>; index: number }
) {
  return (
    <>
      <button
        type="button"
        onClick={() => void copyEmbedCode(ct)}
        {...agentHandle({ handle: `${rowHandles[index]}-copy-embed` }, {
          role: "button",
          label: `Copy the embed code for content type "${ct.label}"`,
        })}
      >
        {/* aria-live so the swap to "Copied" is announced, as StaticSiteTab's copy button does. */}
        <span aria-live="polite">{copiedKey === ct.key ? t({ key: "Copied" }) : t({ key: "Copy embed code" })}</span>
      </button>
      {copyFallback?.key === ct.key && <code translate="no">{copyFallback.snippet}</code>}
    </>
  );
}

function renderCollectionMenu(
  { t, ct, rowHandles, index, setEditingFieldsFor, setPendingLifecycle, runLifecycle, locale }:
    Pick<ReturnType<NonNullable<CollectionsProps["useCollectionsHook"]>>, "t" | "setEditingFieldsFor" | "setPendingLifecycle" | "runLifecycle" | "locale"> &
    { ct: AdminContentType; rowHandles: ReturnType<typeof buildAgentListHandles>; index: number }
) {
  return (
    <RowMenu
      triggerLabel={t({ key: 'Actions for content type "{label}"' }).replace("{label}", () => ct.label)}
      agentHandle={`${rowHandles[index]}-menu`}
      items={contentTypeMenuItems(
        { contentType: ct, handlers: {
          onEditFields: setEditingFieldsFor,
          onDeprecate: ({ contentType }, _optional = {}) => setPendingLifecycle({ op: "deprecate", contentType }),
          onReactivate: ({ contentType }, _optional = {}) => void runLifecycle(contentType, "reactivate"),
          onTombstone: ({ contentType }, _optional = {}) => setPendingLifecycle({ op: "tombstone", contentType }),
        }, locale },
      )}
    />
  );
}

function renderCollectionsHeader(
  { t, setShowNewDialog }:
    Pick<ReturnType<NonNullable<CollectionsProps["useCollectionsHook"]>>, "t" | "setShowNewDialog">
) {
  return (
    <div
      className="page-header"
      {...agentHandle({ handle: "collections-header" }, {
        role: "region",
        label: "Collections list header — page title and the New content type button",
      })}
    >
      <div className="page-header-text">
        <p className="page-kicker">{t({ key: "Content" })}</p>
        <h1 className="page-title">{t({ key: "Collections" })}</h1>
        <p className="page-description">{t({ key: "Content types you define, each with its own set of entries." })}</p>
      </div>
      <div className="page-actions">
        <PublishSectionButton section="collections" />
        <button
          onClick={() => setShowNewDialog(true)}
          {...agentHandle({ handle: "collections-new" }, { role: "button", label: "Define a new content type" })}
        >
          {t({ key: "New content type" })}
        </button>
      </div>
    </div>
  );
}
