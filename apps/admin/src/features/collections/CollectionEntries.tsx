
import { DataTable } from "@jini-ai/admin/react";
import { agentHandle, buildAgentListHandles } from "@jini-ai/core/agent-handles";
import { useWiredCollectionEntries } from "./hooks/use-collection-entries.hooks";
import { ServerLabel } from "@/components/status-labels";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";

import { formatTimestamp } from '@jini-ai/core/text';
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
/**
 * @file Collections' entries list (design-spec.md §1.4) — the `/admin/collections/{typeKey}` route.
 * Same `.list-table` shape as `FormsList.tsx`/`Posts.tsx`.
 *
 * Every piece of state and every API call lives in `hooks/use-collection-entries.hooks.ts`; see
 * that file's header for why. What stays here is presentation only.
 */

export interface CollectionEntriesProps {
  contentTypeKey: string;
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  only `contentTypeKey` and behave exactly as before. */
  useCollectionEntriesHook?: typeof useWiredCollectionEntries;
}

export function CollectionEntries({ contentTypeKey, useCollectionEntriesHook = useWiredCollectionEntries }: CollectionEntriesProps) {
  const { contentType, entries, error, t } = useCollectionEntriesHook({ contentTypeKey });

  if (error && !entries) return <div className="notice error">{error}</div>;
  if (!entries || contentType === undefined) return <div className="notice">{t({ key: "Loading entries…" })}</div>;
  // `contentType === null` means the lookup finished and found nothing — a bogus/typo'd
  // `contentTypeKey` (e.g. a stale bookmark). Previously nothing checked this case, so the screen
  // fell through to rendering a real, empty, creatable collection — indistinguishable from a
  // legitimately empty one, "New entry" button included (audit blocker, exec summary #1;
  // `CollectionEntryEditor.tsx:266` one route deeper already gets this right — matching its exact
  // copy here rather than inventing a second wording for the same situation).
  if (contentType === null) {
    return <div className="notice error">{t({ key: 'Unknown content type "{contentTypeKey}".' }).replace("{contentTypeKey}", () => contentTypeKey)}</div>;
  }

  const label = contentType.label;
  // Entry ids are stable and unique (the server's own primary key for this resource), so agent
  // handles below key off `entry.id`, not the (readable-slugs S6b) slug the row's own edit link
  // now uses — same reasoning as every other list on this workstream. This screen has no `RowMenu`
  // (no per-row actions beyond opening the editor), so unlike `Collections.tsx`/`FormsList.tsx`
  // there is no dropdown-action gap to note here.
  const rowHandles = buildAgentListHandles({ prefix: "collection-entries-row", ids: entries.map((entry) => entry.id) }
  );

  return (
    <div className="page">
      <p className="muted-cell">
        <a href="/admin/collections" {...agentHandle({ handle: "collection-entries-breadcrumb" }, { role: "link", label: "Back to the Collections list" })}>
          {t({ key: "Collections" })}
        </a>{" "}
        / {label}
      </p>
      {renderCollectionEntriesHeader({ t, label, contentTypeKey })}

      {error ? <div className="notice error">{error}</div> : null}

      {renderCollectionEntriesTable({ entries, t, label, contentTypeKey, rowHandles })}
    </div>
  );
}

function renderCollectionEntriesTable(
  { entries, t, label, contentTypeKey, rowHandles }:
    Pick<ReturnType<NonNullable<CollectionEntriesProps["useCollectionEntriesHook"]>>, "t"> &
    Pick<NonNullable<ReturnType<NonNullable<CollectionEntriesProps["useCollectionEntriesHook"]>>["contentType"]>, "label"> &
    Pick<CollectionEntriesProps, "contentTypeKey"> &
    { entries: NonNullable<ReturnType<typeof useWiredCollectionEntries>["entries"]>; rowHandles: ReturnType<typeof buildAgentListHandles> }
) {
  return (
    <DataTable
      rows={entries}
      rowKey={(entry) => entry.id}
      empty={
        <div className="card">
          <div className="empty-state">
            <p>{t({ key: "No entries yet in {label}." }).replace("{label}", () => label)}</p>
          </div>
        </div>
      }
      columns={[
        {
          key: "title",
          header: t({ key: "Title" }),
          cell: (entry, index) => (
            <a
              href={`/admin/collections/${contentTypeKey}/${entry.slug}`}
              {...agentHandle({ handle: `${rowHandles[index]}-edit` }, { role: "link", label: "Open this entry's editor" })}
            >
              {entry.title}
            </a>
          ),
        },
        { key: "slug", header: "Slug", cell: (entry) => entry.slug },
        {
          key: "status",
          header: t({ key: "Status" }),
          cell: (entry) => <span className={`status status-${entry.status}`}><ServerLabel value={entry.status} /></span>,
        },
        { key: "updated", header: t({ key: "Updated" }), cell: (entry) => formatTimestamp({ iso: entry.updatedAt }, { viewerTimeZone: VIEWER_TIME_ZONE }) },
      ]}
    />
  );
}

function renderCollectionEntriesHeader(
  { t, label, contentTypeKey }:
    Pick<ReturnType<NonNullable<CollectionEntriesProps["useCollectionEntriesHook"]>>, "t"> &
    Pick<NonNullable<ReturnType<NonNullable<CollectionEntriesProps["useCollectionEntriesHook"]>>["contentType"]>, "label"> &
    Pick<CollectionEntriesProps, "contentTypeKey">
) {
  return (
    <div
      className="page-header"
      {...agentHandle({ handle: "collection-entries-header" }, {
        role: "region",
        label: "Entries list header — this content type's name and the New entry button",
      })}
    >
      <div className="page-header-text">
        <p className="page-kicker">{t({ key: "Content" })}</p>
        <h1 className="page-title">{label}</h1>
        <p className="page-description">
          {t({ key: 'All "{label}" entries in this collection.' }).replace("{label}", () => label)}
        </p>
      </div>
      <div className="page-actions">
        <PublishSectionButton section="collections" />
        {/* Real navigation to the editor route, not a handler — a plain `<a>`, not a `<button>`
            nested inside one (invalid HTML with undefined activation behaviour: a `<button>` has
            no `href` of its own, so which element the browser actually activates on click/Enter/
            Space is unspecified). `.btn-primary` styles the anchor directly — the same
            `a.btn-*` mechanism `styles.css` has shipped since 2026-08-01 (`a.btn-secondary` etc.,
            verified live against Dashboard's "View site ↗" anchor) and already handles this
            exact case; the "fix in flight elsewhere" this comment used to cite never existed. */}
        <a
          className="btn-primary"
          href={`/admin/collections/${contentTypeKey}/new`}
          {...agentHandle({ handle: "collection-entries-new" }, { role: "link", label: "Create a new entry in this content type" })}
        >
          {t({ key: "New entry" })}
        </a>
      </div>
    </div>
  );
}
