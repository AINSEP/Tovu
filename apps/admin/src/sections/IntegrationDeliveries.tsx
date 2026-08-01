import { useEffect, useState } from "react";
import { api, type AdminWebhookDelivery } from "../lib/api";
import { formatTimestamp } from "../lib/format-timestamp";

/** Best available timestamp for the log's "Timestamp" column: delivered time, else created time. */
function displayTimestamp(delivery: AdminWebhookDelivery): string {
  return formatTimestamp(delivery.deliveredAt ?? delivery.createdAt);
}

export function IntegrationDeliveries(props: { subscriptionId: string }) {
  const [deliveries, setDeliveries] = useState<AdminWebhookDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeliveries(null);
    setError(null);
    api
      .listIntegrationDeliveries(props.subscriptionId)
      .then((r) => setDeliveries(r.deliveries))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load deliveries"));
  }, [props.subscriptionId]);

  if (error) return <div className="notice error">{error}</div>;
  if (!deliveries) return <div className="notice">Loading delivery log…</div>;

  return (
    <div className="page">
      <a href="/admin/integrations">← Integrations</a>
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Design & System</p>
          <h1 className="page-title">Delivery log</h1>
          <p className="page-description">Every delivery attempt logged for this webhook subscription.</p>
        </div>
      </div>
      {deliveries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No deliveries yet for this subscription.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="list-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Attempts</th>
              <th>Last response</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td>
                  <span className={`status status-delivery-${delivery.status}`}>{delivery.status}</span>
                </td>
                <td>{delivery.attempts}</td>
                <td>
                  {delivery.lastResponseStatus ?? "—"}
                  {delivery.lastError ? <div className="save-error">{delivery.lastError}</div> : null}
                </td>
                <td>{displayTimestamp(delivery)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
