import { IntegrationDeliveries as JiniIntegrationDeliveries, type IntegrationDeliveriesProps } from "@jini-ai/integrations/react/webhooks/IntegrationDeliveries";
import { routinesKit } from "@/integrations/jini-kits";
import { ServerLabel } from "@/components/status-labels";
import { VIEWER_TIME_ZONE } from "@jini-ai/admin/shell/lib/viewer-time-zone";
import { useWiredIntegrationDeliveries } from "./hooks/integration-deliveries-dependencies.hooks";

export function IntegrationDeliveries({ useIntegrationDeliveriesHook = useWiredIntegrationDeliveries, ...props }: Pick<IntegrationDeliveriesProps, "subscriptionId"> & Partial<Pick<IntegrationDeliveriesProps, "useIntegrationDeliveriesHook">>) {
  return <JiniIntegrationDeliveries {...props} useIntegrationDeliveriesHook={useIntegrationDeliveriesHook} kit={routinesKit} ServerLabel={ServerLabel} viewerTimeZone={VIEWER_TIME_ZONE} />;
}
