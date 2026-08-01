import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError, api, type AdminMedia } from "../lib/api";

/**
 * @file Media admin screen (ADR-027 walking skeleton) — list + upload + trash/purge
 * ladder, wiring the `media` backend into the admin UI.
 *
 * Thumbnails render as filenames/titles, not actual images — this pass has no
 * byte-serving HTTP route (see `src/media/media-service.ts`'s file header:
 * origin-isolated serving is explicitly deferred), which the task scope
 * explicitly allows ("thumbnails-as-filenames-is-fine").
 *
 * SPEC-037 REQ-01: `EditMediaRow` adds the previously-unused `api.updateMedia` metadata-edit
 * affordance — a per-row expandable panel (title/alt/caption/credit), sending only the fields
 * the user actually changed (partial-patch, matching `updateMediaMetadata`'s own optional-field
 * contract) rather than the whole draft object.
 */

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Editable metadata fields `api.updateMedia` accepts — kept as its own type so the diffing
 * helper below stays exhaustive if the patch shape ever grows. */
type MediaMetadataPatch = { title?: string; alt?: string; caption?: string; credit?: string };

/** Builds a partial patch containing only the fields whose draft value differs from `item`'s
 * current value — the backend's own contract is optional-field/partial-patch, so this never
 * sends an unchanged field (AC-01's "field left unchanged is not overwritten" proof). */
function diffMediaMetadata(required: {
  item: AdminMedia;
  draft: Required<MediaMetadataPatch>;
}): MediaMetadataPatch {
  const { item, draft } = required;
  const patch: MediaMetadataPatch = {};
  if (draft.title !== item.title) patch.title = draft.title;
  if (draft.alt !== item.alt) patch.alt = draft.alt;
  if (draft.caption !== item.caption) patch.caption = draft.caption;
  if (draft.credit !== item.credit) patch.credit = draft.credit;
  return patch;
}

/** Inline edit panel for one media item's title/alt/caption/credit (REQ-01). Rendered as an
 * extra full-width row beneath the item being edited. */
function EditMediaRow(props: { item: AdminMedia; onSaved: () => void; onCancel: () => void }) {
  const { item } = props;
  const [draft, setDraft] = useState<Required<MediaMetadataPatch>>({
    title: item.title,
    alt: item.alt,
    caption: item.caption,
    credit: item.credit,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Feedback for the sha256 copy affordance below — resets on its own so a stale "Copied" label
   *  never survives past the moment it's true, without needing the caller to clear it. */
  const [hashCopied, setHashCopied] = useState(false);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(item.sha256);
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context) — the full hash is still
      // visible and selectable in the field itself, so a failed copy degrades to "select manually"
      // rather than losing the value.
    }
  }

  async function save() {
    const patch = diffMediaMetadata({ item, draft });
    if (Object.keys(patch).length === 0) {
      props.onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateMedia({ id: item.id }, patch);
      props.onSaved();
    } catch (e) {
      setError(describeApiError(e, "failed to save media metadata"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="media-edit-row">
      <td colSpan={4}>
        {/* Field layout per the OD reference (od-settings-external-mcp-customform.png): uppercase
            letterspaced label above its control (`.field-label`), short fields pairing into a
            row (`.field-row`) instead of every field stacking full-width regardless of length —
            this is the proving ground for that primitive before it rolls out past Media. */}
        <div className="field-group">
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor={`media-edit-title-${item.id}`}>
                Title
              </label>
              <input
                id={`media-edit-title-${item.id}`}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`media-edit-alt-${item.id}`}>
                Alt
              </label>
              <input
                id={`media-edit-alt-${item.id}`}
                value={draft.alt}
                onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor={`media-edit-caption-${item.id}`}>
                Caption
              </label>
              <input
                id={`media-edit-caption-${item.id}`}
                value={draft.caption}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`media-edit-credit-${item.id}`}>
                Credit
              </label>
              <input
                id={`media-edit-credit-${item.id}`}
                value={draft.credit}
                onChange={(e) => setDraft((d) => ({ ...d, credit: e.target.value }))}
              />
            </div>
          </div>
          {/* Integrity/dedupe metadata, demoted out of the main table (MSG-12/13) — genuinely
              useful when chasing a duplicate upload or verifying a file, noise the rest of the
              time, and it was costing real width on the 390px canary target. Read-only: this is
              a content hash, not something an operator edits. Monospace per the OD idiom for
              values that are code/identifiers, not prose. */}
          <div className="field">
            <span className="field-label">sha256</span>
            <div className="field-readonly-row">
              <code className="field-mono field-readonly">{item.sha256}</code>
              <button type="button" className="btn-ghost" onClick={copyHash}>
                {hashCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <span className="editor-actions">
            <button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={props.onCancel} disabled={saving}>
              Cancel
            </button>
          </span>
        </div>
        {error ? (
          <span className="save-error" role="alert">
            {error}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/** Reads a browser `File` into a base64 string (no data: URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function Media() {
  const [media, setMedia] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .listMedia()
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load media"));
  }

  useEffect(load, []);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await api.uploadMedia(
        { filename: file.name, contentType: file.type, dataBase64 },
        { alt: altDraft.trim() || undefined }
      );
      setAltDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function trashOrPurge(item: AdminMedia) {
    setError(null);
    if (item.status === "trashed" && !window.confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      if (item.status === "trashed") {
        await api.deleteMedia(item.id);
      } else {
        await api.trashMedia(item.id);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  if (error && !media) return <div className="notice error">{error}</div>;
  if (!media) return <div className="notice">Loading media…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Content</p>
          <h1 className="page-title">Media</h1>
          <p className="page-description">Upload and manage image assets used across the site.</p>
        </div>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="toolbar">
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
        />
        <input
          value={altDraft}
          onChange={(e) => setAltDraft(e.target.value)}
          placeholder="Alt text (optional)"
        />
        <button onClick={upload} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {media.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No media uploaded yet.</p>
            <p className="page-description">Choose a file above and upload it to get started.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Alt</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {media.map((item) => (
                <Fragment key={item.id}>
                  <tr>
                    <td>{item.title}</td>
                    <td>{item.alt || "—"}</td>
                    <td>
                      <span className={`status status-${item.status}`}>{item.status}</span>
                    </td>
                    <td>
                      <span className="editor-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        >
                          {editingId === item.id ? "Close" : "Edit"}
                        </button>
                        <button type="button" className="btn-danger" onClick={() => trashOrPurge(item)}>
                          {item.status === "trashed" ? "Delete permanently" : "Trash"}
                        </button>
                      </span>
                    </td>
                  </tr>
                  {editingId === item.id ? (
                    <EditMediaRow
                      item={item}
                      onSaved={() => {
                        setEditingId(null);
                        load();
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
