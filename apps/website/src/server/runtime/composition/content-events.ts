import type { EventBusPort } from "@jini-ai/cms/core";
import type { Tracker } from "@jini-ai/diagnostics/observability";

/** Subscribe once per site's bus at boot. Domain IDs let the provider dedupe outbox redelivery.
 * Creates/saves originate inside revision transactions; publishes reuse entry.published, including go-live.
 * @complexity O(1) setup and per event; no content reads or unbounded local dedupe state. */
export async function registerContentAnalytics(
  { deps }: { deps: { bus: EventBusPort; tracker: Tracker; workspaceId: string } },
  _optional: Record<string, never> = {},
): Promise<void> {
  for (const topic of ["content.created", "content.saved", "entry.published"]) {
    await deps.bus.subscribe<{ contentType?: string; entryId?: string; actorId?: string; source?: string; initialStatus?: string }>({
      eventName: topic,
      handler: async event => {
        if (event.workspaceId !== deps.workspaceId) return;
        const payload = event.payload;
        if (payload.contentType !== "post" && payload.contentType !== "page") return;
        const resourceId = payload.entryId ?? event.aggregateId;
        if (!resourceId) return;
        const kind = payload.contentType;
        const name = topic === "content.created" ? `${kind}_created` : topic === "content.saved" ? "content_saved" : `${kind}_published`;
        deps.tracker.capture({ name, userId: payload.actorId ?? `system:${deps.workspaceId}`, properties: {
          eventId: event.id, resourceKind: kind, resourceId,
          source: payload.source === "admin" || payload.source === "assistant" ? payload.source : "service",
          ...(payload.initialStatus ? { initialStatus: payload.initialStatus } : {}),
        } });
      },
    });
  }
}
