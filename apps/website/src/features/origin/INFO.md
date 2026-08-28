# origin Overview

Owns the trusted canonical-origin registry (ADR-040 v0): the single source of
truth for a workspace's public origin, and the single open-redirect and
egress-target oracles. No consumer may read the raw request `Host`/`:authority`
header for a canonical/link/allowlist/redirect decision — everything routes
through `OriginRegistryPort`.

## Responsibilities

- Resolve a workspace's verified canonical origin (`canonicalOrigin`), failing
  closed (`OriginNotVerifiedError`) when none is registered.
- Decide whether a candidate URL is a safe redirect target
  (`isAllowedRedirectTarget`): same-origin always allowed, cross-origin only
  via an exact-host allowlist.
- Decide whether a candidate URL is a safe third-party egress destination
  (`isAllowedEgressTarget`), backed by a separate allowlist from redirects.

## Rules

- `VerifiedOrigin.scheme` may only be `"http"` when `source ===
  "dev-capability"`. Always construct `VerifiedOrigin` values through
  `createVerifiedOrigin`, which enforces this — never build the object
  literal directly.
- The origin-setting store is the only source for canonical-origin decisions.
  A missing verified origin is a hard precondition failure, not a fallback
  to the request host.
- `isAllowedRedirectTarget` / `isAllowedEgressTarget` fail closed (`false`) on
  any parse failure, ambiguity, or unexpected error. They never throw to the
  caller.
- Candidate URLs are rejected before parsing if the raw string contains a
  backslash, whitespace, or a C0/DEL control character (defeats
  `https:/\evil.com`-style scheme-separator confusion). After parsing:
  non-`https` schemes, non-empty userinfo (`user@host`), and anything that
  fails to parse are rejected. The host is then lower-cased and a single
  trailing dot is stripped before comparison.
- Redirect and egress allowlists are separate per-workspace lists (exact host
  match only in v0 — no wildcard/suffix matching).

## Not in scope (v0)

- No SQLite/Drizzle adapter — library layer only. `InMemoryOriginSettingRepo`
  is the only `OriginSettingRepoPort` implementation.
- No HTTP wiring, no import-boundary CI canary for ADR-040 F2 (structural
  enforcement that only `origin/` may read the raw request host) — that is a
  separate cross-cutting change, not part of this library.
- No per-`siteId` host-mapped resolver (the rule-of-two second adapter for
  multi-site/custom-domain) — one `VerifiedOrigin` per `workspaceId`.
- No origin *verification* mechanism (reachability/DNS/ownership proof) — the
  repo just stores whatever `VerifiedOrigin` it's given; verifying it before
  registration is a v0.1 concern per the ADR's Open section.
- `originKey` (on `RedirectTargetContext`) and `locale`/`siteId` (on
  `OriginContext`) are accepted for interface parity with ADR-039's
  `RouteResolveContext` but are not yet consumed to select between multiple
  origins — v0 is single-origin-per-workspace.

## Future direction

When multi-site/custom-domain ships, add the second `OriginSettingRepoPort`
adapter that resolves by `siteId`/`originKey` instead of assuming one origin
per workspace, and wire origin verification (reachability or DNS/ownership
proof) into registration instead of accepting any `VerifiedOrigin` as given.
