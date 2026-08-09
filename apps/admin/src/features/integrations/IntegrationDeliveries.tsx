import { DataTable } from "@jini-ai/admin/react";

import { displayTimestamp } from "./rules";
import { useIntegrationDeliveries } from "./hooks/use-integration-deliveries.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t } from "./integrations-i18n";

/**
 * @file The webhook delivery-log screen — markup only.
 *
 * State and API calls live in `hooks/use-integration-deliveries.hooks.ts`; the timestamp
 * derivation lives in `rules.ts`. What stays here is what actually renders: column definitions
 * and the empty state.
 */
export interface IntegrationDeliveriesProps {
  subscriptionId: string;
  /**
   * Dependency injection seam for tests — see `Integrations.tsx`'s `useIntegrationsHook` for the
   * house convention this follows.
   */
  useIntegrationDeliveriesHook?: typeof useIntegrationDeliveries;
}

export function IntegrationDeliveries({
  subscriptionId,
  useIntegrationDeliveriesHook = useIntegrationDeliveries,
}: IntegrationDeliveriesProps) {
  const locale = useAdminLocale();
  const { deliveries, error } = useIntegrationDeliveriesHook(subscriptionId);

  if (error) return <div className="notice error">{error}</div>;
  if (!deliveries) return <div className="notice">{t(locale, "Loading delivery log…")}</div>;

  return (
    <div className="page">
      <a href="/admin/integrations">{t(locale, "← Integrations")}</a>
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t(locale, "Operations")}</p>
          <h1 className="page-title">{t(locale, "Delivery log")}</h1>
          <p className="page-description">{t(locale, "Every delivery attempt logged for this webhook subscription.")}</p>
        </div>
      </div>
      <DataTable
        rows={deliveries}
        rowKey={(delivery) => delivery.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t(locale, "No deliveries yet for this subscription.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "status",
            header: t(locale, "Status"),
            cell: (delivery) => (
              <span className={`status status-delivery-${delivery.status}`}>{delivery.status}</span>
            ),
          },
          { key: "attempts", header: t(locale, "Attempts"), cell: (delivery) => delivery.attempts },
          {
            key: "last-response",
            header: t(locale, "Last response"),
            cell: (delivery) => (
              <>
                {delivery.lastResponseStatus ?? "—"}
                {delivery.lastError ? <div className="save-error">{delivery.lastError}</div> : null}
              </>
            ),
          },
          { key: "timestamp", header: t(locale, "Timestamp"), cell: (delivery) => displayTimestamp(delivery) },
        ]}
      />
    </div>
  );
}
