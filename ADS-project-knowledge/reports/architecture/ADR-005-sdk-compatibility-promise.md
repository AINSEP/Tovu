# ADR-005: SDK Public API, Semver, and Deprecation Policy

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W4)
- Amended: 2026-07-08 (ADR-024 plugin execution & trust model, from a swarm planning debate) — adds the **transport-agnostic ABI rule** (§6)

## Context

WordPress's ecosystem moat is two decades of backward compatibility. An
ecosystem forms around a compatibility *promise*, not around features. The
promise must exist before the first third-party plugin, because it cannot be
added retroactively.

## Decision

1. **Public API = the exports of `@tovu/sdk`. Nothing else.** `@tovu/core`
   internals, server routes' internals, and shell internals are private even if
   technically importable; `package.json` `exports` maps block deep imports.
2. **Semver on the SDK:** breaking changes to any exported type/function/hook
   signature require a major; additive = minor; fixes = patch. Plugin manifests
   pin `sdkRange` (ADR-004) and the runtime refuses activation outside it.
3. **Deprecation ladder:** deprecate (typed `@deprecated` + runtime warning in
   dev) → warn (admin notice on activation) → remove, spanning at least two
   minors, with a documented migration note per deprecation.
4. **The promise is enforced by tests:** a public-API snapshot test pins the
   SDK surface (types + runtime exports); changing it fails CI unless the
   change is explicitly acknowledged in a changeset. Contract tests double as
   the executable spec for what plugins may rely on.
5. Hook points, capability names, event names, and manifest fields are part of
   the public surface and follow the same ladder.
6. **Transport-agnostic ABI (amendment 2026-07-08, ADR-024 §3).** The SDK
   hook/callback surface is frozen **as if a process boundary already existed**,
   even while v1 runs in-process: hooks are **asynchronous only** (no synchronous
   hook may block the shared multi-site host event loop), payloads are
   **serializable only** (structured-clone-safe), and **no live core objects**
   cross the SDK surface — capabilities are passed **by handle, not by
   reference**. Rationale: under the semver promise (§2), switching
   sync→async or live-object→serializable once third-party plugins exist is an
   ecosystem-wide breaking change that cannot be retrofitted; freezing it now
   (zero third parties) is what keeps Tier-2 out-of-process isolation a later
   runtime swap (ADR-024 §4) rather than an ecosystem rupture. SPEC-005's single
   existing hook (`content.entry.beforeSave`) must be audited against this rule
   now. This is part of the public surface and follows the same ladder.

## Consequences

- Slower churn on anything exported — by design. Iterate in `@tovu/core` and
  promote to the SDK deliberately; the SDK starts *small*.
- First-party plugins must live within the same promise (no private-API back
  doors — the Gutenberg anti-pattern is an explicit failure condition).
