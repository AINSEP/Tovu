import { CONTENT_TYPE_FIELD_KINDS, type AdminContentType, type ContentTypeFieldKind } from "../../lib/api";
import { DataTable, RowMenu } from "@jini-ai/admin/react";
import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "@jini-ai/agentic";
import { contentTypeMenuItems, type DraftField, type LifecycleConfirmOp } from "./rules";
import { useWiredCollections } from "./hooks/use-collections.hooks";
import { ServerLabel } from "@/components/status-labels";
import { useWiredNewContentTypeDialog } from "./hooks/use-new-content-type-dialog.hooks";
import { useWiredEditFieldsDialog } from "./hooks/use-edit-fields-dialog.hooks";
import { useLifecycleConfirmDialog } from "./hooks/use-lifecycle-confirm-dialog.hooks";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";

/**
 * @file Collections screen (design-spec.md §1, ADR-022/ADR-043) — the `/admin/collections`
 * landing view: the content-type registry list plus the "New content type" modal.
 *
 * Structural reference: `FormsList.tsx` (list/fetch/loading/error/empty shape) crossed with
 * `Settings.tsx`'s `.settings-dialog` modal idiom, per design-spec.md §0.3/§1.3. The entry list
 * (`/admin/collections/{typeKey}`) and entry editor (`/admin/collections/{typeKey}/{entryId|new}`) are
 * separate routed screens — see `CollectionEntries.tsx`/`CollectionEntryEditor.tsx`.
 *
 * Reserved key + grammar validation (§1.3) is duplicated client-side as a fast-reject only; the
 * server's `VALIDATION_ERROR` (`InvalidKeyGrammarError`/`ReservedContentTypeKeyError`) is the
 * authoritative check, same disclosed pattern `Settings.tsx`'s header comment documents for its
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
// One draft field's fieldset — shared by the New content type modal and the Edit fields modal,
// which differ only in their id/agent-handle prefix, whether the Remove button always shows (Edit)
// or only past the first field (New), and that button's own agentHandle label text.
// ---------------------------------------------------------------------------

interface ContentTypeFieldFieldsetProps {
  field: DraftField;
  index: number;
  /** e.g. "ct-field" (New) or "ct-edit-field" (Edit) — prefixes every input `id` on this row. */
  idPrefix: string;
  /** This row's own agentHandle base, from the caller's `buildAgentListHandles` list. */
  agentHandleBase: string;
  onUpdateField: (rowId: number, patch: Partial<DraftField>) => void;
  onRemoveField: (rowId: number) => void;
  showRemoveButton: boolean;
  removeButtonLabel: string;
  t: (key: string) => string;
}

