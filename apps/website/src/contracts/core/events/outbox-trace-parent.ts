import type { DomainEvent } from "@jini-ai/core/contracts/events";
import { captureOutboxTraceParent as capture, readOutboxTraceParent as read, withoutOutboxTraceParent as strip } from "@jini-ai/infra/events/outbox-trace-parent";

/**
 * @file The host-owned trace parent an outbox row carries from its producer to its background worker.
 *
 * Why it is persisted at all: the drainer delivers on its own timer, long after the producing request
 * has answered. Whatever trace context that timer inherited is neither durable (a restart or another
 * process drains the row) nor attributable to the right request (the timer was scheduled by whatever
 * ran before it). So the producer's parent is captured inside the enqueue write and read back at
 * delivery, never inherited.
 *
 * What is persisted: one reserved `metadata` value holding a W3C `traceparent` (version 00, nonzero
 * trace and span ids). Nothing else from the request: no baggage, cookies, credentials or headers.
 * The value is written on a copy of the envelope and always replaces whatever the producer put under
 * the same key, so a caller can never smuggle its own parent into the trace. It lives beside the
 * payload, never in it, and delivery strips it before subscribers run, so it cannot reach business
 * handlers or outward webhook data.
 */

/** The reserved envelope metadata key. Only this module writes or reads it. */
export const OUTBOX_TRACEPARENT_METADATA_KEY = "tovu.outbox.traceparent";

export function captureOutboxTraceParent(
  { activeTraceparent }: { activeTraceparent: () => string | undefined },
  _optional = {}
) {
  return capture({ activeTraceparent, metadataKey: OUTBOX_TRACEPARENT_METADATA_KEY });
}

export function readOutboxTraceParent({ event }: { event: DomainEvent }, _optional = {}): string | undefined {
  return read({ event, metadataKey: OUTBOX_TRACEPARENT_METADATA_KEY });
}

export function withoutOutboxTraceParent({ event }: { event: DomainEvent }, _optional = {}): DomainEvent {
  return strip({ event, metadataKey: OUTBOX_TRACEPARENT_METADATA_KEY });
}
