import { useEffect, useState } from "react";
import { api, type AdminWebhookSubscription } from "../lib/api";

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

  async function onDelete(subscription: AdminWebhookSubscription) {
    if (!window.confirm(`Delete webhook "${subscription.label}"? This cannot be undone.`)) return;
    try {
      await api.deleteIntegrationSubscription(subscription.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete subscription");
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!subscriptions) return <div className="notice">Loading integrations…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Integrations</h1>
        <div className="editor-actions">
          <button onClick={() => setFormOpen((v) => !v)}>{formOpen ? "Cancel" : "Add webhook"}</button>
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
                <a href={`#/integrations/${subscription.id}`}>{subscription.label}</a>
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
                <button
                  onClick={() => onTogglePause(subscription)}
                  disabled={subscription.status === "disabled"}
                >
                  {subscription.status === "paused" ? "Resume" : "Pause"}
                </button>{" "}
                <button
                  onClick={() => onDelete(subscription)}
                  disabled={subscription.status === "disabled"}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
