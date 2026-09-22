import { EditorContent, type Editor } from "@tiptap/react";
import { agentHandle } from "@jini-ai/agentic";
import { type AdminTaxonomyWithTerms, type ContentTypeFieldDef } from "../../lib/api";
import { buildAgentListHandles } from "../../lib/agent-list-handles";
import { WidgetEmbedInsertControl } from "../../lib/widget-embed-extension";
import { useWiredCollectionEntryEditor } from "./hooks/use-collection-entry-editor.hooks";
import { useWiredTermPicker } from "./hooks/use-term-picker.hooks";
import { useJsonFieldControl } from "./hooks/use-json-field-control.hooks";

/**
 * @file Collections' entry editor (design-spec.md §1.5/§1.6) — the
 * `/admin/collections/{typeKey}/{entryId|new}` route. Markup only: every piece of state and every
 * API call lives in `hooks/use-collection-entry-editor.hooks.ts` (and, for `TermPicker`,
 * `hooks/use-term-picker.hooks.ts`) — see those files' headers for why.
 *
 * Disclosed deviation from design-spec.md §1.5's "do not build a second TipTap wiring from
 * scratch — extract/reuse [PostEditor.tsx's]" direction: this dispatch's own scope discipline
 * lists `apps/admin/src/{App.tsx,nav.ts,lib/api.ts}` and new files under `sections/` as the touch
 * boundary — `PostEditor.tsx` is not in it, so extracting a shared component (which would require
 * editing `PostEditor.tsx` to consume it) was out of scope. This file duplicates a trimmed
 * subset of `PostEditor.tsx`'s TipTap wiring instead (StarterKit only — no image extension, no
 * drag-and-drop image handling, no formatting toolbar beyond what `StarterKit`'s own keyboard
 * shortcuts already provide) rather than a full second copy of the richer editor. A future pass
 * extracting both into a shared `components/RichTextEditor.tsx` is a reasonable follow-up, not
 * done here to respect the declared scope boundary.
 */

const EXT_SITE_PATH = ["ext", "site"] as const;

/** Reads `fieldsJson.ext.site.{name}` defensively — the JSON shape is server-validated, not
 * client-typed, so this never assumes a key is present. */
function readExtSiteField(fieldsJson: unknown, name: string): unknown {
  if (typeof fieldsJson !== "object" || fieldsJson === null) return undefined;
  const ext = (fieldsJson as Record<string, unknown>)[EXT_SITE_PATH[0]];
  if (typeof ext !== "object" || ext === null) return undefined;
  const site = (ext as Record<string, unknown>)[EXT_SITE_PATH[1]];
  if (typeof site !== "object" || site === null) return undefined;
  return (site as Record<string, unknown>)[name];
}

/** A `DynamicField` control's own props, once the field/value/onChange triple has been narrowed
 * down to the one input it renders.
 *
 * `agentHandleProps` is the same optional-pass-through shape this workstream's shared components
 * use: `DynamicField` computes the one handle each field gets (see `EntryFieldsSection`'s own
 * comment) and hands it down as ready-to-spread attribute props, so every one of the five controls
 * below stays a one-line function while still publishing its own handle on the actual `<input>` —
 * not a wrapper `<div>` around it, which `page.fill`/`page.select_option` cannot resolve into a
 * fillable control. */
interface FieldControlProps {
  inputId: string;
  value: unknown;
  onChange: (value: unknown) => void;
  agentHandleProps: ReturnType<typeof agentHandle>;
  /** This field's own schema name — only `JsonFieldControl` (M2) uses it, to key its parse-validity
   *  report; every other control ignores it. */
  fieldName: string;
  /** M2: forwarded straight through to `JsonFieldControl` — see that control's own comment. */
  setFieldValidity: (fieldName: string, valid: boolean) => void;
}

function TextFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
  return (
    <input
      id={inputId}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      {...agentHandleProps}
    />
  );
}

function IntegerFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="number"
      step="1"
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      {...agentHandleProps}
    />
  );
}

function RealFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="number"
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      {...agentHandleProps}
    />
  );
}

function BooleanFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="checkbox"
      checked={value === true}
      onChange={(e) => onChange(e.target.checked)}
      {...agentHandleProps}
    />
  );
}

function DatetimeFieldControl({ inputId, value, onChange, agentHandleProps }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="datetime-local"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      {...agentHandleProps}
    />
  );
}

