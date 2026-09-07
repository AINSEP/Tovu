/**
 * @file Public surface (barrel) for the `http` Tier-2 core library (ADR-038).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint forbids deep
 * imports. This is INTERFACES AND TYPES ONLY, plus the single thrown class `EgressRefusedError`.
 * Deliberately does NOT export `HttpTransportAdapter` (ADR-038 amendment 3 — module-private to
 * this lib + the composition root) or `CreateHttpClient` (composition-root-only) — a consumer
 * imports `HttpClientPort` + `EgressPolicy` and nothing that could construct an unguarded client.
 *
 * `EgressRefusedError` is a runtime VALUE and is the deliberate exception to "types only"
 * (2026-09-07, SEC-05). It grants no construction capability — it is an `Error` subclass — and it
 * exists so a consumer can tell a policy REFUSAL apart from a transport failure with `instanceof`
 * rather than by matching a message string. See `errors.ts`'s own header for why message matching
 * is not an acceptable substitute at a tool boundary.
 */
export type { HttpRequest, HttpResponse, PinnedPeer } from "./types.js";
export type { EgressPolicy, HttpClientPort } from "./ports.js";
export { EgressRefusedError } from "./errors.js";
