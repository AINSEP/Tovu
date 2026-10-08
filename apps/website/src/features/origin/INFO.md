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

## Canonical owner and retained migration rationale

Generic contracts, registry, normalization and memory storage are imported directly from
`@jini-ai/http-kit/verified-origin`. Tovu retains configured-origin policy and SQL adapters.
The former ABI wrapper comments are retained verbatim below so security rationale survives
wrapper retirement; references to their former paths describe the pre-migration layout.

### Former origin.ts

```typescript
/**
 * @file `OriginRegistry` — the trusted canonical-origin registry (ADR-040 v0).
 *
 * Purpose:
 * Implements `OriginRegistryPort`: resolves a workspace's verified canonical
 * origin, and provides the single open-redirect and egress-target oracles
 * that every SEO/identity/newsletter/redirects/egress consumer must call
 * instead of trusting the raw request `Host` header.
 *
 * How it relates to the project:
 * - Depends only on `OriginSettingRepoPort` (`./ports`), never on a concrete
 * adapter — the SQL adapters remain separate host-owned implementations.
 * - `origin/repo.memory.ts` provides the in-memory double used here in tests
 * and by other libraries' tests.
 *
 * Architectural role: ADR-040. The package owns fixes F3 (open-redirect oracle
 * normalization) and F4 (egress-target oracle) from the ADR's internal-
 * verification round.
 *
 * Generic implementation and rationale: Jini packages/http-kit/src/verified-origin/origin.ts.
 * This adapter translates Tovu repository and URL-call contracts.
 */

// Implementation: /Users/la/Programming/Jini/packages/http-kit/src/verified-origin/origin.ts

/**
 * A same-origin comparable, fully normalized redirect/egress candidate. `scheme` includes
 * `"http"` only so a same-origin comparison against a `dev-capability` canonical origin (which
 * may legitimately be `http://localhost`) can match (ADR-040 Round-4 fold, round-2 audit finding
 * R2-005) — the cross-origin allowlist path still requires `https` unconditionally, enforced in
 * the package's `isAllowedTarget`, not here.
 *
 * Rejects forbidden raw characters, then parses with the WHATWG `URL` parser. Any parser throw is
 * a parse failure. Split out of {@link normalizeOriginCandidate} purely to keep that function's own
 * complexity below the repo's gate — the check, its order, and its meaning are unchanged.
 *
 * @returns The parsed `URL`, or `null` if `rawUrl` fails either check. Never throws.
 * @complexity O(n) in the length of `rawUrl` (parser-bound), O(1) space.
 *
 * Narrows a parsed URL's protocol to the two schemes this oracle ever accepts, or `null`.
 *
 * Resolves the candidate's effective port: the explicit port if one was given, else the scheme's
 * default (443 for `https`, 80 for `http`).
 *
 * @returns The port, or `null` if it is not a positive integer.
 *
 * Trusted canonical-origin registry (ADR-040). The only implementation of
 * `OriginRegistryPort` in this v0 slice; a per-`siteId` host-mapped resolver
 * is the plausible rule-of-two second adapter (ADR-040 §5), not built yet.
 *
 * Shared same-origin-or-allowlist decision used by both oracles above.
 * Isolated as its own function so the two public methods stay a one-line
 * pass-through to the correct allowlist source.
 *
 * @complexity O(k) where k = allowlist size.
 *
 * These constraints describe the package implementation; Tovu supplies only the storage adapter.
 * Cross-origin allowlist targets are HTTPS-only (ADR-040 amendment 8 / R2-005); the HTTP
 * dev-capability exception applies only to same-origin comparisons, never to cross-origin targets.
 * Fail closed: an unverified origin, a repo error, or any unexpected exception is never allowed.
 */

/**
   * Resolve the verified canonical origin for a workspace.
   *
   * @param context - workspace (and optionally site/locale) to resolve for.
   * `siteId` and `locale` are accepted for interface parity with ADR-039's
   * `RouteResolveContext` but are not yet used to select between multiple
   * origins in this v0 (single-origin-per-workspace) slice.
   * @returns the registered `VerifiedOrigin`.
   * @throws {OriginNotVerifiedError} if no origin is registered for the
   * workspace. Fails closed rather than guessing from the request host.
   * @complexity O(1) time/space (single repo lookup).
   */