/** `json`-kind field control: a raw-JSON textarea backed by `useJsonFieldControl` (state/parsing
 * lives there, not here — see that hook's own header). `aria-invalid` flags an unparseable buffer
 * without inventing new copy for it; the last value that DID parse is what stays in `extFields`
 * and what a save sends, regardless of how the buffer currently looks. */
function JsonFieldControl({ inputId, value, onChange, agentHandleProps, fieldName, setFieldValidity }: FieldControlProps) {
  const { text, parseError, handleTextChange } = useJsonFieldControl({ value, onChange, fieldName, setFieldValidity });
  return (
    <textarea
      id={inputId}
      value={text}
      aria-invalid={parseError}
      onChange={(e) => handleTextChange(e.target.value)}
      {...agentHandleProps}
    />
  );
}

/** One control per `ContentTypeFieldDef.kind` (design-spec.md §1.5). A `Record` keyed by the
 * closed `kind` union rather than a switch/ternary chain — same exhaustiveness guarantee (add a
 * kind to the union and `tsc` rejects this object until a control is added for it), but as a flat
 * lookup instead of nested conditionals.
 *
 * `relation` deliberately reuses `TextFieldControl` rather than a same-shaped duplicate: it stores
 * a foreign entity id and shares `text`'s storage class server-side (`@jini-ai/cms`'s
 * `content-types/types.ts`), so a plain text input is a correct control for it, not a fallback. */
const FIELD_CONTROLS: Record<ContentTypeFieldDef["kind"], (props: FieldControlProps) => React.JSX.Element> = {
  text: TextFieldControl,
  integer: IntegerFieldControl,
  real: RealFieldControl,
  boolean: BooleanFieldControl,
  datetime: DatetimeFieldControl,
  relation: TextFieldControl,
  json: JsonFieldControl,
};

function DynamicField(props: {
  field: ContentTypeFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  /** This field's own distinct handle base — see `EntryFieldsSection`'s own comment for why it's
   *  computed once, up there (via `buildAgentListHandles`), rather than per-field here. */
  agentBase: string;
  /** M2: forwarded to `Control` as `setFieldValidity` — only `JsonFieldControl` uses it. */
  setFieldValidity: (fieldName: string, valid: boolean) => void;
}) {
  const { field, value, onChange, agentBase, setFieldValidity } = props;
  const inputId = `entry-field-${field.name}`;
  const Control = FIELD_CONTROLS[field.kind];

  return (
    <div className="collections-dynamic-field">
      <label htmlFor={inputId}>
        {field.name}
        {field.required ? " *" : ""}
      </label>
      <Control
        inputId={inputId}
        value={value}
        onChange={onChange}
        agentHandleProps={agentHandle(agentBase, {
          role: field.kind === "boolean" ? "checkbox" : "field",
          label: `This content type's "${field.name}" field${field.required ? " (required)" : ""}`,
        })}
        fieldName={field.name}
        setFieldValidity={setFieldValidity}
      />
    </div>
  );
}

/** Assign-only term picker (design-spec.md §1.6). Not pre-populated from existing assignments —
 * no "terms assigned to this entry" read route exists yet (only the write-only `assignTerms`
 * route). `assignTerms` itself is additive (upserts, never clears an unselected assignment), so
 * this control is deliberately framed as "assign", not "set", to avoid implying it can unassign. */
