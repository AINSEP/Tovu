import type { AdminComment, CommentModerationAction, CommentStatus } from "../../lib/api";
import { hasPermission } from "../../lib/permissions";
import { DataTable, RowMenu, ConfirmDialog, type DataTableColumn } from "@jini-ai/admin/react";

import { commentRowMenuItems, truncate, type RowActionState } from "./rules";
import { formatTimestamp } from "../../lib/format-timestamp";
import { useComments } from "./hooks/use-comments.hooks";
import { useCommentQueue } from "./hooks/use-comment-queue.hooks";
import { useCommentSettings } from "./hooks/use-comment-settings.hooks";

/**
 * @file Comments admin screen (ADR-031, SPEC-033/035 backend; SPEC-036 this frontend) — markup
 * only.
 *
 * State and API calls live in `hooks/use-comments.hooks.ts` (permissions),
 * `hooks/use-comment-queue.hooks.ts` (`QueueSection`), and `hooks/use-comment-settings.hooks.ts`
 * (`SettingsSection`). The row-menu logic, error-message overrides, and the settings patch
 * builder/validator live in `rules.ts`. See `hooks/use-comments.hooks.ts` for why only the
 * exported `Comments` gets the DI-seam prop, not its two private sub-components.
 *
 * Closes the gap the SPEC-036 sweep found: the moderation-queue/moderate/settings backend
 * routes were built and audit-clean but nothing in `apps/admin/` called any of them, so the
 * Comments nav entry fell through to the static `Placeholder`.
 *
 * Two sections in one file (`QueueSection` + `SettingsSection`), combined by the exported
 * `Comments()` — mirrors `Database.tsx`'s established multi-section-single-file shape rather than
 * splitting into `CommentsSettings.tsx` (REQ-08 explicitly leaves that choice to the implementer).
 * `QueueSection`'s status-filter + keyset-cursor "Load more" pattern mirrors `Database.tsx`'s
 * `TimelineSection` (the real cursor-pagination precedent in this admin app — `Redirects.tsx`
 * itself has no pagination today, see REQ-03's implementation note in the handoff).
 *
 * Permission-based affordance hiding (AC-10) mirrors `Settings.tsx`'s `api.me()` ->
 * `effectivePermissions` -> `has(permission)` derivation; this is UX only, the real authz
 * boundary stays server-side (Article VI, `Settings.tsx`'s own header note applies here too).
 */

const STATUS_OPTIONS: readonly CommentStatus[] = ["pending", "approved", "spam", "trash"];

