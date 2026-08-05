import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { integrationRowMenuItems } from "./rules";
import { useIntegrations } from "./hooks/use-integrations.hooks";

/**
 * @file The Integrations list screen — markup only.
 *
 * State and API calls live in `hooks/use-integrations.hooks.ts`; the row-menu logic lives in
 * `rules.ts`. What stays here is what actually renders: the create form, column definitions, and
 * the confirm copy.
 */
export interface IntegrationsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state without
   * module mocking or a fake `fetch`.
   */
  useIntegrationsHook?: typeof useIntegrations;
}

export function Integrations({ useIntegrationsHook = useIntegrations }: IntegrationsProps = {}) {
  const {
    subscriptions,
    error,
    formOpen,
    setFormOpen,
    label,
    setLabel,
    targetUrl,
    setTargetUrl,
    topics,
    setTopics,
    saving,
    formError,
    pendingDelete,
    setPendingDelete,
    deleting,
    onCreate,
    onTogglePause,
    onDelete,
  } = useIntegrationsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!subscriptions) return <div className="notice">Loading integrations…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Operations</p>
          <h1 className="page-title">Integrations</h1>
          <p className="page-description">
            Send webhook notifications to external services when content on this site changes.
          </p>
        </div>
        <div className="page-actions">
          <button className={formOpen ? "btn-secondary" : undefined} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? "Cancel" : "Add webhook"}
          </button>
        </div>
      </div>

      {formOpen ? (
        <form onSubmit={onCreate} className="notice integrations-form">
          {formError ? <span className="save-error">{formError}</span> : null}
          <label>
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <label>
            Target URL
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/hooks"
              required
            />
          </label>
          <label>
            Topics (comma-separated, e.g. post.published, post.*)
            <input value={topics} onChange={(e) => setTopics(e.target.value)} required />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create"}
          </button>
        </form>
      ) : null}

      <DataTable
        rows={subscriptions}
        rowKey={(subscription) => subscription.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No webhooks yet.</p>
              <p className="page-description">Add one above to start sending event notifications.</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "label",
            header: "Label",
            cell: (subscription) => <a href={`/admin/integrations/${subscription.id}`}>{subscription.label}</a>,
          },
          { key: "target-url", header: "Target URL", cell: (subscription) => subscription.targetUrl },
          {
            key: "status",
            header: "Status",
            cell: (subscription) => (
              <span className={`status status-sub-${subscription.status}`}>{subscription.status}</span>
            ),
          },
          {
            key: "last-delivery",
            header: "Last delivery",
            cell: (subscription) =>
              subscription.lastDelivery ? (
                <span className={`status status-delivery-${subscription.lastDelivery.status}`}>
                  {subscription.lastDelivery.status}
                </span>
              ) : (
                <span className="muted-cell">never</span>
              ),
          },
          {
            key: "actions",
            headerLabel: "Actions",
            cell: (subscription) =>
              subscription.status === "disabled" ? (
                // `disabled` on both old inline buttons for a `status === "disabled"` row — a
                // built-in-row-style "nothing to do here" case, `RowMenu` has no equivalent
                // per-item `disabled`, so the whole trigger is withheld instead, matching
                // `Roles.tsx`'s built-in-row `—` idiom rather than an unusably empty dropdown.
                <span className="muted-cell">—</span>
              ) : (
                <RowMenu
                  triggerLabel={`Actions for webhook "${subscription.label}"`}
                  items={integrationRowMenuItems(subscription, {
                    onTogglePause,
                    onDelete: setPendingDelete,
                  })}
                />
              ),
          },
        ]}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete webhook?"
        body={
          pendingDelete ? (
            <p>
              Delete webhook &quot;{pendingDelete.label}&quot;? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        pending={deleting}
        onConfirm={onDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