function ContentTypeFieldFieldset({
  field: f,
  index,
  idPrefix,
  agentHandleBase: base,
  onUpdateField,
  onRemoveField,
  showRemoveButton,
  removeButtonLabel,
  t,
}: ContentTypeFieldFieldsetProps) {
  return (
    <fieldset className="collections-field-row">
      <legend>{t("Field")} {index + 1}</legend>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-name-${f._rowId}`}>{t("Name")}</label>
        <input
          id={`${idPrefix}-name-${f._rowId}`}
          value={f.name}
          onChange={(e) => onUpdateField(f._rowId, { name: e.target.value })}
          placeholder="e.g. prep_time"
          {...agentHandle({ handle: `${base}-name` }, { role: "field", label: "This field's name" })}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-kind-${f._rowId}`}>{t("Kind")}</label>
        <select
          id={`${idPrefix}-kind-${f._rowId}`}
          value={f.kind}
          onChange={(e) => onUpdateField(f._rowId, { kind: e.target.value as ContentTypeFieldKind })}
          {...agentHandle({ handle: `${base}-kind` }, {
            role: "field",
            label: "This field's data type — set with page.select_option, not click",
          })}
        >
          {CONTENT_TYPE_FIELD_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <label className="form-checkbox-field">
        <input
          type="checkbox"
          checked={f.required}
          onChange={(e) => onUpdateField(f._rowId, { required: e.target.checked })}
          {...agentHandle({ handle: `${base}-required` }, {
            role: "checkbox",
            label: "Whether every entry of this content type must set this field",
          })}
        />
        {t("Required")}
      </label>
      <label className="form-checkbox-field" title={t("Choose only the fields you need to filter or sort by.")}>
        <input
          type="checkbox"
          checked={f.queryable}
          onChange={(e) => onUpdateField(f._rowId, { queryable: e.target.checked })}
          {...agentHandle({ handle: `${base}-queryable` }, {
            role: "checkbox",
            label: "Whether this field gets a database index so entries can be filtered/sorted by it",
          })}
        />
        {t("Use for filtering and sorting")}
      </label>
      {showRemoveButton ? (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onRemoveField(f._rowId)}
          {...agentHandle({ handle: `${base}-remove` }, { role: "button", label: removeButtonLabel })}
        >
          {t("Remove field")}
        </button>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// New content type modal (design-spec.md §1.3 — recommended modal, applied here per §6)
// ---------------------------------------------------------------------------

export interface NewContentTypeDialogProps {
  onCreated: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useNewContentTypeDialogHook?: typeof useWiredNewContentTypeDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

export function NewContentTypeDialog({
  onCreated,
  onCancel,
  useNewContentTypeDialogHook = useWiredNewContentTypeDialog,
  t,
}: NewContentTypeDialogProps, _optional: Record<string, never> = {}) {
  const { label, setLabel, key, setKey, fields, updateField, removeField, addField, error, saving, submit, cancel } =
    useNewContentTypeDialogHook({ onCreated, onCancel });
  const fieldHandles = buildAgentListHandles({ prefix: "new-content-type-field", ids: fields.map((f) => String(f._rowId)) }
  );

  return (
    <Dialog open title={t("New content type")} onClose={() => cancel()} pending={saving}
      className="settings-dialog tovu-domain-dialog collections-type-dialog">
      <form
        onSubmit={submit}
        {...agentHandle({ handle: "new-content-type-dialog" }, {
          role: "region",
          label: "New content type dialog — its label, key, and field schema",
        })}
      >
        <div className="jini-dialog-body">
        <div className="field">
          <label className="field-label" htmlFor="ct-label">{t("Label")}</label>
          <input
            id="ct-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("e.g. Recipe")}
            data-jini-autofocus=""
            {...agentHandle({ handle: "new-content-type-label" }, { role: "field", label: "This content type's display name" })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ct-key">{t("Key")}</label>
          <input
            id="ct-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. recipe"
            {...agentHandle({ handle: "new-content-type-key" }, {
              role: "field",
              label: "This content type's machine key — used in its entries' URLs",
            })}
          />
        </div>

        <div>
          <h3 className="jini-dialog-section-title">{t("Fields")}</h3>
          {fields.map((f, index) => (
            <ContentTypeFieldFieldset
              key={f._rowId}
              field={f}
              index={index}
              idPrefix="ct-field"
              agentHandleBase={fieldHandles[index]}
              onUpdateField={updateField}
              onRemoveField={removeField}
              showRemoveButton={fields.length > 1}
              removeButtonLabel={t("Remove this field from the new content type")}
              t={t}
            />
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={addField}
            {...agentHandle({ handle: "new-content-type-add-field" }, { role: "button", label: "Add another field to this content type" })}
          >
            {t("Add field")}
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        </div>
        <div className="jini-dialog-footer editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={cancel}
            disabled={saving}
            {...agentHandle({ handle: "new-content-type-cancel" }, { role: "button", label: "Close this dialog without creating a content type" })}
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            {...agentHandle({ handle: "new-content-type-submit" }, { role: "button", label: "Create this content type" })}
          >
            {saving ? t("Saving…") : t("Create content type")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit fields dialog (REQ-05 — post-creation field-schema editing)
// ---------------------------------------------------------------------------

export interface EditFieldsDialogProps {
  contentType: AdminContentType;
  onSaved: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useEditFieldsDialogHook?: typeof useWiredEditFieldsDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

export function EditFieldsDialog({
  contentType,
  onSaved,
  onCancel,
  useEditFieldsDialogHook = useWiredEditFieldsDialog,
  t,
}: EditFieldsDialogProps, _optional: Record<string, never> = {}) {
  const { fields, updateField, removeField, addField, error, saving, submit, cancel } = useEditFieldsDialogHook({
    contentType,
    onSaved,
    onCancel,
  });
  const fieldHandles = buildAgentListHandles({ prefix: "edit-fields-field", ids: fields.map((f) => String(f._rowId)) }
  );

  return (
    <Dialog open title={`${t("Edit fields —")} ${contentType.label}`} onClose={() => cancel()} pending={saving}
      className="settings-dialog tovu-domain-dialog collections-type-dialog">
      <form
        onSubmit={submit}
        {...agentHandle({ handle: "edit-fields-dialog" }, {
          role: "region",
          label: "Edit fields dialog — this content type's full field schema",
        })}
      >
        <div className="jini-dialog-body">
        <div>
          <h3 className="jini-dialog-section-title">{t("Fields")}</h3>
          {fields.map((f, index) => (
            <ContentTypeFieldFieldset
              key={f._rowId}
              field={f}
              index={index}
              idPrefix="ct-edit-field"
              agentHandleBase={fieldHandles[index]}
              onUpdateField={updateField}
              onRemoveField={removeField}
              showRemoveButton={true}
              removeButtonLabel={t("Remove this field from this content type")}
              t={t}
            />
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={addField}
            {...agentHandle({ handle: "edit-fields-add-field" }, { role: "button", label: "Add another field to this content type" })}
          >
            {t("Add field")}
          </button>
        </div>

        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}

        </div>
        <div className="jini-dialog-footer editor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={cancel}
            disabled={saving}
            data-jini-autofocus=""
            {...agentHandle({ handle: "edit-fields-cancel" }, { role: "button", label: "Close this dialog without saving field changes" })}
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            {...agentHandle({ handle: "edit-fields-submit" }, { role: "button", label: "Save this content type's field schema" })}
          >
            {saving ? t("Saving…") : t("Save fields")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle confirm dialog (Deprecate / Reactivate / Tombstone — design-spec.md §1.3/§1.8)
// ---------------------------------------------------------------------------

export interface LifecycleConfirmDialogProps {
  op: "deprecate" | "tombstone";
  contentType: AdminContentType;
  onConfirm: () => void;
  onCancel: () => void;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  useLifecycleConfirmDialogHook?: typeof useLifecycleConfirmDialog;
  /** Translator closure — see `Collections()`'s own `t`. */
  t: (key: string) => string;
}

export function LifecycleConfirmDialog({
  op,
  contentType,
  onConfirm,
  onCancel,
  useLifecycleConfirmDialogHook = useLifecycleConfirmDialog,
  t,
}: LifecycleConfirmDialogProps, _optional: Record<string, never> = {}) {
  const { copy, autoFocusCancel } = useLifecycleConfirmDialogHook({ op, onCancel });

  return (
    <Dialog open title={copy.title} onClose={() => onCancel()} className="settings-dialog tovu-domain-dialog">
        <p>
          {copy.body} (<strong>{contentType.label}</strong>)
        </p>
        <span className="editor-actions">
          {/* Deprecate is reversible (Reactivate exists) but access-affecting — `.btn-warning`,
              same distinction as Users.tsx's Disable. Tombstone is not, per its own copy above
              ("not reversible from this screen") — `.btn-danger`, matching Roles.tsx/Jini redirects/react/pages/RedirectsPage.tsx's
              existing destructive-delete convention. */}
          <button
            type="button"
            className={op === "deprecate" ? "btn-warning" : "btn-danger"}
            data-jini-autofocus={autoFocusCancel ? undefined : ""}
            onClick={onConfirm}
            {...agentHandle({ handle: "lifecycle-confirm" }, {
              role: "button",
              label:
                "Confirm this content type's lifecycle change — Deprecate is reversible, Tombstone is not from this screen",
            })}
          >
            {op === "deprecate" ? t("Deprecate") : t("Delete")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-jini-autofocus={autoFocusCancel ? "" : undefined}
            onClick={onCancel}
            {...agentHandle({ handle: "lifecycle-cancel" }, { role: "button", label: "Close this dialog without changing the lifecycle" })}
          >
            {t("Cancel")}
          </button>
        </span>
    </Dialog>
  );
}

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
  t: (key: string) => string;
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
    types,
    error,
    showNewDialog,
    setShowNewDialog,
    pendingLifecycle,
    setPendingLifecycle,
    editingFieldsFor,
    setEditingFieldsFor,
    actionError,
    load,
    runLifecycle,
    copiedKey,
    copyFallback,
    copyEmbedCode,
    t,
    locale,
  } = useCollectionsHook();

  if (error && !types) return <div className="notice error">{error}</div>;
  if (!types) return <div className="notice">{t("Loading content types…")}</div>;

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
      <div
        className="page-header"
        {...agentHandle({ handle: "collections-header" }, {
          role: "region",
          label: "Collections list header — page title and the New content type button",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{t("Collections")}</h1>
          <p className="page-description">{t("Content types you define, each with its own set of entries.")}</p>
        </div>
        <div className="page-actions">
          <PublishSectionButton section="collections" />
          <button
            onClick={() => setShowNewDialog(true)}
            {...agentHandle({ handle: "collections-new" }, { role: "button", label: "Define a new content type" })}
          >
            {t("New content type")}
          </button>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}
      {actionError ? <div className="notice error">{actionError}</div> : null}

      <DataTable
        rows={types}
        rowKey={(ct) => ct.key}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No Collections yet.")}</p>
              <p className="page-description">{t("Create your first content type to start adding entries.")}</p>
            </div>
          </div>
        }
        columns={[
          // The label opens the entries too (mobile catalog CO-1, 2026-10-06): "Manage entries" sits
          // in the seventh column, off-screen in a phone's sideways scroller, so the row's own name
          // is the obvious way in.
          { key: "label", header: t("Label"), cell: (ct) => <a href={`/admin/collections/${ct.key}`}>{ct.label}</a> },
          { key: "key", header: t("Key"), cell: (ct) => <code>{ct.key}</code> },
          { key: "fields", header: t("Fields"), cell: (ct) => ct.fields.length },
          {
            key: "queryable-fields",
            header: t("Queryable fields"),
            cell: (ct) => ct.fields.filter((f) => f.queryable).length,
          },
          {
            key: "status",
            header: t("Status"),
            cell: (ct) => <span className={`status status-${ct.status}`}><ServerLabel value={ct.status} /></span>,
          },
          {
            key: "entries",
            header: t("Entries"),
            cell: (ct, index) => (
              <a
                href={`/admin/collections/${ct.key}`}
                {...agentHandle({ handle: `${rowHandles[index]}-entries` }, {
                  role: "link",
                  label: "Open this content type's list of entries",
                })}
              >
                {t("Manage entries")}
              </a>
            ),
          },
          {
            key: "embed",
            header: t("Embed"),
            cell: (ct, index) => (
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
                  <span aria-live="polite">{copiedKey === ct.key ? t("Copied") : t("Copy embed code")}</span>
                </button>
                {copyFallback?.key === ct.key && <code translate="no">{copyFallback.snippet}</code>}
              </>
            ),
          },
          {
            key: "actions",
            header: t("More"),
            cell: (ct, index) => (
              <RowMenu
                triggerLabel={t('Actions for content type "{label}"').replace("{label}", ct.label)}
                agentHandle={`${rowHandles[index]}-menu`}
                items={contentTypeMenuItems(
                  ct,
                  {
                    onEditFields: setEditingFieldsFor,
                    onDeprecate: (contentType) => setPendingLifecycle({ op: "deprecate", contentType }),
                    onReactivate: (contentType) => void runLifecycle(contentType, "reactivate"),
                    onTombstone: (contentType) => setPendingLifecycle({ op: "tombstone", contentType }),
                  },
                  locale,
                )}
              />
            ),
          },
        ]}
      />

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
