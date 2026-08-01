import { useEffect, useState } from "react";
import { api, type AdminWebhookSubscription } from "../lib/api";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";

/** Parses the comma-separated topics field into a trimmed, blank-free list. */
function parseTopics(raw: string): string[] {
  return raw
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

export function Integrations() {
  const [subscriptions, setSubscriptions] = useState<AdminWebhookSubscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [topics, setTopics] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The subscription a `RowMenu` "Delete" selection is asking to confirm — `null` when the dialog
  // is closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on
  // why); this is what drives its `open` prop.
  const [pendingDelete, setPendingDelete] = useState<AdminWebhookSubscription | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload(): Promise<void> {
    return api.listIntegrationSubscriptions()
      .then((r) => setSubscriptions(r.subscriptions))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load integrations"));
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.createIntegrationSubscription({ label, targetUrl, topics: parseTopics(topics) });
      setLabel("");
      setTargetUrl("");
      setTopics("");
      setFormOpen(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "failed to create subscription");
    } finally {
      setSaving(false);
    }
  }

  async function onTogglePause(subscription: AdminWebhookSubscription) {
    try {
      await api.pauseIntegrationSubscription({ id: subscription.id, paused: subscription.status !== "paused" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update subscription");
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Delete" item
   *  (`setPendingDelete` below), rather than `window.confirm` — see `Roles.tsx`'s `onDeleteRole`
   *  comment for why a `RowMenu` item needs `ConfirmDialog`, not a blocking browser prompt, to hold
   *  the confirm step. Copy is the exact previous sentence, unchanged. */
  async function onDelete() {
    if (!pendingDelete) return;
    const subscription = pendingDelete;
    setDeleting(true);
    try {
      await api.deleteIntegrationSubscription(subscription.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete subscription");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!subscriptions) return <div className="notice">Loading integrations…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Design & System</p>
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

      {subscriptions.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No webhooks yet.</p>
            <p className="page-description">Add one above to start sending event notifications.</p>
          </div>
        </div>
      ) : (
      <div className="table-scroll">
      <table className="list-table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Target URL</th>
            <th>Status</th>
            <th>Last delivery</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((subscription) => (
            <tr key={subscription.id}>
              <td>
                <a href={`/admin/integrations/${subscription.id}`}>{subscription.label}</a>
              </td>
              <td>{subscription.targetUrl}</td>
              <td>
                <span className={`status status-sub-${subscription.status}`}>{subscription.status}</span>
              </td>
              <td>
                {subscription.lastDelivery ? (
                  <span className={`status status-delivery-${subscription.lastDelivery.status}`}>
                    {subscription.lastDelivery.status}
                  </span>
                ) : (
                  <span className="muted-cell">never</span>
                )}
              </td>
              <td>
                {subscription.status === "disabled" ? (
                  // `disabled` on both old inline buttons for a `status === "disabled"` row — a
                  // built-in-row-style "nothing to do here" case, `RowMenu` has no equivalent
                  // per-item `disabled`, so the whole trigger is withheld instead, matching
                  // `Roles.tsx`'s built-in-row `—` idiom rather than an unusably empty dropdown.
                  <span className="muted-cell">—</span>
                ) : (
                  <RowMenu
                    triggerLabel={`Actions for webhook "${subscription.label}"`}
                    items={[
                      {
                        key: "pause",
                        label: subscription.status === "paused" ? "Resume" : "Pause",
                        onSelect: () => onTogglePause(subscription),
                      },
                      { key: "delete", label: "Delete", destructive: true, onSelect: () => setPendingDelete(subscription) },
                    ]}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      )}
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