function TermPicker(props: {
  taxonomies: AdminTaxonomyWithTerms[];
  contentType: string;
  contentId: string;
  t: (key: string) => string;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`CollectionEntryEditor`
   *  below) pass nothing and behave exactly as before. */
  useTermPickerHook?: typeof useWiredTermPicker;
}) {
  const useTermPickerHook = props.useTermPickerHook ?? useWiredTermPicker;
  const { selected, toggle, saving, message, error, assign } = useTermPickerHook({
    contentType: props.contentType,
    contentId: props.contentId,
  });
  const { t } = props;

  if (props.taxonomies.length === 0) return null;

  // Term ids are database row ids — globally unique across every taxonomy, not just within one —
  // so one flat handle list across all taxonomies is correct; there is no per-taxonomy scoping to
  // preserve the way `EXTERNAL_MCP_CARD_HANDLE_PREFIX`'s cards or this file's own `entry-field`s
  // need.
  const termHandles = buildAgentListHandles(
    "term-picker-term",
    props.taxonomies.flatMap(({ terms }) => terms.map((term) => term.id)),
  );
  let termHandleIndex = 0;

  return (
    <div className="collections-term-picker">
      <h3>{t("Categories & Tags")}</h3>
      <p className="muted-cell">
        {t(
          "Assign existing terms to this entry. This adds assignments — it does not show or remove terms already assigned (no read route exists for that yet).",
        )}
      </p>
      {props.taxonomies.map(({ taxonomy, terms }) => (
        <fieldset key={taxonomy.id}>
          <legend>{taxonomy.name}</legend>
          {terms.length === 0 ? (
            <p className="muted-cell">{t("No terms yet.")}</p>
          ) : (
            terms.map((term) => {
              // Consumed in rendered (taxonomy, then term) order, matching how `termHandles` was
              // built above via the identical `flatMap` order — a plain running index rather than
              // a second id-keyed lookup, since this loop already visits every term exactly once.
              const handle = termHandles[termHandleIndex];
              termHandleIndex += 1;
              return (
                <label key={term.id} className="collections-term-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.has(term.id)}
                    onChange={() => toggle(term.id)}
                    {...agentHandle(handle, {
                      role: "checkbox",
                      label: `Assign the "${taxonomy.name}" term "${term.name}" to this entry`,
                    })}
                  />
                  {term.name}
                </label>
              );
            })
          )}
        </fieldset>
      ))}
      {/* `term-picker-actions` is a spacing-only hook layered on `.editor-actions`, same pattern
          as `FormEditor.tsx`'s `.form-actions`: `.editor-actions` sets direction/gap/alignment but
          deliberately no outer margin, and this row follows a stack of `<fieldset>`s with nothing
          else separating them. Scoped here rather than added to `.editor-actions` itself, which is
          shared with screens where a blanket top margin would be wrong (see this dispatch's
          `.editor-actions` audit — most of its ~30 other callers are small inline `<span>` groups
          inside a table row or compact form, not a bottom-of-block action bar). */}
      <span className="editor-actions term-picker-actions">
        <button
          type="button"
          onClick={assign}
          disabled={saving || selected.size === 0}
          {...agentHandle("term-picker-assign", {
            role: "button",
            label: "Assign every checked term above to this entry",
          })}
        >
          {saving ? t("Assigning…") : t("Assign selected terms")}
        </button>
        {message ? <span className="save-ok">{message}</span> : null}
        {error ? <span className="save-error">{error}</span> : null}
      </span>
    </div>
  );
}

/** The page-header action cluster: back link, save/error status, and the status-dependent
 * Publish/Unpublish/Save button set. Split out of `CollectionEntryEditor` because this cluster
 * alone carried most of that function's branching — the entry's lifecycle status governs which
 * buttons and status pill are showing at once. */
/** Publish/Unpublish/Save — split out of `EntryPageActions` because the status-dependent branch
 * pairs (which lifecycle button shows, which class the Save button gets) alone pushed that
 * function's branch count over the ceiling; this trio is one coherent unit of "buttons driven by
 * publish state" on its own. */
function EntryLifecycleButtons(props: {
  entry: { status: string } | null | undefined;
  saving: boolean;
  /** True while save OR a lifecycle toggle is in flight (H2) — disables all three buttons, since
   *  Publish now runs a save leg before its lifecycle leg and either one being in flight must
   *  block a second click. `saving` alone stays the Save button's own LABEL source (unchanged). */
  busy: boolean;
  onToggleLifecycle: (op: "publish" | "unpublish") => void;
  onSave: () => void;
  t: (key: string) => string;
}) {
  const { entry, saving, busy, onToggleLifecycle, onSave, t } = props;
  const isPublished = entry?.status === "published";

  return (
    <>
      {entry && !isPublished ? (
        <button
          type="button"
          onClick={() => onToggleLifecycle("publish")}
          disabled={busy}
          {...agentHandle("entry-publish", {
            role: "button",
            label: "Publish this entry immediately, saving its current title, fields and body",
          })}
        >
          {t("Publish")}
        </button>
      ) : null}
      {/* Reversible-but-access-affecting (drops the entry off the site; still editable here,
          still re-publishable) — `.btn-warning`, matching `Posts.tsx`/`Pages.tsx` RowMenu's
          own Disable, not `.btn-danger`, which stays reserved for the genuinely destructive
          trash action. */}
      {entry && isPublished ? (
        <button
          type="button"
          className="btn-warning"
          onClick={() => onToggleLifecycle("unpublish")}
          disabled={busy}
          {...agentHandle("entry-unpublish", {
            role: "button",
            label: "Unpublish this entry — removes it from the live site without deleting it",
          })}
        >
          {t("Unpublish")}
        </button>
      ) : null}
      {/* Secondary while Publish is also showing (draft entries) so the two don't compete for
          primary weight — mirrors `PostEditor.tsx`'s identical Save/Publish pairing exactly.
          Once published, Publish is gone and Save is this screen's one remaining primary
          action, so it goes back to bare/primary. */}
      <button
        type="button"
        className={entry && !isPublished ? "btn-secondary" : undefined}
        onClick={onSave}
        disabled={busy}
        {...agentHandle("entry-save", { role: "button", label: "Save this entry's title, slug, fields and body" })}
      >
        {saving ? t("Saving…") : t("Save")}
      </button>
    </>
  );
}

