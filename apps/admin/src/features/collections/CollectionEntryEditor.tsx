import { EditorContent, type Editor } from "@tiptap/react";
import { type AdminTaxonomyWithTerms, type ContentTypeFieldDef } from "../../lib/api";
import { WidgetEmbedInsertControl } from "../../lib/widget-embed-extension";
import { useCollectionEntryEditor } from "./hooks/use-collection-entry-editor.hooks";
import { useTermPicker } from "./hooks/use-term-picker.hooks";

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
 * down to the one input it renders. */
interface FieldControlProps {
  inputId: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function TextFieldControl({ inputId, value, onChange }: FieldControlProps) {
  return <input id={inputId} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
}

function IntegerFieldControl({ inputId, value, onChange }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="number"
      step="1"
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function RealFieldControl({ inputId, value, onChange }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="number"
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function BooleanFieldControl({ inputId, value, onChange }: FieldControlProps) {
  return <input id={inputId} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
}

function DatetimeFieldControl({ inputId, value, onChange }: FieldControlProps) {
  return (
    <input
      id={inputId}
      type="datetime-local"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** One control per `ContentTypeFieldDef.kind` (design-spec.md §1.5). A `Record` keyed by the
 * closed `kind` union rather than a switch/ternary chain — same exhaustiveness guarantee (add a
 * kind to the union and `tsc` rejects this object until a control is added for it), but as a flat
 * lookup instead of nested conditionals. */
const FIELD_CONTROLS: Record<ContentTypeFieldDef["kind"], (props: FieldControlProps) => React.JSX.Element> = {
  text: TextFieldControl,
  integer: IntegerFieldControl,
  real: RealFieldControl,
  boolean: BooleanFieldControl,
  datetime: DatetimeFieldControl,
};

function DynamicField(props: {
  field: ContentTypeFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { field, value, onChange } = props;
  const inputId = `entry-field-${field.name}`;
  const Control = FIELD_CONTROLS[field.kind];

  return (
    <div className="collections-dynamic-field">
      <label htmlFor={inputId}>
        {field.name}
        {field.required ? " *" : ""}
      </label>
      <Control inputId={inputId} value={value} onChange={onChange} />
    </div>
  );
}

/** Assign-only term picker (design-spec.md §1.6). Not pre-populated from existing assignments —
 * no "terms assigned to this entry" read route exists yet (only the write-only `assignTerms`
 * route). `assignTerms` itself is additive (upserts, never clears an unselected assignment), so
 * this control is deliberately framed as "assign", not "set", to avoid implying it can unassign. */
function TermPicker(props: { taxonomies: AdminTaxonomyWithTerms[]; contentType: string; contentId: string }) {
  const { selected, toggle, saving, message, error, assign } = useTermPicker({
    contentType: props.contentType,
    contentId: props.contentId,
  });

  if (props.taxonomies.length === 0) return null;

  return (
    <div className="collections-term-picker">
      <h3>Categories &amp; Tags</h3>
      <p className="muted-cell">
        Assign existing terms to this entry. This adds assignments — it does not show or remove
        terms already assigned (no read route exists for that yet).
      </p>
      {props.taxonomies.map(({ taxonomy, terms }) => (
        <fieldset key={taxonomy.id}>
          <legend>{taxonomy.name}</legend>
          {terms.length === 0 ? (
            <p className="muted-cell">No terms yet.</p>
          ) : (
            terms.map((term) => (
              <label key={term.id} className="collections-term-checkbox">
                <input type="checkbox" checked={selected.has(term.id)} onChange={() => toggle(term.id)} />
                {term.name}
              </label>
            ))
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
        <button type="button" onClick={assign} disabled={saving || selected.size === 0}>
          {saving ? "Assigning…" : "Assign selected terms"}
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
  onToggleLifecycle: (op: "publish" | "unpublish") => void;
  onSave: () => void;
}) {
  const { entry, saving, onToggleLifecycle, onSave } = props;
  const isPublished = entry?.status === "published";

  return (
    <>
      {entry && !isPublished ? (
        <button type="button" onClick={() => onToggleLifecycle("publish")}>
          Publish
        </button>
      ) : null}
      {/* Reversible-but-access-affecting (drops the entry off the site; still editable here,
          still re-publishable) — `.btn-warning`, matching `Posts.tsx`/`Pages.tsx` RowMenu's
          own Disable, not `.btn-danger`, which stays reserved for the genuinely destructive
          trash action. */}
      {entry && isPublished ? (
        <button type="button" className="btn-warning" onClick={() => onToggleLifecycle("unpublish")}>
          Unpublish
        </button>
      ) : null}
      {/* Secondary while Publish is also showing (draft entries) so the two don't compete for
          primary weight — mirrors `PostEditor.tsx`'s identical Save/Publish pairing exactly.
          Once published, Publish is gone and Save is this screen's one remaining primary
          action, so it goes back to bare/primary. */}
      <button type="button" className={entry && !isPublished ? "btn-secondary" : undefined} onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
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
  onToggleLifecycle: (op: "publish" | "unpublish") => void;
  onSave: () => void;
}) {
  const { contentTypeKey, contentTypeLabel, entry, message, error, saving, onToggleLifecycle, onSave } = props;

  return (
    <div className="page-actions">
      <a href={`/admin/collections/${contentTypeKey}`}>
        <button type="button" className="btn-secondary">
          ← {contentTypeLabel}
        </button>
      </a>
      {message ? <span className="save-ok">{message}</span> : null}
      {error ? <span className="save-error">{error}</span> : null}
      {entry ? <span className={`status status-${entry.status}`}>{entry.status}</span> : null}
      <EntryLifecycleButtons entry={entry} saving={saving} onToggleLifecycle={onToggleLifecycle} onSave={onSave} />
    </div>
  );
}

/** The `/{slug}` row under the title: an existing entry's slug is immutable (plain text), a new
 * entry's slug is an editable field. Split out of `CollectionEntryEditor` alongside the fields
 * section below — both are self-contained "does this thing exist yet" branches that don't need
 * anything else in the parent's scope. */
function EntrySlugField(props: { entry: { slug: string } | null | undefined; slug: string; onSlugChange: (value: string) => void }) {
  const { entry, slug, onSlugChange } = props;
  return (
    <div className="editor-slug">
      /{" "}
      {entry ? (
        <span>{entry.slug}</span>
      ) : (
        <label className="a11y-label-wrap">
          <span className="visually-hidden">Entry slug</span>
          <input value={slug} onChange={(e) => onSlugChange(e.target.value)} placeholder="entry-slug" />
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
}) {
  const { fields, entry, extFields, onFieldChange } = props;
  if (fields.length === 0) return null;

  return (
    <div className="collections-dynamic-fields">
      <h3>Fields</h3>
      {fields.map((field) => (
        <DynamicField
          key={field.name}
          field={field}
          value={extFields[field.name] ?? readExtSiteField(entry?.fieldsJson, field.name)}
          onChange={(value) => onFieldChange(field.name, value)}
        />
      ))}
    </div>
  );
}

export function CollectionEntryEditor(props: { contentTypeKey: string; entryId: string | null }) {
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
    editor,
    save,
    toggleLifecycle,
  } = useCollectionEntryEditor({ contentTypeKey: props.contentTypeKey, entryId: props.entryId });

  if (loadError) return <div className="notice error">{loadError}</div>;
  if (!loaded || contentType === undefined) return <div className="notice">Loading entry…</div>;
  if (!contentType) return <div className="notice error">Unknown content type "{props.contentTypeKey}".</div>;
  if (props.entryId && !entry) return <div className="notice error">Entry not found.</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">{entry ? `Edit ${contentType.label} entry` : `New ${contentType.label} entry`}</h1>
          <p className="page-description">Update this entry&apos;s title, fields, and body.</p>
        </div>
        <EntryPageActions
          contentTypeKey={props.contentTypeKey}
          contentTypeLabel={contentType.label}
          entry={entry}
          message={message}
          error={error}
          saving={saving}
          onToggleLifecycle={toggleLifecycle}
          onSave={save}
        />
      </div>

      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title/slug
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). The slug field's label is only
          rendered in the `!entry` (create) branch, matching that branch's own `<input>`. */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Entry title</span>
        <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Entry title" />
      </label>
      <EntrySlugField entry={entry} slug={slug} onSlugChange={setSlug} />

      <div className="editor-shell">
        <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
          <div className="grp">
            <WidgetEmbedInsertControl editor={editor} />
          </div>
        </div>
        <div className="editor-body">
          <EditorContent editor={editor as Editor} />
        </div>
      </div>

      <EntryFieldsSection
        fields={contentType.fields}
        entry={entry}
        extFields={extFields}
        onFieldChange={(name, value) => setExtFields((current) => ({ ...current, [name]: value }))}
      />

      {entry ? <TermPicker taxonomies={taxonomies} contentType={props.contentTypeKey} contentId={entry.id} /> : null}
    </div>
  );
}
