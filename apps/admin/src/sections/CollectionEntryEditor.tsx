import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ApiError,
  api,
  describeApiError,
  type AdminContentType,
  type AdminEntry,
  type AdminTaxonomyWithTerms,
  type ContentTypeFieldDef,
} from "../lib/api";
import { WidgetEmbed, WidgetEmbedInsertControl } from "../lib/widget-embed-extension";
import { navigate } from "../lib/router";

/**
 * @file Collections' entry editor (design-spec.md §1.5/§1.6) — the
 * `/admin/collections/{typeKey}/{entryId|new}` route.
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

/** One control per `ContentTypeFieldDef.kind` (design-spec.md §1.5). */
function DynamicField(props: {
  field: ContentTypeFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { field, value, onChange } = props;
  const inputId = `entry-field-${field.name}`;

  return (
    <div className="collections-dynamic-field">
      <label htmlFor={inputId}>
        {field.name}
        {field.required ? " *" : ""}
      </label>
      {field.kind === "text" ? (
        <input id={inputId} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "integer" ? (
        <input
          id={inputId}
          type="number"
          step="1"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      ) : field.kind === "real" ? (
        <input
          id={inputId}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      ) : field.kind === "boolean" ? (
        <input id={inputId} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <input
          id={inputId}
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/** Assign-only term picker (design-spec.md §1.6). Not pre-populated from existing assignments —
 * no "terms assigned to this entry" read route exists yet (only the write-only `assignTerms`
 * route). `assignTerms` itself is additive (upserts, never clears an unselected assignment), so
 * this control is deliberately framed as "assign", not "set", to avoid implying it can unassign. */
function TermPicker(props: { taxonomies: AdminTaxonomyWithTerms[]; contentType: string; contentId: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(termId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  async function assign() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.assignTerms({ contentType: props.contentType, contentId: props.contentId, termIds: [...selected] });
      setMessage(`Assigned ${selected.size} term(s).`);
      setSelected(new Set());
    } catch (e) {
      setError(describeApiError(e, "Failed to assign terms"));
    } finally {
      setSaving(false);
    }
  }

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

export function CollectionEntryEditor(props: { contentTypeKey: string; entryId: string | null }) {
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entry, setEntry] = useState<AdminEntry | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [extFields, setExtFields] = useState<Record<string, unknown>>({});
  const [taxonomies, setTaxonomies] = useState<AdminTaxonomyWithTerms[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({ extensions: [StarterKit, WidgetEmbed], content: "" });

  useEffect(() => {
    setLoadError(null);
    setLoaded(false);
    setContentType(undefined);
    setEntry(null);

    Promise.all([
      api.listContentTypes(),
      props.entryId ? api.listEntries({ type: props.contentTypeKey }) : Promise.resolve({ items: [] as AdminEntry[] }),
      api.listTaxonomies().catch(() => ({ items: [] as AdminTaxonomyWithTerms[] })),
    ])
      .then(([typesResult, entriesResult, taxonomyResult]) => {
        const ct = typesResult.items.find((t) => t.key === props.contentTypeKey) ?? null;
        setContentType(ct);
        setTaxonomies(taxonomyResult.items);

        if (props.entryId) {
          const found = entriesResult.items.find((e) => e.id === props.entryId) ?? null;
          setEntry(found);
          if (found) {
            setTitle(found.title);
            setSlug(found.slug);
            setExtFields(
              ((): Record<string, unknown> => {
                const site = (found.fieldsJson as { ext?: { site?: Record<string, unknown> } } | null)?.ext?.site;
                return site ? { ...site } : {};
              })()
            );
            editor?.commands.setContent((found.bodyJson ?? "") as never);
          }
        } else {
          setTitle("");
          setSlug("");
          setExtFields({});
          editor?.commands.setContent("");
        }
      })
      .catch((e) => setLoadError(describeApiError(e, "failed to load entry")))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.contentTypeKey, props.entryId, editor === null]);

  async function save() {
    if (!contentType || !editor) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const fieldsJson = { ext: { site: extFields } };
      if (entry) {
        const { entry: saved } = await api.updateEntry(
          { id: entry.id, expectedVersion: entry.version },
          // `bodyJson` was omitted here while the create branch below sent it,
          // so editing an existing entry's rich text reported "Saved · version N"
          // and left the stored body untouched. Silent data loss on the primary
          // content surface; `PostEditor` has always done this correctly.
          { title, fieldsJson, bodyJson: editor.getJSON() }
        );
        setEntry(saved);
        setMessage(`Saved · version ${saved.version}`);
      } else {
        const { entry: created } = await api.createEntry(
          { type: props.contentTypeKey, slug: slug.trim(), title },
          { fieldsJson, bodyJson: editor.getJSON() }
        );
        setEntry(created);
        setMessage(`Created · version ${created.version}`);
        navigate(`/collections/${props.contentTypeKey}/${created.id}`);
      }
    } catch (e) {
      setError(describeApiError(e, "save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleLifecycle(op: "publish" | "unpublish") {
    if (!entry) return;
    setError(null);
    try {
      const { entry: saved } = await api.entryLifecycle({ id: entry.id, op, expectedVersion: entry.version });
      setEntry(saved);
      setMessage(`Entry ${op}ed · version ${saved.version}`);
    } catch (e) {
      setError(describeApiError(e, `Failed to ${op} entry`));
    }
  }

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
        <div className="page-actions">
          <a href={`/admin/collections/${props.contentTypeKey}`}>
            <button type="button" className="btn-secondary">
              ← {contentType.label}
            </button>
          </a>
          {message ? <span className="save-ok">{message}</span> : null}
          {error ? <span className="save-error">{error}</span> : null}
          {entry ? <span className={`status status-${entry.status}`}>{entry.status}</span> : null}
          {entry && entry.status !== "published" ? (
            <button type="button" onClick={() => toggleLifecycle("publish")}>
              Publish
            </button>
          ) : null}
          {/* Reversible-but-access-affecting (drops the entry off the site; still editable here,
              still re-publishable) — `.btn-warning`, matching `Posts.tsx`/`Pages.tsx` RowMenu's
              own Disable, not `.btn-danger`, which stays reserved for the genuinely destructive
              trash action. */}
          {entry && entry.status === "published" ? (
            <button type="button" className="btn-warning" onClick={() => toggleLifecycle("unpublish")}>
              Unpublish
            </button>
          ) : null}
          {/* Secondary while Publish is also showing (draft entries) so the two don't compete for
              primary weight — mirrors `PostEditor.tsx`'s identical Save/Publish pairing exactly.
              Once published, Publish is gone and Save is this screen's one remaining primary
              action, so it goes back to bare/primary. */}
          <button
            type="button"
            className={entry && entry.status !== "published" ? "btn-secondary" : undefined}
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Audit finding: placeholder-only, no `<label>` — same fix as `PostEditor.tsx`'s title/slug
          (see `styles/editor.css`'s `.a11y-label-wrap` comment). The slug field's label is only
          rendered in the `!entry` (create) branch, matching that branch's own `<input>`. */}
      <label className="a11y-label-wrap">
        <span className="visually-hidden">Entry title</span>
        <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Entry title" />
      </label>
      <div className="editor-slug">
        /{" "}
        {entry ? (
          <span>{entry.slug}</span>
        ) : (
          <label className="a11y-label-wrap">
            <span className="visually-hidden">Entry slug</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="entry-slug" />
          </label>
        )}
      </div>

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

      {contentType.fields.length > 0 ? (
        <div className="collections-dynamic-fields">
          <h3>Fields</h3>
          {contentType.fields.map((field) => (
            <DynamicField
              key={field.name}
              field={field}
              value={extFields[field.name] ?? readExtSiteField(entry?.fieldsJson, field.name)}
              onChange={(value) => setExtFields((current) => ({ ...current, [field.name]: value }))}
            />
          ))}
        </div>
      ) : null}

      {entry ? <TermPicker taxonomies={taxonomies} contentType={props.contentTypeKey} contentId={entry.id} /> : null}
    </div>
  );
}
