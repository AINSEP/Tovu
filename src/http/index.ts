/**
 * @file Public surface (barrel) for the `http` Tier-2 core library (ADR-038).
 *
 * ADR-009 §1: a module's public contract is its `index.ts`; boundary lint forbids deep
 * imports. This is INTERFACES AND TYPES ONLY. Deliberately does NOT export
 * `HttpTransportAdapter` (ADR-038 amendment 3 — module-private to this lib + the composition
 * root) or `CreateHttpClient` (composition-root-only) — a consumer imports `HttpClientPort` +
 * `EgressPolicy` and nothing that could construct an unguarded client.
 */
export type { HttpRequest, HttpResponse, PinnedPeer } from "./types";
export type { EgressPolicy, HttpClientPort } from "./ports";