function EntryPageActions(props: {
  contentTypeKey: string;
  contentTypeLabel: string;
  entry: { status: string } | null | undefined;
  message: string | null;
  error: string | null;
  saving: boolean;
  busy: boolean;
  onToggleLifecycle: (op: "publish" | "unpublish") => void;
  onSave: () => void;
  t: (key: string) => string;
}) {
  const { contentTypeKey, contentTypeLabel, entry, message, error, saving, busy, onToggleLifecycle, onSave, t } = props;

  return (
    <div className="page-actions">
      {/* Plain `<a className="btn-secondary">`, not a `<button>` nested inside an `<a>` (invalid
          HTML, undefined activation behaviour) — same `a.btn-*` mechanism `Dashboard.tsx`'s
          "View site ↗" already uses. */}
      <a
        className="btn-secondary"
        href={`/admin/collections/${contentTypeKey}`}
        {...agentHandle("entry-back", { role: "link", label: "Back to this content type's list of entries" })}
      >
        ← {contentTypeLabel}
      </a>
      {message ? <span className="save-ok">{message}</span> : null}
      {error ? <span className="save-error">{error}</span> : null}
      {entry ? <span className={`status status-${entry.status}`}>{entry.status}</span> : null}
      <EntryLifecycleButtons
        entry={entry}
        saving={saving}
        busy={busy}
        onToggleLifecycle={onToggleLifecycle}
        onSave={onSave}
        t={t}
      />
    </div>
  );
}

/** The `/{slug}` row under the title: an existing entry's slug is immutable (plain text), a new
 * entry's slug is an editable field. Split out of `CollectionEntryEditor` alongside the fields
 * section below — both are self-contained "does this thing exist yet" branches that don't need
 * anything else in the parent's scope. */
function EntrySlugField(props: {
  entry: { slug: string } | null | undefined;
  slug: string;
  onSlugChange: (value: string) => void;
  t: (key: string) => string;
}) {
  const { entry, slug, onSlugChange, t } = props;
  return (
    <div className="editor-slug">
      /{" "}
      {entry ? (
        <span>{entry.slug}</span>
      ) : (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">{t("Entry slug")}</span>
          <input
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder="entry-slug"
            {...agentHandle("entry-slug", {
              role: "field",
              label: "This entry's URL slug — only editable while creating a new entry",
            })}
          />
        </label>
      )}
    </div>
  );
}

/** The dynamic-fields section (design-spec.md §1.5) — hidden entirely when the content type
 * defines no custom fields. */
function EntryFieldsSection(props: {
  fields: ContentTypeFieldDef[];
  entry: { fieldsJson?: unknown } | null | undefined;
  extFields: Record<string, unknown>;
  onFieldChange: (name: string, value: unknown) => void;
  /** M2: forwarded to each `DynamicField`. */
  setFieldValidity: (fieldName: string, valid: boolean) => void;
  t: (key: string) => string;
}) {
  const { fields, entry, extFields, onFieldChange, setFieldValidity, t } = props;
  if (fields.length === 0) return null;

  // Field names are this content type's own schema keys, unique by construction (Collections.tsx's
  // `EditFieldsDialog` is where they're defined) — `buildAgentListHandles` still slugifies+dedupes
  // rather than assuming that, the same defensive stance every other list handle in this workstream
  // takes (a schema author is still free to pick a name that isn't already handle-shaped).
  const fieldHandles = buildAgentListHandles(
    "entry-field",
    fields.map((field) => field.name),
  );

  return (
    <div className="collections-dynamic-fields">
      <h3>{t("Fields")}</h3>
      {fields.map((field, index) => (
        <DynamicField
          key={field.name}
          field={field}
          value={extFields[field.name] ?? readExtSiteField(entry?.fieldsJson, field.name)}
          onChange={(value) => onFieldChange(field.name, value)}
          agentBase={fieldHandles[index]}
          setFieldValidity={setFieldValidity}
        />
      ))}
    </div>
  );
}

