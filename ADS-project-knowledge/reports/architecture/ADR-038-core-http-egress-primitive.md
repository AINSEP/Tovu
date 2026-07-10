# ADR-038: `core/http` — HttpClientPort + structural SSRF EgressPolicy

- Status: PROPOSED 2026-07-10 (from `/debate sweep-crosscutting-001`, 4-way consensus D3; round-2 re-audit `sweep-crosscutting-002` folded 2026-07-10 — see Round-2 amendments; owes the normal per-ADR audit before ACCEPTED)
- Extends: ADR-006 (rule-of-two), ADR-024 (§3 ABI; capability-mediated network), ADR-025 (egress lineage)
- Relates: ADR-036 (Integrations webhooks — the first consumer, but not the owner), ADR-034 (Newsletter HTTP mailer), ADR-035 (Analytics ForwardingSink), ADR-027 §6 (MediaIngressPolicy — the ingress mirror)
- Supersedes: `HttpClientPort` + `WebhookEgressPolicy` being declared inside `036-integrations-api`.
- Source: `tovu-v2-design.md` §3.5 line 83 (`http → HttpClientPort`, "mockable, rate-limitable"); debate consensus (see ADR-037 provenance).

## Context
`HttpClientPort` was declared only in Integrations (036) with an SSRF `WebhookEgressPolicy` enforced *inside the webhook adapter*, yet Newsletter (034 HTTP mailer) and Analytics (035 ForwardingSink) consume `HttpClientPort` by name without restating the egress guard. Three consumers referencing one feature-lib's port, with SSRF protection that doesn't extend to two of the three paths, is the design-time proof that "each adapter enforces it" fails.

## Decision
1. **Mint `HttpClientPort` in a new tiny Tier-2 core library `lib/http/`.** Integrations, Newsletter, Analytics all *consume* it. Generalize `WebhookEgressPolicy` → **`EgressPolicy`**.
2. **Enforcement is structural, not documentary.** The only production constructor returns a policy-enforcing decorator around a dumb transport — a consumer **cannot obtain an unguarded client**:
```ts
function createHttpClient(transport: HttpTransportAdapter, policy: EgressPolicy): HttpClientPort
// wrapper owns: https scheme allowlist, resolve-then-connect IP pinning, private-range/link-local/loopback/
// metadata (169.254.169.254) deny, redirect-hop re-verification, response-size cap, connect/read timeouts.
```
3. **Consumers receive the wrapped port by DI (core) or capability handle (plugins).** Per-consumer policy deltas are **narrowings passed as data** (e.g. Analytics restricts to its configured collector host); widening (dev localhost) is the existing `devHostAllowlist` + a named capability, never consumer code.
4. **ADR-006 rule-of-two:** guarded `undici`/fetch transport (built now — 036 is already building it) + in-memory/recording test double (built now). Plausible real second: the Electron `net` transport for the Tovu-Runner desktop host (Chromium network stack) — a genuinely different transport.

## Consequences
- SSRF safety becomes an inherited property of the port; Newsletter's mailer and Analytics' forwarding sink can't ship an egress hole.
- Integrations (036) keeps its `webhooks.*` domain but imports the port + policy from here; the "Webhook egress" naming that invited "that's not my policy" reasoning is gone.
- Analytics' `ForwardingSink` and Newsletter's `HttpApiMailerAdapter` are unblocked on a real, guarded client.

## Round-2 amendments (sweep-crosscutting-002, 2026-07-10 — 4/4 flagged the SSRF hole)
1. **Deny list must be address-family-complete (Primary+Codex+Gemini+Fable).** The v0 guard read IPv4-only — the classic bypass. Normative list: deny loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), link-local (`169.254.0.0/16`, `fe80::/10`), metadata (`169.254.169.254` + cloud equivalents), `0.0.0.0/8`, multicast/broadcast. **Normalize IPv4-mapped-IPv6 (`::ffff:a.b.c.d`) to IPv4 BEFORE classification.** Check EVERY A/AAAA/CNAME result; pin the exact vetted address through connect.
2. **Additional guards (Codex):** normalize IDNA/punycode; reject credentials-in-URL; **strip auth headers on cross-origin redirect**; re-run policy on every redirect + cap redirect hops; cap request bytes, response bytes, AND **decompressed** bytes; forbid proxy/CONNECT escape; preserve TLS SNI for the original hostname.
3. **"Structural" is only real if the dumb transport is unreachable (Fable+Codex).** Raw `HttpTransportAdapter` implementations are **module-private to `lib/http/` + the composition root, enforced by an import-boundary CI canary** (same pattern as ADR-022's write-chokepoint canary). Turns "cannot obtain an unguarded client" from aspirational into true.
4. **Transport contract carries the pinned IP (Codex):** `requestPinned(req: NormalizedHttpRequest, peer: { ip; port; authority; tlsServerName }): Promise<HttpResponseStream>` — the wrapper resolves+vets, the transport connects only to the pinned peer.
5. **Rate-limit seam reserved now (Primary):** the policy object reserves a rate-limit descriptor slot so adding pacing later is not an ADR-005 breaking change; add clause "untrusted fan-out consumers must supply a per-destination concurrency/budget limiter before production enablement."
6. **Consumes `core/origin` (ADR-040):** `EgressPolicy` allowlists derive from the `OriginRegistryPort`, not per-consumer host settings (see decisions doc §5 / ADR-040).

## Open
- Rate-limiting: §3.5 calls the port "rate-limitable"; whether the shared rate-limiter lives here or is a sibling primitive (cross-cuts Comments/Members/Analytics ingest too) — flag for the rate-limit primitive decision. (Seam reserved per amendment 5.)
- Whether resolve-then-connect pinning needs any transport-specific escape (belief: no — pass the pinned IP down as part of the transport request — ratified by amendment 4).

## Internal-verification fixes (TM-sweep-foundations-001, 2026-07-10)
- **Egress-allowlist ownership (F4).** A6's "allowlists derive from ADR-040" is corrected: ADR-040 `canonicalOrigin` is the workspace's OWN public origin, not a third-party egress destination. Egress-destination trust (e.g. `api.resend.com`, an analytics collector host) is answered by **ADR-040 `isAllowedEgressTarget(ctx, url)`** (added there) backed by a per-workspace egress-allowlist setting — never the raw request host, never an ad-hoc per-module host string. Per-consumer policy deltas remain narrowings validated against that setting.
