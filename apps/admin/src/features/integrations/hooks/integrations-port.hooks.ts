import type { AdminWebhookSubscription } from "../../../lib/api";

/**
 * @file What `useIntegrations` needs from the outside world, as an interface rather than a direct
 * `lib/api` import.
 *
 * Follows the `useX(dependencies)` / `useWiredX()` pair documented on `assistant-chats-port.hooks.ts`
 * (the canonical reference in this workspace) and already applied to `features/redirects` and
 * `features/pages`: this file declares, `integrations-dependencies.hooks.ts` binds the real `api`
 * client, and nothing else under `features/integrations/hooks` imports `lib/api` for these four
 * routes.
 *
 * Scoped to `use-integrations.hooks.ts` only — `use-integration-deliveries.hooks.ts` reads a
 * different sub-resource (one subscription's delivery log, read-only) with no method overlap with
 * this one, so it gets its own `IntegrationDeliveriesPort` rather than being folded in here; see
 * that port's own doc comment.
 */
export interface IntegrationsPort {
  listIntegrationSubscriptions(): Promise<{ subscriptions: AdminWebhookSubscription[] }>;
  createIntegrationSubscription(input: {
    label: string;
    targetUrl: string;
    topics: string[];
  }): Promise<{ subscription: AdminWebhookSubscription }>;
  pauseIntegrationSubscription(target: {
    id: string;
    paused: boolean;
  }): Promise<{ subscription: AdminWebhookSubscription }>;
  deleteIntegrationSubscription(id: string): Promise<{ subscription: AdminWebhookSubscription }>;
}
