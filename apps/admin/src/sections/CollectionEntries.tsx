import { useEffect, useState } from "react";
import { ApiError, api, type AdminContentType, type AdminEntry } from "../lib/api";

/**
 * @file Collections' entries list (design-spec.md §1.4) — the `#/collections/{typeKey}` route.
 * Same `.list-table` shape as `FormsList.tsx`/`Posts.tsx`.
 */

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

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

  const label = contentType?.label ?? props.contentTypeKey;

  return (
    <div>
      <p className="muted-cell">
        <a href="#/section/collections">Collections</a> / {label}
      </p>
      <div className="editor-header">
        <h1>{label}</h1>
        <a href={`#/collections/${props.contentTypeKey}/new`}>
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
                  <a href={`#/collections/${props.contentTypeKey}/${entry.id}`}>{entry.title}</a>
                </td>
                <td>{entry.slug}</td>
                <td>
                  <span className={`status status-${entry.status}`}>{entry.status}</span>
                </td>
                <td>{entry.updatedAt.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