/**
   * The single open-redirect oracle (ADR-040 F3). See `normalizeOriginCandidate`
   * for the rejection pipeline. Same-origin targets are always allowed;
   * cross-origin targets are allowed only via the workspace's exact-host
   * redirect allowlist.
   *
   * @param context - workspace (and optionally site/originKey) the redirect is
   * scoped to. `originKey` is accepted for `RouteResolveContext` parity
   * (ADR-040 F5) but is not yet consumed — v0 has one origin per workspace.
   * @param url - untrusted candidate redirect target.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * cross-origin `https` target. Fails closed (`false`) on any parse
   * failure, ambiguity, or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size (single Set lookup after
   * normalization), O(k) space for the allowlist Set.
   */

/**
   * The single third-party egress-target oracle (ADR-040 F4), backed by a
   * distinct per-workspace egress-destination allowlist. Same normalization
   * pipeline and fail-closed posture as `isAllowedRedirectTarget`.
   *
   * @param context - workspace (and optionally site) the egress call is scoped to.
   * @param url - untrusted candidate egress destination.
   * @returns `true` only if `url` is a verified same-origin or allowlisted
   * `https` target. Fails closed (`false`) on any parse failure, ambiguity,
   * or unexpected error — never throws.
   * @complexity O(k) where k = allowlist size, O(k) space.
   */

/**
 * Raw-string characters that must reject a candidate URL before it is ever
 * handed to the WHATWG parser: backslashes (scheme-separator confusion /
 * `https:/\evil.com` bypasses), whitespace, and C0/DEL control characters.
 * The URL parser silently strips some of these, which is exactly the
 * ambiguity ADR-040 F3 requires rejecting outright instead of tolerating.
 *
 * Load-bearing for the redirect READ path too, not just this oracle (t91 B2, 2026-09-16):
 * `features/redirects/phase-handler.ts` builds a relative location's oracle candidate by
 * CONCATENATING it onto the canonical origin, and Express's `res.redirect` does not percent-encode
 * `\`, so a stored template `\` plus a request tail `/evil.example` becomes `Location:
 * \/evil.example`, which a browser follows to `evil.example`. `platform/routing`'s
 * `checkSitePathname` cannot see that backslash — it reads an already-parsed pathname, where `\` is
 * already `/`. This raw check is what refuses it on read (pinned by
 * `phase-handler.read-path-target.test.ts`'s backslash cases). The redirect WRITE gate applies this
 * same predicate via {@link hasForbiddenRawUrlCharacter} so write and read agree — a target this
 * check would refuse must never be storable. Do not narrow this class without re-checking both
 * paths.
 *
 * The oracle's own raw-character rule, exported (t91 B2, 2026-09-16) so a write path that stores a
 * future candidate can refuse exactly what this oracle — and the read path built on top of it —
 * will refuse. See the package's `FORBIDDEN_RAW_CHARS`'s doc for why this class matters beyond this file.
 *
 * @param raw - The untrusted string exactly as received, BEFORE any `new URL()` parse. A parsed and
 * re-serialized URL can never fail this check (the parser already percent-encoded whitespace and
 * turned `\` into `/`), so running it on `url.href` checks nothing.
 * @returns `true` if `raw` contains a backslash, whitespace, or a C0/DEL control character.
 * @complexity O(n) in the length of `raw`.
 * @example hasForbiddenRawUrlCharacter("/a b"); // => true
 *
 * Generic predicate: Jini packages/http-kit/src/verified-origin/origin.ts; passes { raw }.
 */

/**
 * Parse and normalize a candidate redirect/egress URL per ADR-040 F3.
 *
 * Pipeline: reject forbidden raw characters -> parse with the WHATWG `URL`
 * parser (any throw is a parse failure) -> require `https:` or `http:` (an
 * `http` candidate survives ONLY to the same-origin comparison against a
 * `dev-capability` canonical origin — see `NormalizedTarget`; the cross-origin
 * allowlist path in `isAllowedTarget` re-enforces `https`-only) -> reject a
 * non-empty userinfo component -> lower-case + strip a single trailing dot
 * from the host (IDNA/punycode normalization and case-folding are already
 * performed by the `URL` parser itself) -> resolve an explicit or scheme-
 * default (443 for `https`, 80 for `http`) port.
 *
 * @param rawUrl - the untrusted candidate URL string.
 * @returns the normalized `{ scheme, host, port }`, or `null` if the
 * candidate fails any check. Never throws.
 * @complexity O(n) in the length of `rawUrl` (parser-bound), O(1) space.
 *
 * Generic normalization: Jini packages/http-kit/src/verified-origin/origin.ts; passes { rawUrl }.
 */

