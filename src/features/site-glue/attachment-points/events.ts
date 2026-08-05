/**
 * @file `subscribeGlueEvent()` — the async "this happened" attachment point (SPEC-048 REQ-5/REQ-8;
 * ADR-057 Decision 2's `events.subscribe` adapter row).
 *
 * Purpose:
 * REQ-8's conclusion for this category, confirmed correct by ADR-057 Decision 4: no new containment
 * mechanism is needed. The outbox's own retry/dead-letter semantics (`core/events`, ADR-009) already
 * require every handler to be idempotent, and that requirement applies identically whether the
 * handler belongs to core or to a glue module — this attachment point does not wrap, retry, or
 * isolate anything of its own; it delegates straight to {@link GlueHostPort.subscribeEvent}, whose
 * real implementation is expected to register the handler on the host's live `EventBusPort`
 * (`src/core/events`), so delivery inherits the SAME retry/dead-letter path a real outbox event
 * already goes through.
 *
 * Product-neutral core: depends only on `../ports` (the frozen `GlueHostPort` seam). No import of
 * `core/events` or any concrete bus/outbox implementation.
 *
 * Architectural role:
 * Implementation Outline slice 4 (ADR-057, Implementation Outline). Depends on slice 1's frozen
 * `manifest.ts`/`ports.ts` contracts. Independent of slices 2 and 3.
 */
import type { GlueHostPort } from "../ports";

export interface SubscribeGlueEventRequired {
  readonly moduleId: string;
  readonly eventName: string;
  /** The glue module's already-obtained handler. Idempotency is the module author's
   * responsibility, matching every other outbox subscriber in this codebase (ADR-009's
   * consequence) — this function does not, and cannot, verify that property. */
  readonly handler: (payload: unknown) => Promise<void> | void;
  readonly hostPort: Pick<GlueHostPort, "subscribeEvent">;
}

export type SubscribeGlueEventOptional = {};

/**
 * Subscribes one glue module's handler to one named event via the host port. Pure delegation — no
 * containment logic of its own, matching REQ-8's conclusion that this category needs none beyond
 * what the outbox already provides.
 *
 * @throws Whatever `hostPort.subscribeEvent()` itself throws — never caught here.
 * @complexity O(1) — a single delegated call.
 * @overallScore 100/100
 */
export function subscribeGlueEvent(
  required: SubscribeGlueEventRequired,
  _optional: SubscribeGlueEventOptional = {}
): void {
  const { moduleId, eventName, handler, hostPort } = required;
  hostPort.subscribeEvent(moduleId, eventName, handler);
}
