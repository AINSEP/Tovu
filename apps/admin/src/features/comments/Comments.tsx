import type { CommentStatus } from "../../lib/api";
import { hasPermission } from "../../lib/permissions";
import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { commentRowMenuItems, truncate } from "./rules";
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
      <div className="toolbar">
        <div className="field">
          <label className="field-label" htmlFor="comments-status-filter">
            Status
          </label>
          <select
            id="comments-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as CommentStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!items ? (
        <div className="notice">Loading comments…</div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No {status} comments.</p>
          </div>
        </div>
      ) : (
        <>
          <DataTable
            rows={items}
            rowKey={(comment) => comment.id}
            columns={[
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
                cell: (comment) => {
                  const rs = stateFor(comment.id);
                  const menuItems = commentRowMenuItems(
                    comment,
                    { permissions: props.permissions, currentFilterStatus: status },
                    {
                      onModerate: (c, action) => void onModerate(c, action),
                      onRequestPurge: setPendingPurge,
                    },
                  );
                  return (
                    <>
                      {menuItems.length > 0 ? (
                        <RowMenu
                          triggerLabel={`Actions for the comment by "${comment.authorName}"`}
                          items={menuItems}
                        />
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                      {rs.error ? (
                        <div className="notice error" role="alert">
                          {rs.error}
                        </div>
                      ) : null}
                    </>
                  );
                },
              },
            ]}
          />
          {nextCursor ? (
            <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={pendingPurge !== null}
        title="Permanently delete this comment?"
        body={
          pendingPurge ? (
            <p>
              Permanently delete this comment by &quot;{pendingPurge.authorName}&quot;? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Permanently delete"
        destructive
        pending={pendingPurge !== null && stateFor(pendingPurge.id).busy}
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
