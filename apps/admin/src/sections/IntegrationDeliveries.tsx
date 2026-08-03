import { useEffect, useState } from "react";
import { api, type AdminWebhookDelivery } from "../lib/api";
import { formatTimestamp } from "../lib/format-timestamp";
import { DataTable } from "@jini-ai/admin/react";

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
      <DataTable
        rows={deliveries}
        rowKey={(delivery) => delivery.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>No deliveries yet for this subscription.</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "status",
            header: "Status",
            cell: (delivery) => (
              <span className={`status status-delivery-${delivery.status}`}>{delivery.status}</span>
            ),
          },
          { key: "attempts", header: "Attempts", cell: (delivery) => delivery.attempts },
          {
            key: "last-response",
            header: "Last response",
            cell: (delivery) => (
              <>
                {delivery.lastResponseStatus ?? "—"}
                {delivery.lastError ? <div className="save-error">{delivery.lastError}</div> : null}
              </>
            ),
          },
          { key: "timestamp", header: "Timestamp", cell: (delivery) => displayTimestamp(delivery) },
        ]}
      />
    </div>
  );
}
