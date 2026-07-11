import { useEffect, useState } from "react";
import { api, type AdminWebhookDelivery } from "../lib/api";

/** Best available timestamp for the log's "Timestamp" column: delivered time, else created time. */
function displayTimestamp(delivery: AdminWebhookDelivery): string {
  return (delivery.deliveredAt ?? delivery.createdAt).slice(0, 16).replace("T", " ");
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
    <div>
      <div className="editor-header">
        <a href="#/integrations">← Integrations</a>
      </div>
      <h1>Delivery log</h1>
      {deliveries.length === 0 ? (
        <div className="notice">No deliveries yet for this subscription.</div>
      ) : (
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
      )}
    </div>
  );
}
