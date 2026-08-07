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

/** The "Add webhook" form — only rendered while `formOpen`. Top-level rather than an inline
 *  ternary block in `Integrations`'s own body. */
function IntegrationCreateForm(props: {
  onSubmit: (e: React.FormEvent) => void;
  formError: string | null;
  label: string;
  onLabelChange: (label: string) => void;
  targetUrl: string;
  onTargetUrlChange: (targetUrl: string) => void;
  topics: string;
  onTopicsChange: (topics: string) => void;
  saving: boolean;
}) {
  return (
    <form onSubmit={props.onSubmit} className="notice integrations-form">
      {props.formError ? <span className="save-error">{props.formError}</span> : null}
      <label>
        Label
        <input value={props.label} onChange={(e) => props.onLabelChange(e.target.value)} required />
      </label>
      <label>
        Target URL
        <input
          value={props.targetUrl}
          onChange={(e) => props.onTargetUrlChange(e.target.value)}
          placeholder="https://example.com/hooks"
          required
        />
      </label>
      <label>
        Topics (comma-separated, e.g. post.published, post.*)
        <input value={props.topics} onChange={(e) => props.onTopicsChange(e.target.value)} required />
      </label>
      <button type="submit" disabled={props.saving}>
        {props.saving ? "Saving…" : "Create"}
      </button>
    </form>
  );
}

/** The delete-webhook confirm dialog. Stays mounted unconditionally (driven by `open`), matching
 *  the `ConfirmDialog` convention `Comments.tsx`'s `QueuePurgeDialog` also follows. */
function IntegrationDeleteDialog(props: {
  pendingDelete: { label: string } | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={props.pendingDelete !== null}
      title="Delete webhook?"
      body={props.pendingDelete ? <p>Delete webhook &quot;{props.pendingDelete.label}&quot;? This cannot be undone.</p> : null}
      confirmLabel="Delete"
      destructive
      pending={props.deleting}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
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
        <IntegrationCreateForm
          onSubmit={onCreate}
          formError={formError}
          label={label}
          onLabelChange={setLabel}
          targetUrl={targetUrl}
          onTargetUrlChange={setTargetUrl}
          topics={topics}
          onTopicsChange={setTopics}
          saving={saving}
        />
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
      <IntegrationDeleteDialog
        pendingDelete={pendingDelete}
        deleting={deleting}
        onConfirm={onDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
