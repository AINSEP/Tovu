/** Tovu's consumer-facing HTTP port; construction stays at the composition boundary. */
// ADR-009 / ADR-038: keep transport adapters and client constructors out of this barrel so a
// consumer receives a guarded port without the capability to construct an unguarded client.
// The error class is a deliberate runtime exception: instanceof distinguishes policy refusal
// from transport failure without fragile message matching, and grants no construction capability.
export type { HttpRequest, HttpResponse } from "@jini-ai/core/primitives";
export type { PinnedPeer, EgressPolicy } from "@jini-ai/platform/http/guarded";
// Binary/truncation rationale: Jini/packages/core/src/primitives/http.ts; SNI: platform/src/http/guarded/types.ts.
// Refusal/redaction rationale: Jini/packages/platform/src/http/guarded/errors.ts.
// ADR-038 / SEC-05: agent boundaries must surface a recognizable, caller-safe egress refusal.
export { EgressRefusedError } from "@jini-ai/platform/http/guarded";
export type { HttpClientPort } from "./ports.js";