export interface CollectionEntryEditorProps {
  contentTypeKey: string;
  entryId: string | null;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  only `contentTypeKey`/`entryId` and behave exactly as before. */
  useCollectionEntryEditorHook?: typeof useWiredCollectionEntryEditor;
}

/**
 * Resolves the injected hook prop to the real wired hook when a caller passes none. Pulled into its
 * own function, the same `??`-avoidance idiom `MenuEditor.tsx`'s `orEmpty` uses (see that function's
 * own doc): `CollectionEntryEditor` was already sitting at the 9/9 complexity ceiling, and ESLint's
 * cyclomatic-complexity rule counts a default value or `??` inside a function's OWN body as one of
 * that function's own branches — a call out to a separately-scoped resolver does not.
 */
function resolveCollectionEntryEditorHook(
  override: typeof useWiredCollectionEntryEditor | undefined
): typeof useWiredCollectionEntryEditor {
  return override ?? useWiredCollectionEntryEditor;
}

export function CollectionEntryEditor(props: CollectionEntryEditorProps) {
  const useCollectionEntryEditorHook = resolveCollectionEntryEditorHook(props.useCollectionEntryEditorHook);
  const {
    contentType,
    entry,
    title,
    setTitle,
    slug,
    setSlug,
    extFields,
    setExtFields,
    taxonomies,
    message,
    error,
    loadError,
    loaded,
    saving,
    busy,
    editor,
    save,
    toggleLifecycle,
    setFieldValidity,
    t,
  } = useCollectionEntryEditorHook({ contentTypeKey: props.contentTypeKey, entryId: props.entryId });

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!loaded || contentType === undefined) return <div className="notice">{t("Loading entry…")}</div>;
  if (!contentType) return <div className="notice error">{t('Unknown content type "{contentTypeKey}".').replace("{contentTypeKey}", props.contentTypeKey)}</div>;
  if (props.entryId && !entry) return <div className="notice error">{t("Entry not found.")}</div>;

  return (
    <div className="page">
      <div
        className="page-header"
        {...agentHandle("entry-header", {
          role: "region",
          label: "Entry editor header — back link, save status, publish state and the Save button",
        })}
      >
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">
            {t(entry ? "Edit {label} entry" : "New {label} entry").replace("{label}", contentType.label)}
          </h1>
          <p className="page-description">{t("Update this entry's title, fields, and body.")}</p>
        </div>
        <EntryPageActions
          contentTypeKey={props.contentTypeKey}
          contentTypeLabel={contentType.label}
          entry={entry}
          message={message}
          error={error}
          saving={saving}
          busy={busy}
          onToggleLifecycle={toggleLifecycle}
          onSave={save}
          t={t}
        />
      </div>

      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title/slug
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). The slug field's label is only
          rendered in the `!entry` (create) branch, matching that branch's own `<input>`. */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Entry title</span>
        <input
          className="editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("Entry title")}
          {...agentHandle("entry-title", { role: "field", label: "This entry's title" })}
        />
      </label>
      <EntrySlugField entry={entry} slug={slug} onSlugChange={setSlug} t={t} />

      <div
        className="editor-shell"
        {...agentHandle("entry-editor-shell", { role: "region", label: "Formatting toolbar and the entry body editor" })}
      >
        <div className="editor-toolbar" role="toolbar" aria-label={t("Formatting")}>
          <div className="grp">
            <WidgetEmbedInsertControl editor={editor} agentHandle="entry-insert-widget" />
          </div>
        </div>
        {/* `role: "field"`, not `region`: this is a TipTap `contenteditable`, which the page driver
            treats as a fillable rich-text surface (see its `isEditableRegion`) — same convention
            `PostEditor.tsx`'s own `post-body` handle documents. */}
        <div
          className="editor-body"
          {...agentHandle("entry-body", { role: "field", label: "This entry's rich-text body content" })}
        >
          <EditorContent editor={editor as Editor} />
        </div>
      </div>

      <EntryFieldsSection
        fields={contentType.fields}
        entry={entry}
        extFields={extFields}
        onFieldChange={(name, value) => setExtFields((current) => ({ ...current, [name]: value }))}
        setFieldValidity={setFieldValidity}
        t={t}
      />

      {entry ? (
        <TermPicker taxonomies={taxonomies} contentType={props.contentTypeKey} contentId={entry.id} t={t} />
      ) : null}
    </div>
  );
}