/** The status-filter `<select>` — pure presentation, no state of its own. */
function QueueToolbar({ status, onStatusChange }: { status: CommentStatus; onStatusChange: (s: CommentStatus) => void }) {
  return (
    <div className="toolbar">
      <div className="field">
        <label className="field-label" htmlFor="comments-status-filter">
          Status
        </label>
        <select id="comments-status-filter" value={status} onChange={(e) => onStatusChange(e.target.value as CommentStatus)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** The moderation-queue table's "More" column — a `RowMenu` built from `commentRowMenuItems`, or
 *  an em dash when the operator's permissions leave no items, plus this row's own error (if the
 *  last action against it failed). Top-level rather than an inline `cell` closure so it has its
 *  own directly-testable scope, per `commentRowMenuItems`'s own risk ranking. */
function QueueActionsCell(props: {
  comment: AdminComment;
  permissions: string[];
  status: CommentStatus;
  rowState: RowActionState;
  onModerate: (comment: AdminComment, action: CommentModerationAction) => void;
  onRequestPurge: (comment: AdminComment) => void;
}) {
  const menuItems = commentRowMenuItems(
    props.comment,
    { permissions: props.permissions, currentFilterStatus: props.status },
    { onModerate: props.onModerate, onRequestPurge: props.onRequestPurge },
  );
  return (
    <>
      {menuItems.length > 0 ? (
        <RowMenu triggerLabel={`Actions for the comment by "${props.comment.authorName}"`} items={menuItems} />
      ) : (
        <span className="muted-cell">—</span>
      )}
      {props.rowState.error ? (
        <div className="notice error" role="alert">
          {props.rowState.error}
        </div>
      ) : null}
    </>
  );
}

/** Builds the `DataTable` column descriptors. A plain function rather than a closure declared
 *  inside `QueueTable`'s body — it doesn't need to be a hook-scoped closure, only the values
 *  already threaded through its parameters. */
function queueColumns(props: {
  permissions: string[];
  status: CommentStatus;
  stateFor: (id: string) => RowActionState;
  onModerate: (comment: AdminComment, action: CommentModerationAction) => void;
  onRequestPurge: (comment: AdminComment) => void;
}): DataTableColumn<AdminComment>[] {
  return [
    { key: "author", header: "Author", cell: (comment) => comment.authorName },
    { key: "comment", header: "Comment", cell: (comment) => truncate(comment.bodyText, 120) },
    {
      key: "status",
      header: "Status",
      cell: (comment) => <span className={`status status-${comment.status}`}>{comment.status}</span>,
    },
    { key: "depth", header: "Depth", cell: (comment) => comment.depth },
    { key: "created", header: "Created", cell: (comment) => formatTimestamp(comment.createdAt) },
    {
      key: "actions",
      header: "More",
      cell: (comment) => (
        <QueueActionsCell
          comment={comment}
          permissions={props.permissions}
          status={props.status}
          rowState={props.stateFor(comment.id)}
          onModerate={props.onModerate}
          onRequestPurge={props.onRequestPurge}
        />
      ),
    },
  ];
}

/** The populated-queue view: the table plus its "Load more" pager. Only rendered once
 *  `QueueItemsView` has already ruled out the loading/empty states. */
function QueueTable(props: {
  items: AdminComment[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  permissions: string[];
  status: CommentStatus;
  stateFor: (id: string) => RowActionState;
  onModerate: (comment: AdminComment, action: CommentModerationAction) => void;
  onRequestPurge: (comment: AdminComment) => void;
}) {
  return (
    <>
      <DataTable
        rows={props.items}
        rowKey={(comment) => comment.id}
        columns={queueColumns(props)}
      />
      {props.nextCursor ? (
        <button type="button" className="btn-secondary" onClick={props.loadMore} disabled={props.loadingMore}>
          {props.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </>
  );
}

/** Dispatches between the three queue-body states (loading / empty / populated) as a flat
 *  if-chain instead of a nested ternary — the nesting was the cognitive-complexity cost in the
 *  original inline JSX, not the branch count itself. */
function QueueItemsView(props: {
  items: AdminComment[] | null;
  status: CommentStatus;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  permissions: string[];
  stateFor: (id: string) => RowActionState;
  onModerate: (comment: AdminComment, action: CommentModerationAction) => void;
  onRequestPurge: (comment: AdminComment) => void;
}) {
  if (!props.items) return <div className="notice">Loading comments…</div>;
  if (props.items.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>No {props.status} comments.</p>
        </div>
      </div>
    );
  }
  return <QueueTable {...props} items={props.items} />;
}

/** The Purge confirm dialog. Stays mounted unconditionally (driven by `open`) — see
 *  `useCommentQueue`'s `pendingPurge` doc comment for why. */
function QueuePurgeDialog(props: {
  pendingPurge: AdminComment | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={props.pendingPurge !== null}
      title="Permanently delete this comment?"
      body={
        props.pendingPurge ? (
          <p>
            Permanently delete this comment by &quot;{props.pendingPurge.authorName}&quot;? This cannot be undone.
          </p>
        ) : null
      }
      confirmLabel="Permanently delete"
      destructive
      pending={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}

function QueueSection(props: { permissions: string[] }) {
  const {
    status,
    setStatus,
    items,
    nextCursor,
    error,
    loadingMore,
    loadMore,
    stateFor,
    onModerate,
    pendingPurge,
    setPendingPurge,
    onPurge,
  } = useCommentQueue();

  if (error && !items) return <div className="notice error">{error}</div>;

  return (
    <div>
      <QueueToolbar status={status} onStatusChange={setStatus} />

      {error ? <div className="notice error">{error}</div> : null}

      <QueueItemsView
        items={items}
        status={status}
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        loadMore={loadMore}
        permissions={props.permissions}
        stateFor={stateFor}
        onModerate={(c, action) => void onModerate(c, action)}
        onRequestPurge={setPendingPurge}
      />

      <QueuePurgeDialog
        pendingPurge={pendingPurge}
        busy={pendingPurge !== null && stateFor(pendingPurge.id).busy}
        onConfirm={onPurge}
        onCancel={() => setPendingPurge(null)}
      />
    </div>
  );
}

function SettingsSection(props: { canConfigure: boolean }) {
  const { settings, error, saving, notice, save } = useCommentSettings(props.canConfigure);

  if (!props.canConfigure) return null;

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">Loading Comments settings…</div>;

  return (
    <div>
      <h2>Settings</h2>
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void save(new FormData(e.currentTarget));
        }}
      >
        <div className="field-group">
          <label className="form-checkbox-field">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
            Comments enabled
          </label>
          <label className="form-checkbox-field">
            <input
              type="checkbox"
              name="requireModeration"
              defaultChecked={settings.requireModeration}
            />
            Require moderation (new comments start pending)
          </label>
        </div>

        <div className="field-group">
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="comments-max-depth">
                Max thread depth
              </label>
              <input
                id="comments-max-depth"
                type="number"
                name="maxDepth"
                min={0}
                step={1}
                defaultValue={settings.maxDepth}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-close-after-days">
                Close submissions after (days, blank = never)
              </label>
              <input
                id="comments-close-after-days"
                type="number"
                name="closeAfterDays"
                min={0}
                step={1}
                defaultValue={settings.closeAfterDays ?? ""}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-spam-score">
                Spam auto-reject score (0–1)
              </label>
              <input
                id="comments-spam-score"
                type="number"
                name="spamAutoRejectScore"
                min={0}
                max={1}
                step={0.01}
                defaultValue={settings.spamAutoRejectScore}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-max-per-ip">
                Max submissions per IP per hour
              </label>
              <input
                id="comments-max-per-ip"
                type="number"
                name="maxPerIpPerHour"
                min={1}
                step={1}
                defaultValue={settings.maxPerIpPerHour}
              />
            </div>
          </div>
        </div>

        <div className="editor-actions form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

export interface CommentsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   * nothing and behave exactly as before.
   */
  useCommentsHook?: typeof useComments;
}

export function Comments({ useCommentsHook = useComments }: CommentsProps = {}) {
  const { permissions, error } = useCommentsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!permissions) return <div className="notice">Loading Comments…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">People</p>
          <h1 className="page-title">Comments</h1>
          <p className="page-description">Moderate incoming comments and configure workspace-wide comment behavior.</p>
        </div>
      </div>
      {hasPermission(permissions, "comments.read") ? (
        <QueueSection permissions={permissions} />
      ) : (
        <div className="notice">You do not have permission to view the moderation queue.</div>
      )}
      <SettingsSection canConfigure={hasPermission(permissions, "comments.configure")} />
    </div>
  );
}
