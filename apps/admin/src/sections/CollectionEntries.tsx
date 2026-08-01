import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminContentType, type AdminEntry } from "../lib/api";
import { formatTimestamp } from "../lib/format-timestamp";

/**
 * @file Collections' entries list (design-spec.md §1.4) — the `/admin/collections/{typeKey}` route.
 * Same `.list-table` shape as `FormsList.tsx`/`Posts.tsx`.
 */

export function CollectionEntries(props: { contentTypeKey: string }) {
  const [contentType, setContentType] = useState<AdminContentType | null | undefined>(undefined);
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([api.listContentTypes(), api.listEntries({ type: props.contentTypeKey })])
      .then(([typesResult, entriesResult]) => {
        setContentType(typesResult.items.find((t) => t.key === props.contentTypeKey) ?? null);
        setEntries(entriesResult.items);
      })
      .catch((e) => setError(describeApiError(e, "failed to load entries")));
  }

  useEffect(load, [props.contentTypeKey]);

  if (error && !entries) return <div className="notice error">{error}</div>;
  if (!entries || contentType === undefined) return <div className="notice">Loading entries…</div>;
  // `contentType === null` means the lookup finished and found nothing — a bogus/typo'd
  // `contentTypeKey` (e.g. a stale bookmark). Previously nothing checked this case, so the screen
  // fell through to rendering a real, empty, creatable collection — indistinguishable from a
  // legitimately empty one, "New entry" button included (audit blocker, exec summary #1;
  // `CollectionEntryEditor.tsx:266` one route deeper already gets this right — matching its exact
  // copy here rather than inventing a second wording for the same situation).
  if (contentType === null) {
    return <div className="notice error">Unknown content type "{props.contentTypeKey}".</div>;
  }

  const label = contentType.label;

  return (
    <div>
      <p className="muted-cell">
        <a href="/admin/collections">Collections</a> / {label}
      </p>
      <div className="editor-header">
        <h1>{label}</h1>
        <a href={`/admin/collections/${props.contentTypeKey}/new`}>
          <button>New entry</button>
        </a>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {entries.length === 0 ? (
        <div className="notice">No entries yet in {label}.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <a href={`/admin/collections/${props.contentTypeKey}/${entry.id}`}>{entry.title}</a>
                </td>
                <td>{entry.slug}</td>
                <td>
                  <span className={`status status-${entry.status}`}>{entry.status}</span>
                </td>
                <td>{formatTimestamp(entry.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