/**
 * THE same-origin rule: scheme equal, host equal after lower-casing and stripping one trailing dot,
 * effective port equal. Exported (t91 B1, 2026-09-16) so a caller deciding "is this candidate on
 * the workspace's own origin" never falls back to a URL-string `origin` comparison —
 * `new URL("https://site./x").origin` is `"https://site."`, a distinct string from
 * `"https://site"`, yet a request to either reaches the same server (browsers do keep them as
 * separate origins for cookies and scripting, which is exactly why a string comparison misses it).
 * The redirect oracle (the package's `isAllowedTarget`) and `features/redirects/reserved-destination.ts`'s
 * `checkSameOriginDestination` both call this exact function so "same origin" can never mean two
 * different things for the same candidate.
 *
 * PRECONDITION: `target` came from {@link normalizeOriginCandidate}. Only `canonical` is normalized
 * here; `target.host` is compared as given, so a hand-built `{ host: "Site." }` answers `false`.
 *
 * @param target - A candidate already normalized by `normalizeOriginCandidate`.
 * @param canonical - The workspace's verified origin, normalized here.
 * @complexity O(1).
 *
 * Generic comparison: Jini packages/http-kit/src/verified-origin/origin.ts; passes { target, canonical }.
 */
```

### Former ports.ts

```typescript
/**
 * @file Port contracts for the `origin` trusted canonical-origin registry.
 *
 * Purpose:
 * Declares `OriginRegistryPort` (the app-facing seam every SEO/identity/
 * newsletter/redirects/egress consumer depends on) and `OriginSettingRepoPort`
 * (the storage seam behind it), per ADR-040.
 *
 * Architectural role:
 * Dependency-inversion seam. No consumer outside this library may read the
 * raw request `Host`/`:authority` for a canonical/link/allowlist/redirect
 * decision (ADR-040 F2) — they call these ports instead.
 */

/** Context for resolving a workspace's canonical origin. */

/**
 * Context for a redirect-target check (ADR-040 F5: kept in parity with
 * `OriginContext` plus `originKey` for future multi-origin resolution).
 */

/** Context for an egress-target check. */

/**
 * The single trusted seam for canonical-origin, open-redirect, and
 * egress-target decisions (ADR-040 §1, F3, F4).
 */

/**
   * Resolve the verified canonical origin for a workspace.
   * @throws {import("@jini-ai/http-kit/verified-origin").OriginNotVerifiedError} if no verified origin
   * is registered — this is a fail-closed precondition, never a guess.
   */

/**
   * The single open-redirect oracle (ADR-040 F3). Same-origin targets are
   * always allowed; cross-origin targets are allowed only via the
   * workspace's explicit redirect allowlist (exact host match).
   * Fails closed (`false`) on any parse failure or ambiguity.
   */

/**
   * The single third-party egress-target oracle (ADR-040 F4), backed by a
   * separate per-workspace egress-destination allowlist. Fails closed
   * (`false`) on any parse failure or ambiguity.
   */

/**
 * Storage seam behind `OriginRegistryPort`: the verified origin plus the two
 * distinct per-workspace allowlists (redirect targets, egress targets).
 */

/** The workspace's verified origin, or `null` if none is registered yet. */

/** Exact-match hosts allowed as cross-origin redirect targets. */

/** Exact-match hosts allowed as third-party egress destinations. */
```

### Former repo.memory.ts

```typescript
/**
 * @file In-memory `OriginSettingRepoPort` double.
 *
 * Purpose:
 * Test/dev double for the origin-setting store: one `VerifiedOrigin` per
 * workspace plus that workspace's redirect and egress allowlists. SQL adapters remain host-owned; generic in-memory storage is delegated to Jini.
 *
 * Generic implementation and rationale: Jini packages/http-kit/src/verified-origin/repo.memory.ts.
 */

// Workspace-seed/host-allowlist rationale: Jini/packages/http-kit/src/verified-origin/repo.memory.ts.

/**
 * In-memory `OriginSettingRepoPort`. Seed it with one entry per workspace;
 * e.g. for local dev/tests, seed `{ scheme: "https", host: "localhost",
 * port: 3000, source: "dev-capability", verifiedAt: <now> }` as the
 * workspace's dev-capability origin.
 *
 * Translate Tovu scalar repository calls into Jini object arguments.
 * Jini owns normalization, validation and defensive copies; SQL repositories keep their contract.
 */
```
