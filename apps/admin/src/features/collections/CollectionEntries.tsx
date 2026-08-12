import { formatTimestamp } from "../../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";
import { useWiredCollectionEntries } from "./hooks/use-collection-entries.hooks";

/**
 * @file Collections' entries list (design-spec.md §1.4) — the `/admin/collections/{typeKey}` route.
 * Same `.list-table` shape as `FormsList.tsx`/`Posts.tsx`.
 *
 * Every piece of state and every API call lives in `hooks/use-collection-entries.hooks.ts`; see
 * that file's header for why. What stays here is presentation only.
 */

export function CollectionEntries(props: { contentTypeKey: string }) {
  const { contentType, entries, error, t } = useWiredCollectionEntries({ contentTypeKey: props.contentTypeKey });

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
    <div className="page">
      <p className="muted-cell">
        <a href="/admin/collections">{t("Collections")}</a> / {label}
      </p>
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Content")}</p>
          <h1 className="page-title">{label}</h1>
          <p className="page-description">
            {t('All "{label}" entries in this collection.').replace("{label}", label)}
          </p>
        </div>
        <div className="page-actions">
          {/* Anchor-wrapping-a-button, unchanged — real navigation to the editor route, not a
              handler. `.btn-*` on a bare `<a>` is broken today (fix in flight elsewhere), so this
              stays exactly as it was rather than depending on that fix landing first. */}
          <a href={`/admin/collections/${props.contentTypeKey}/new`}>
            <button>{t("New entry")}</button>
          </a>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <DataTable
        rows={entries}
        rowKey={(entry) => entry.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No entries yet in {label}.").replace("{label}", label)}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "title",
            header: t("Title"),
            cell: (entry) => (
              <a href={`/admin/collections/${props.contentTypeKey}/${entry.id}`}>{entry.title}</a>
            ),
          },
          { key: "slug", header: "Slug", cell: (entry) => entry.slug },
          {
            key: "status",
            header: t("Status"),
            cell: (entry) => <span className={`status status-${entry.status}`}>{entry.status}</span>,
          },
          { key: "updated", header: t("Updated"), cell: (entry) => formatTimestamp(entry.updatedAt) },
        ]}
      />
    </div>
  );
}
