/** Existing Tovu HTTP contracts adapted to Jini's guarded, object-shaped ports. */
// Egress-contract rationale: Jini packages/platform/src/http/guarded/ports.ts.
// ADR-038/ADR-040: host allowlists come from origin.isAllowedEgressTarget, never per-consumer settings.
// Raw transports are composition-only; product consumers must receive createHttpClient's decorator.
import type { HttpRequest, HttpResponse } from "@jini-ai/core/primitives";
import type { EgressPolicy, PinnedPeer } from "@jini-ai/platform/http/guarded";
export type { HttpRequest, HttpResponse } from "@jini-ai/core/primitives";
export type { EgressPolicy, PinnedPeer } from "@jini-ai/platform/http/guarded";

/** Product consumers send an existing request through the guarded host boundary. */
export interface HttpClientPort {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/** Composition-only transport seam; the guard supplies the already-vetted peer. */
export interface HttpTransportAdapter {
  requestPinned(request: HttpRequest, peer: PinnedPeer): Promise<HttpResponse>;
}

export type CreateHttpClient = (
  required: { transport: HttpTransportAdapter; policy: EgressPolicy },
  optional?: Record<string, never>
) => HttpClientPort;
