# ADR-040: `core/origin` — the trusted canonical-origin registry (v0)

- Status: PROPOSED 2026-07-10 (greenlit in `/debate sweep-crosscutting-002`, owner ruling; Codex+Gemini surfaced it as a Wave-1 blocker; owes the normal per-ADR audit before ACCEPTED)
- Extends: ADR-006 (rule-of-two), ADR-007 (workspace scoping), ADR-024 (§3 ABI; capability-mediated)
- Relates: ADR-032 SEO (`canonicalUrl`), ADR-021 (magic-link URLs), ADR-034 Newsletter (confirm/unsubscribe links), ADR-033 Redirects (read-path host validation), ADR-038 (`EgressPolicy` allowlist), ADR-039 (`urlFor` composes `canonicalUrl` from this)
- Scope: v0 = only a verified canonical origin + a redirect-target host check. NOT permalink structure (ADR-039), NOT multi-region routing.
- Source: `sweep-crosscutting-decisions-20260710.md` §E; consensus `.local-artifacts/swarm-debate/20260710T171717Z-sweep-crosscutting-002-consensus.md`.

## Context
Five surfaces independently need a **trusted** public origin: SEO canonical URLs, identity magic-link URLs, Newsletter confirmation/unsubscribe links, Redirects read-path host validation, and the `EgressPolicy` host allowlist. In the sweep each derived origin from the **raw request host** or a **duplicated per-module setting**. Raw request host is attacker-controlled (host-header injection → poisoned canonical/magic-link/reset links; open-redirect). Duplicated settings drift. This is the classic "no trusted origin source" fracture, and it is load-bearing for Wave 1 because SEO, Members email, Newsletter sends, and Redirects all ship in the first two waves.

## Decision
1. **Mint a tiny Tier-2 core library `lib/origin/`** owning `OriginRegistryPort`. Every origin/host decision routes through it; no module reads the raw request host for a canonical/link/allowlist decision.
```ts
interface OriginRegistryPort {
  canonicalOrigin(ctx: { workspaceId: string; siteId?: string; locale?: string }): Promise<VerifiedOrigin>;
  isAllowedRedirectTarget(ctx: { workspaceId: string }, url: string): Promise<boolean>;
}
type VerifiedOrigin = {
  scheme: "https";
  host: string;
  port?: number;
  basePath?: string;
  verifiedAt: IsoDateTimeString;
  source: "workspace-setting" | "dev-capability";
};
```
2. **Source of truth = a verified workspace setting**, never the request host. The configured origin is verified (e.g. reachability / ownership check) and stamped `verifiedAt`; an unverified/absent origin fails closed (no canonical, no real-recipient send — consumers must treat a missing verified origin as a hard precondition, matching Newsletter's "must not ship to real recipients" gate).
3. **`isAllowedRedirectTarget`** is the single open-redirect oracle for Redirects' read-path (ADR-033) and any hook-supplied `location`; same-origin is always allowed, cross-origin only if on the workspace's explicit allowlist.
4. **Dev/preview** origins (localhost, preview hosts) come only via `source: "dev-capability"` — a named capability, never consumer code (mirrors ADR-038's widening-as-capability rule).
5. **ADR-006 rule-of-two:** single-origin workspace-setting adapter (built now) + a per-`siteId` host-mapped resolver for the multi-site/custom-domain case (genuinely different resolution) as the plausible second. In-memory double for tests.
6. **Freeze the port shape now** (ADR-005); iterate `VerifiedOrigin` contents later.

## Consequences
- Canonical URLs, magic-links, and newsletter links become host-header-injection-proof by construction.
- ADR-038 `EgressPolicy` allowlists and ADR-039 `canonicalUrl` derive from one verified source instead of five.
- Redirects' open-redirect check (write- AND read-path) has one owner.

## Open
- Origin **verification** mechanism (reachability vs DNS/ownership proof) — v0.1.
- Multi-site/custom-domain mapping detail (the rule-of-two second adapter) — needed only when multi-site ships.
- Whether `basePath` (sub-path installs) is in v0 or v0.1.

## Internal-verification fixes (TM-sweep-foundations-001, 2026-07-10)
Hardest-scrutiny pass (per audit instruction) caught 2 D4/D1 **blockers** + 2 clause gaps. Folded into the Decision:
7. **Structural enforcement (F2 — BLOCKER fix).** Reading the inbound request `Host`/`:authority` for any canonical/link/allowlist/redirect decision **outside `lib/origin/` is forbidden and enforced by an import-boundary CI canary** (same pattern as ADR-038 A3 / ADR-022 write-chokepoint). The raw request host is available to `lib/origin/` verification code only. A documentary rule cannot carry an always-on security invariant (INV-4).
8. **Open-redirect oracle normalization (F3 — BLOCKER fix).** `isAllowedRedirectTarget` MUST parse `url` with a **WHATWG-compliant parser**, reject non-`https`, reject any **userinfo** component, reject **backslashes / whitespace / control chars**, **IDNA/punycode-normalize + lower-case** the host, strip a single trailing dot, then compare normalized `host+port+scheme` against `canonicalOrigin(ctx)` for same-origin and the workspace allowlist (exact host, or explicit suffix rules) for cross-origin. **Any parse failure or ambiguity fails closed (`false`).** Defeats `//evil.com`, `https://good.com@evil.com`, `good.com.evil.com`, backslash / trailing-dot / case / IDNA-homoglyph bypasses.
9. **Egress-target oracle (F4).** Add `isAllowedEgressTarget(ctx: { workspaceId: string; siteId?: string }, url: string): Promise<boolean>` backed by a per-workspace egress-destination allowlist — the single oracle ADR-038 A6 consumes for third-party egress host trust (distinct from `canonicalOrigin`, which is the workspace's own origin).
10. **Context parity (F5).** `isAllowedRedirectTarget` (and `isAllowedEgressTarget`) take `ctx: { workspaceId; siteId?; originKey? }` to match `canonicalOrigin` + ADR-039 `RouteResolveContext`; freezing an asymmetric `{workspaceId}`-only ctx now would be a latent ADR-005 break (multi-site "same-origin" is per-site).
